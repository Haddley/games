# Shared TV lobby — `tvLobby` (repo-wide)

The big-screen **"waiting for players"** page. boggleparty's version was the best, so
it was generalised into `tvLobby(opts)` in `common.js` and rolled out to every game.
Layout: game **title**, "scan to join", a big **square QR** on the left, **ROOM CODE**
+ settings on the right, a captain hint, **player chips** (or "Waiting for players…"),
and a ⛶ fullscreen button.

## Usage

Each game's viewer-lobby render returns a single `tvLobby({...})` (no `tvShell`
wrapper — it's a full-screen `position:fixed` layout):

```js
function renderViewerLobby() {
    const players = vD.players || [];
    return tvLobby({
        title: 'HERD MIND',
        accent: '#7be38b',              // themes the title + code (falls back to var(--gold))
        roomCode: vD.roomCode,
        isTvHost: vD.tvHost,
        captainName: vD.captain,        // shows "👑 X is the captain — start from their phone"
        settings: 'first to 12 · cow-free',
        players: players.map(p => ({ name: p.name, avatar: p.avatar, captain: p.name === vD.captain })),
    });
}
```

### opts

- `title` — game name (caps). Inherits the game's own font so it feels native.
- `accent` — hex for title + room code (defaults to `var(--gold)` then `#ffc93c`).
- `roomCode`, `joinUrl` — the QR is **self-rendered** by `tvLobby` (needs the qrcode
  CDN). Default URL is `?room=CODE`; pass `joinUrl` for a different scheme (liarsdice
  uses `?join=`).
- `isTvHost`, `captainName` — drive the captain hint.
- `hint` — overrides the captain line entirely (ticktacktoe: "first two phones play as ❌/⭕").
- `settings` — optional short lowercase line under the code.
- `players` — `[{ name, color?, avatar?, captain? }]`; chips show an avatar emoji or a
  colour dot. Empty → "Waiting for players…".
- `scanHint`, `waitingText` — optional copy overrides.

## Details that matter

- **QR is always square.** `tvLobby` renders its own white QR at `clamp(200px,40vmin,460px)`
  with `aspect-ratio:1` + `flex-shrink:0`, so a flex column on a short screen can't squish
  it into a bar (an earlier bug). Same vmin trick was applied to liarsdice's own QR boxes.
- **Scoped CSS** (`.cxl-*`) injected on first call; transparent background so the ambient
  [scene](ambient-scenes.md) shows through at the bottom.
- **Toggles** move to bottom-right in TV mode (rule in the scene CSS), clear of the ⛶.

## ticktacktoe special case

ticktacktoe wraps its screens in a `.card`, and `.screen.active` runs an animation — a
**filtered/animated ancestor becomes the containing block for `position:fixed`**, which
trapped the lobby inside the card (~72px, "squished bar"). Fix: `renderTvLobby()` renders
into a `#ttt-tvlobby` div appended to **`document.body`** (outside `#app`/`.card`) so
`fixed` fills the viewport, and `#app` is hidden while the tv-lobby shows (its header/inputs
bled through the transparent lobby; the sound/theme toggles live outside `#app` so they
stay). It re-renders on each join and `#app` returns when the game starts. Any game whose
viewer root is transformed/filtered needs the same body-level treatment.
