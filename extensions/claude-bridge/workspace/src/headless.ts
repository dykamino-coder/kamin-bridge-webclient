// Headless embedding entry: the complete workspace service (shared BridgeHost,
// files, shell, terminals, MCP, hooks, skills, preview proxy) WITHOUT the
// browser UI. An embedding application supplies its own sign-in policy and,
// optionally, its own static assets; everything else is composed exactly as in
// cli.ts, so an embedder never copies that wiring and never imports engine
// internals by path.
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createBrowserEnvironment, startWorkspaceServer, WorkspaceFiles, TerminalWorkspaceBackend,
  withBrowserServer, WorkspacePreview,
} from './index.js'
import type { WorkspaceAuth } from './auth.js'
import { createSharedBackend } from './runtime.js'
import { withWorkspaceShell } from './shell-state.js'
import { loadCredentials, resetCredentials } from './credentials.js'
declare const BRIDGE_VERSION: string

/** Engine version this build was produced from. */
export const version: string = BRIDGE_VERSION

export { SESSION_COOKIE, readSessionCookie } from './auth.js'
export { resetCredentials }
export type { PreviewDescriptor } from './preview.js'

/** Sign-in policy of the embedding application. The server calls exactly these
 * members; the cookie value must satisfy readSessionCookie (43 base64url chars). */
export interface HeadlessAuth {
  /** `candidate` is the `token` field of the POST /auth/login body. Returns a cookie value or null. */
  login(candidate: unknown): Promise<string | null>
  /** Loopback auto-login. A headless service never enables it; return null. */
  loginLocal(): Promise<string | null>
  validate(cookie: string | undefined): Promise<boolean>
  logout(cookie: string | undefined): void
  cookieHeader(cookie: string, secure: boolean): string
}

export interface HeadlessWorkspaceOptions {
  /** Project directory the agent works in. Must exist. */
  root: string
  /** Private state directory (credentials, sessions, drafts). Keep it on a persistent volume. */
  storage: string
  /** Bridge server origin or /ws/session URL (ws, wss, http or https). */
  serverUrl: string
  /** Exact origin the service is addressed by; Host and Origin of every request must match it. */
  origin: string
  bind?: string
  port?: number
  auth: HeadlessAuth
  /** Optional trusted static assets. Without it non-API GET requests answer 503. */
  serveApp?: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  /** Source of the one-time bootstrap secret (BRIDGE_TOKEN / BRIDGE_TOKEN_FILE). Defaults to process.env. */
  env?: NodeJS.ProcessEnv
  onWatchError?: () => void
}

export interface HeadlessWorkspace {
  /** Module Federation preview state owned by this process. */
  readonly preview: WorkspacePreview
  close(): Promise<void>
}

/** Start the workspace service without a UI. One instance per process: the
 * shared handler registries are process-wide (see createSharedBackend). */
export async function startHeadlessWorkspace(options: HeadlessWorkspaceOptions): Promise<HeadlessWorkspace> {
  const root = fs.realpathSync(options.root)
  const storage = path.resolve(options.storage)
  const publicUrl = new URL(options.origin)
  if (publicUrl.origin !== options.origin || !['http:', 'https:'].includes(publicUrl.protocol)) {
    throw new Error('Invalid browser origin')
  }
  const env = options.env ?? process.env
  const { token } = await loadCredentials(storage, options.serverUrl, env)
  // The bootstrap secret is consumed once; it must not leak into agent shells.
  delete env.BRIDGE_TOKEN
  delete env.BRIDGE_TOKEN_FILE

  const preview = new WorkspacePreview()
  const browser = createBrowserEnvironment({ root, preview })
  const backend = createSharedBackend({
    root, storage, serverUrl: options.serverUrl, token, version: BRIDGE_VERSION, environment: browser.environment,
  })
  const shell = withWorkspaceShell(backend, path.join(storage, 'workspace-shell.json'))
  const files = new WorkspaceFiles(browser.wrap(withBrowserServer(shell, { serverUrl: options.serverUrl, token })), {
    root,
    onWatchError: options.onWatchError ?? (() => { process.stderr.write('Bridge workspace file watch failed.\n') }),
  })
  const terminals = new TerminalWorkspaceBackend(files, root)
  const dispose = () => {
    try { terminals.dispose() } finally { try { files.dispose() } finally { backend.dispose() } }
  }
  let server: Awaited<ReturnType<typeof startWorkspaceServer>>
  try {
    server = await startWorkspaceServer({
      bind: options.bind, port: options.port, origin: options.origin, autoLogin: false,
      // The server only calls the HeadlessAuth members; WorkspaceAuth is a class
      // with private state, so the structural match needs an explicit cast.
      auth: options.auth as unknown as WorkspaceAuth,
      backend: terminals, serveApp: options.serveApp, preview,
    })
  } catch (error) { dispose(); throw error }

  let closed: Promise<void> | undefined
  return {
    preview,
    close() {
      closed ??= (async () => { dispose(); await server.close() })()
      return closed
    },
  }
}
