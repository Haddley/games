# Shared core — `common.js` (repo-wide)

Originally every game was a single self-contained HTML file with everything inline.
As the family of games grew, a few *truly identical, stable* primitives were
extracted into one first-party file — **`common.js`** at the repo root — that every
P2P game loads with `<script src="common.js"></script>` in its `<head>`, **before**
its own inline `<script>`. It's a classic script (no build, no modules), so the
names it defines become globals the game uses directly.

Guiding rule: keep `common.js` **tiny and stable** — a syntax error there breaks
*every* game at once, so only genuinely-shared, rarely-changing primitives belong in
it. Each game is otherwise still self-contained.

## What it provides

1. **`ICE_CFG`** — the Metered STUN/TURN config passed to **every** `new Peer(...)`
   (`new Peer(id, ICE_CFG)` host, `new Peer(undefined, ICE_CFG)` guest/viewer).
   Credential rotation is now a one-file change. See CLAUDE.md "Connection transport".

2. **`rankByScore(list, key='score')`** — competition ranking (1-2-2-4): walk a
   score-desc-sorted list, reuse the previous rank unless the score drops. Returns a
   rank per row. Fixes the **podium-tie bug** (equal scores used to show 1st + 2nd)
   — see [podium-and-scoring.md](podium-and-scoring.md).

3. **`mountScene(theme[, contentSelector])`** / **`mountMeadow()`** — the ambient
   **scene engine**: themed CSS figures ambling along the bottom of the TV/viewer
   screen. See [ambient-scenes.md](ambient-scenes.md).

4. **`tvLobby(opts)`** — the shared **"waiting for players" TV lobby** (boggleparty's
   layout: title, big square QR, room code, captain hint, player chips). See
   [tv-lobby.md](tv-lobby.md).

## The guard convention (IMPORTANT)

Every call into `common.js` from a game's inline script is **guarded**:

```js
typeof mountScene === 'function' && mountScene('pirates');
typeof mountMeadow === 'function' && mountMeadow();
```

Why: these calls sit at the **top** of each game's inline script. If a browser
serves a **stale cached `common.js`** (an older one without the function), an
unguarded call throws `ReferenceError` and **halts the whole game script** → blank
page, no QR, nothing. The guard makes a stale/missing `common.js` merely skip the
decorative feature instead of bricking the game. Keep the guard on every
`mountScene`/`mountMeadow`/`tvLobby` call. (Cache-busting `?v=` on the script tag is
an alternative, but requires bumping the version each edit; the guard is the durable
fix.)

## Who loads it

- **All 15 P2P party games** load it for `ICE_CFG` + `rankByScore` + `mountScene` +
  `tvLobby`: boggle, boggleparty, bestguess, bingo, brokenpencil, categoryclash,
  doodleparty, familytrivia, fibbers, goinggone, herdmind, liarsdice, moonlightvillage,
  oddsheep, pit — plus **rockpaperscissors** (the newest game).
- **ticktacktoe** loads it **only** for `mountScene` + `tvLobby`; it keeps its own
  inline `TTT_PEER_OPTS` for connections (class-based, pins a specific broker) and its
  TV lobby is rendered on `document.body` — see [tv-lobby.md](tv-lobby.md).
- **skydive, synthwave, index.html** don't load it (single-player arcade / launcher).

## Adding a new game

Copy an existing game; it inherits the shared core automatically. Just:
- load `common.js` after the qrcode CDN in `<head>`;
- guard the `mountScene('<theme>')` call (add a theme to `SCENE_THEMES` if none fits);
- render the TV lobby with `tvLobby({...})`;
- use `rankByScore` for any podium/standings;
- add a card to `index.html`.
