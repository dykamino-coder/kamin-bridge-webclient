# Headless workspace host

`@kaminide/bridge-workspace-host` is the workspace service of this repository
without the browser UI: shared BridgeHost, files, shell, terminals, MCP, hooks,
skills, plugins, user tools and the Module Federation preview proxy. An
embedding application brings its own sign-in policy and its own UI.

It exists for ATON Studio ("Студия"), a browser IDE for non-programmers. Studio
runs one workspace container next to its site. The site serves a React UI on
the corporate design system, signs users in through Keycloak and reverse-proxies
`/auth/login`, `/bridge` and `/preview/*` to the workspace. The workspace is
never reachable directly.

## Why a separate entry

Before this entry Studio had to copy the composition from `src/cli.ts` and
import engine sources by path (`runtime.ts`, `shell-state.ts`,
`credentials.ts`), then bundle them itself with the same esbuild aliases. Every
change of that wiring here would silently break Studio. `src/headless.ts` keeps
the composition in this repository and exposes one call.

## Contract

```ts
import host from '@kaminide/bridge-workspace-host'

const workspace = await host.startHeadlessWorkspace({
  root: '/workspace',                       // project directory, must exist
  storage: '/home/workspace/.local/state/bridge',
  serverUrl: 'ws://bridge-server:3456',
  origin: 'http://studio-workspace:3460',   // exact Host/Origin the proxy presents
  bind: '0.0.0.0',
  port: 3460,
  auth,                                     // HeadlessAuth, see below
})
await workspace.close()
```

- `auth` implements `HeadlessAuth`: `login`, `loginLocal`, `validate`, `logout`,
  `cookieHeader`. The server calls nothing else. The cookie name is
  `SESSION_COOKIE` and the value must pass `readSessionCookie` (43 base64url
  characters). Studio's `login` verifies an HMAC-signed assertion minted by its
  site after a Keycloak check; the Bridge token never reaches a browser.
- `serveApp` is optional. Without it every non-API `GET` answers
  `503 {"error":"Browser UI is not installed"}`.
- Loopback auto-login is always off.
- Credentials behave as in `CREDENTIALS.md`: first start registers on the
  Bridge server or consumes `BRIDGE_TOKEN` / `BRIDGE_TOKEN_FILE` from `env`
  once; later starts read the stored file.
- One instance per process (`createSharedBackend` owns process-wide registries).
- `workspace.preview` is the live `WorkspacePreview` (`copy`, `unmount`,
  `onRemount`).

The package also exports `version`, `SESSION_COOKIE`, `readSessionCookie` and
`resetCredentials`.

## Build and pack

```sh
npm --prefix extensions/claude-bridge/workspace run build         # dist/headless.cjs
npm --prefix extensions/claude-bridge/workspace run pack:headless -- --pre studio.1
# -> dist-headless/kaminide-bridge-workspace-host-<engine version>-studio.1.tgz
```

`pack-headless.mjs` bundles `src/headless.ts` with the options of the
runtime/cli build, declares the workspace and repository-root production
dependencies, and fails if the bundle imports a package that is not declared.
The tarball contains `headless.cjs`, `headless.d.ts`, `package.json` and
`README.md`; no webview, no sources.

Studio installs the tarball from a GitHub release asset of this repository. Its
CI has no direct internet access and reads GitHub through a corporate proxy, so
the asset URL must stay stable:
`releases/download/<tag>/kaminide-bridge-workspace-host-<version>.tgz`.

## Verified

- `tsc --noEmit -p tsconfig.runtime.json` passes with `src/headless.ts` included.
- The tarball installs into an empty directory and starts: sign-in through a
  custom `HeadlessAuth`, `GET /` 503, `GET /preview/state` 401 without a cookie
  and 200 with it, `/bridge` WebSocket upgrade accepted.

Not verified here: a live session against a Bridge server, and the Linux
container run.

## Requested from the maintainers of this repository

This entry is the minimum Studio needs. Rework it as you see fit, keeping the
contract above or telling Studio what changed.

1. **Make `cli.ts` call `startHeadlessWorkspace`** so there is one composition,
   not two. It was left untouched here to keep the change reviewable.
2. **Generate `headless.d.ts`** from `src/headless.ts`. It is hand-written now
   and can drift.
3. **Publish from CI**: on a tag, run `pack-headless.mjs` and attach the tarball
   to the release. The first release was packed by hand.
4. **Push preview state over `/bridge`**. Studio's UI polls `GET /preview/state`
   once a second because there is no event; `WorkspacePreview.onRemount` already
   exists on the host side. A subscribable channel would remove the poll.
5. **Several users on one workspace.** Studio currently lets every signed-in
   employee into one shared workspace. The engine assumes a single owner: one
   Bridge identity, one tab set, one draft state. Say which of that is safe to
   share and which needs a per-user boundary.
6. **Browser client package** `@kaminide/bridge-browser-client`: the
   framework-agnostic transport and channel facade described in
   `../STUDIO-CLIENT-SPEC.md`. Studio carries a local implementation of that
   contract until the package exists.
