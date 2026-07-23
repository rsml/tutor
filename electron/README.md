Up: [ARCHITECTURE.md](../ARCHITECTURE.md)

# electron/

`main.ts` creates the app window, starts the Fastify server in process on a random localhost port, and owns every privileged IPC handler. That handler covers secure API key storage, the redux-persist file store, save and open-file dialogs, and the busy-state confirmation on quit.

`preload.ts` exposes that IPC surface to the renderer as `window.electronAPI` through `contextBridge`, the sandboxed renderer's only path to Node or Electron.

## Three modes

| Mode | Command | Renderer loads from | Origin header |
|---|---|---|---|
| Dev | `pnpm electron:dev` | `http://localhost:5173` | `http://localhost:5173` |
| Preview | `pnpm electron:preview` | `file://…/dist/index.html` | `null` |
| Build | `pnpm electron:build` | `file://…/app.asar/dist/index.html` | `null` |

## Non-negotiable constraints

- Server communication always uses `127.0.0.1` and never `localhost`, to avoid the IPv6 mismatch `localhost` can hit on macOS.
- `isAllowedOrigin` in `server/index.ts` accepts a `null` origin for the file protocol, plus any `localhost` or `127.0.0.1` origin.
- `connect-src` lists both `http://localhost:*` and `http://127.0.0.1:*`, in both the `index.html` meta tag and the header `main.ts` sets on `webRequest.onHeadersReceived`.
- `.npmrc` sets `node-linker=hoisted`, the layout electron-builder needs.
- The `external()` function in `vite.config.ts` decides what survives into `dist-electron/`, since the Electron main build does not inherit the root Vite config.
- The source `index.html` never gets rewritten to match build output. `dist/` is the build target, not the other way around.

## Verifying a packaging change

Check all three modes, not only dev, since dev never touches `dist-electron/` at all.

`scripts/bundle-fingerprint.sh` automates the part that matters most. It greps the built main-process files for every specifier that survived bundling and prints them sorted. Diffing that output from before a refactor to after one catches whatever escaped `external()`, before the packaged app dies at launch instead of after.

Related: [client/README.md](../client/README.md), [server/README.md](../server/README.md), [shared/README.md](../shared/README.md), [0006-electron-packaging-constraints.md](../docs/adr/0006-electron-packaging-constraints.md)
