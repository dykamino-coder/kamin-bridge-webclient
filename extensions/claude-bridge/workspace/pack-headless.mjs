// Pack the UI-less workspace host as an installable npm tarball:
//   node pack-headless.mjs [--pre <prerelease>] [--out <directory>]
// The package holds one CommonJS bundle (the same composition as cli.ts, minus
// the webview) and declares the runtime packages the bundle keeps external.
// An embedder installs the tarball and calls startHeadlessWorkspace(); it does
// not need this repository, its build, or the browser UI.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const readJson = file => JSON.parse(fs.readFileSync(path.join(here, file), 'utf8'))
const argument = name => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

const engineVersion = readJson('../../../builtin-extensions/claude-bridge/package.json').version
const pre = argument('--pre')
if (pre && !/^[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/.test(pre)) throw new Error('--pre must be a semver prerelease, e.g. studio.1')
const version = pre ? `${engineVersion}-${pre}` : engineVersion
const destination = path.resolve(argument('--out') ?? path.join(here, 'dist-headless'))
const stage = path.join(destination, 'package')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

// Same options as the runtime/cli build in build.mjs: one graph, one BridgeHost.
const result = await build({
  absWorkingDir: here,
  entryPoints: { headless: 'src/headless.ts' },
  outdir: stage,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: { BRIDGE_VERSION: JSON.stringify(engineVersion) },
  packages: 'external',
  alias: {
    vscode: path.join(here, 'src/environment.ts'),
    '@kaminide/host-compat': path.join(here, '../extension/src/shim/host-compat.ts'),
  },
  logOverride: { 'import-is-undefined': 'error' },
  metafile: true,
})

// Runtime packages: everything the upstream runtime image installs (workspace
// and repository-root production dependencies). The workspace range wins.
const workspace = readJson('package.json')
const root = readJson('../../../package.json')
const dependencies = { ...root.dependencies, ...workspace.dependencies }

// Every package the bundle imports statically must be declared; otherwise the
// tarball would install cleanly and fail at first require.
const builtins = new Set(builtinModules)
const packageName = specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
const missing = new Set()
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (!imported.external || imported.path.startsWith('node:') || builtins.has(packageName(imported.path))) continue
    if (!dependencies[packageName(imported.path)]) missing.add(packageName(imported.path))
  }
}
if (missing.size) throw new Error(`Bundle imports undeclared packages: ${[...missing].sort().join(', ')}`)

fs.copyFileSync(path.join(here, 'headless.d.ts'), path.join(stage, 'headless.d.ts'))
fs.writeFileSync(path.join(stage, 'README.md'), [
  '# @kaminide/bridge-workspace-host',
  '',
  'The Kamin Bridge workspace service without the browser UI. Built from',
  '`extensions/claude-bridge/workspace` of kamin-bridge-webclient by `pack-headless.mjs`;',
  'see `HEADLESS.md` there for the contract.',
  '',
].join('\n'))
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  name: '@kaminide/bridge-workspace-host',
  version,
  description: 'Kamin Bridge workspace service without the browser UI, for embedding.',
  main: './headless.cjs',
  types: './headless.d.ts',
  exports: { '.': { types: './headless.d.ts', default: './headless.cjs' } },
  files: ['headless.cjs', 'headless.d.ts', 'README.md'],
  engines: workspace.engines,
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + '\n')

const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', destination], {
  cwd: stage, encoding: 'utf8', shell: process.platform === 'win32',
}))
process.stdout.write(`${path.join(destination, packed.filename)}\n`)
