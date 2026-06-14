# Roblox 2.0

A standalone **game platform** — not a single game, but the whole stack:
a real 3D game engine, accounts, live multiplayer, a game browser, avatar
customization, an in-app game **Studio** (editor), asset uploads, friends &
chat, and persistent data. It runs as a desktop app (with an installer) and
also straight from a browser.

> **Honest scope note.** This is a genuine, working platform built on a
> coherent architecture — you can register, customize an avatar, build a game
> in Studio, publish it, and play it with other people in real time. It is
> *not* a byte-for-byte clone of Roblox Corporation's proprietary engine,
> global server fleet, Luau VM or moderation systems. It is a faithful,
> fully-functional implementation of the same *ideas*.

---

## Quick start (runs in ~10 seconds)

```bash
npm install        # installs the server's one dependency (ws)
npm start          # starts the platform
```

Then open **http://localhost:3000**. Log in as `Roblox` / `admin`, or
register your own account. Open two browser windows to see live multiplayer.

## Run as the desktop app

```bash
npm run desktop    # installs Electron and launches the native window
```

## Build an installer (.exe / .dmg / .AppImage)

```bash
cd desktop
npm install
node vendor.js     # (optional) vendor three.js for fully-offline builds
npm run dist       # build for the current OS  -> ../dist/
npm run dist:win   # Windows NSIS installer
npm run dist:mac   # macOS dmg
npm run dist:linux # Linux AppImage + deb
```

The installer bundles the server + client + Electron shell. On launch the app
starts its own local platform server and opens the client window. User data is
stored in the OS user-data directory so it survives updates.

---

## What's included

| Feature | Where |
| --- | --- |
| **3D game engine** (rendering, physics, character controller, camera) | `client/src/engine/` |
| **Multiplayer networking** (authoritative rooms, 20 Hz snapshots, chat) | `server/src/realtime/`, `client/src/net.js` |
| **Account system** (scrypt hashing, signed tokens) | `server/src/api/accounts.js`, `server/src/auth.js` |
| **Game browser / discovery** | `client/src/ui/browse.js` |
| **Avatar customization** | `client/src/ui/avatar.js`, `client/src/engine/character.js` |
| **Game Studio / editor** | `client/src/ui/studio.js` |
| **Asset uploading & management** | `client/src/ui/assets.js`, `server/src/api/assets.js` |
| **Friends, chat & social** | `client/src/ui/social.js`, `server/src/api/social.js` |
| **Data saving & persistence** | `server/src/db.js`, datastore + leaderboards |
| **Publishing & playing many games** | seeded library + Studio publish flow |

## How to play

- **WASD** move · **Space** jump · **Shift** run · **Mouse** look
  (click the canvas to capture the mouse) · **Enter** to chat.
- In shooter games, **click** to fire.
- Collect coins, hit checkpoints, reach the gold pad to win.

## How to build a game

1. Go to **Studio → Create New Game** (start empty or from a template).
2. Add parts (box / sphere / cylinder), move/scale/recolor them.
3. Give parts **behaviors**: `coin`, `kill`, `checkpoint`, `win`, `boost`.
4. **Save**, then **Publish**. Your game appears in Discover for everyone.

## Architecture

```
Desktop shell (Electron)  ──>  installer via electron-builder
  └─ forks the platform server (Node, pure-JS, zero native deps)
        • REST API (accounts, games, assets, social)
        • WebSocket gateway (presence, chat, authoritative game rooms)
        • Document store with atomic writes (persistence)
        • serves the game client
              │
  Game client (Three.js)  ── also runs in any browser
        • engine: render + physics + character + camera
        • UI: login, discover, avatar, studio, friends, play
```

See `INSTALL.md` for detailed setup and troubleshooting.
