# Installing & Running Roblox 2.0

## Requirements
- **Node.js 18+** (tested on Node 22). That's it for the web/server mode.
- For building native installers: a desktop OS (Windows/macOS/Linux) where
  `electron-builder` can run.

## Option A — run from source (fastest)

```bash
git clone <this repo>
cd Roblox2.0
npm install
npm start
```

Open http://localhost:3000. Change the port with `PORT=4000 npm start`.

Demo account: **Roblox / admin**. Or click "Sign up" to make your own.

To test multiplayer locally, open the URL in two browser windows / profiles,
log into different accounts, and join the same game.

## Option B — desktop app (development)

```bash
npm run desktop
```

This installs Electron, launches a native window, and the app boots its own
local server automatically.

## Option C — build an installer

```bash
cd desktop
npm install
node vendor.js            # optional: makes the build fully offline
npm run dist              # current OS
# or: npm run dist:win / dist:mac / dist:linux
```

Artifacts are written to `dist/`:
- Windows: `Roblox2.0-Setup-1.0.0.exe` (NSIS installer)
- macOS: `Roblox2.0-1.0.0.dmg`
- Linux: `Roblox2.0-1.0.0.AppImage` and `.deb`

> Cross-compiling is limited: build the Windows installer on Windows, the dmg
> on macOS, etc. (electron-builder's standard constraint).

## Where is my data?
- **From source:** `server/data/*.json`
- **Desktop app:** the OS user-data folder (e.g. `%APPDATA%/Roblox 2.0/data`
  on Windows, `~/Library/Application Support/Roblox 2.0/data` on macOS).

Each JSON file is one collection (users, games, assets, datastore). Writes are
atomic (temp file + fsync + rename) so a crash won't corrupt your data.

## Configuration (env vars)
| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket port |
| `DATA_DIR` | `server/data` | where collections are stored |
| `AUTH_SECRET` | dev secret | HMAC secret for session tokens — **set this in production** |

## Troubleshooting
- **Blank 3D view / "three" import error:** the browser needs internet to
  fetch Three.js from the CDN on first load (or run `node desktop/vendor.js`
  to vendor it locally). Then hard-refresh.
- **Mouse won't look around:** click the game canvas once to capture the
  pointer (pointer-lock). Press `Esc` to release.
- **Port already in use:** start with a different `PORT`.
- **Multiplayer not syncing:** make sure both clients hit the same server
  origin; the WebSocket connects to the same host that served the page.
