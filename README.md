# kamin-bridge-webclient

Browser client for Open Claude Bridge. It runs in a container: the agent works there as it would on a local machine, and the UI opens in a browser. The page is thin; closing and reopening it does not interrupt the agent.

## What this repository is

This is a **copy** of the web-client part of [dykamino-coder/gpui-kamin-ide](https://github.com/dykamino-coder/gpui-kamin-ide). The copied paths keep the monorepo layout, so the build and the `Dockerfile` work unchanged:

| Path | Role |
|---|---|
| `extensions/claude-bridge/workspace/` | The service in the container: files, shell, MCP, hooks, sessions, browser server, credentials, Module Federation preview proxy. `Dockerfile`, `PACKAGING.md`, `DESIGN.md`, `CREDENTIALS.md` live here. |
| `extensions/claude-bridge/webview/` | The UI panels shared with KaminIDE. The browser entry is `src/browser/`. |
| `extensions/claude-bridge/extension/` | The shared Bridge client runtime the workspace host reuses. |
| `extensions/claude-bridge/workspace/HEADLESS.md` | `@kaminide/bridge-workspace-host`: the same service without a UI, for embedding in another application. Example: `workspace/examples/embedding/`. |
| `extensions/claude-bridge/browser-client/` | `@kaminide/bridge-browser-client`: the framework-agnostic browser client the UI itself uses. |
| `extensions/claude-bridge/server/package.json` | Bridge server version; the embedding packages are versioned with it. |
| `extensions/claude-bridge/server/src/ui/src/lib/terminal-console/` | Terminal console code used by the browser build. |
| `src/`, `package.json`, `package-lock.json`, `tsconfig.json` | Node host code from the monorepo that the container build includes. |
| `builtin-extensions/claude-bridge/package.json` | Version source. |

Source snapshot: see `UPSTREAM.txt`. To refresh it from the monorepo, run `scripts/sync-from-monorepo.sh <path-to-gpui-kamin-ide> [<ref>]`. Synced paths are overwritten by every sync: change them in the monorepo, not here. Release tarballs of both packages are attached to the monorepo's GitHub Releases.

## Build and run

Read `extensions/claude-bridge/workspace/PACKAGING.md` for the full steps. In short, from the repository root:

```bash
podman build -f extensions/claude-bridge/workspace/Dockerfile --ignorefile extensions/claude-bridge/workspace/containerignore -t kamin-bridge-webclient .
```

The UI is published on loopback (`127.0.0.1`) by default. The container creates and keeps its own credentials in its volume, so there is no sign-in page on loopback.
