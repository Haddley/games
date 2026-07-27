# Shared core — repo-wide first-party scripts

Originally every game was a single self-contained HTML file with everything inline.
As the family of games grew, the *truly identical, stable* primitives were extracted
into a handful of first-party scripts at the repo root. Each game loads the ones it
needs in its `<head>`, **before** its own inline `<script>`. They're classic scripts
(no build, no modules), so the names they define become globals the game uses directly.

Guiding rule: keep each shared file **tiny and stable** — a syntax error in one breaks
*every* game that loads it, so only genuinely-shared primitives belong there. **Always
run the smoke e2e after editing a shared file** (`npx playwright test tests/smoke.e2e.spec.js`):
a `node` "new Function" parse check only catches *syntax*, not a runtime `ReferenceError`
— a stray `mode` token once parsed clean but blanked every game.

## `common.js` — the P2P/UI core

Loaded by every P2P game (and `index.html`). Provides:

1. **`ICE_CFG`** — the Metered STUN/TURN config passed to **every** `new Peer(...)`.
   Credential rotation is a one-file change. See CLAUDE.md "Connection transport".
2b. **`rankByElimination(entries, eliminated, champion, keyOf)`** — the OTHER kind of
   podium. `rankByScore` is for games where everyone finishes with a number; this is for
   games where nobody does and people are knocked **out** instead, so the finishing order is
   the elimination order read backwards. Used by RPS and Liar's Dice, which were doing it by
   hand with the same algorithm and one difference that mattered: RPS appended players who
   were never eliminated, Liar's Dice dropped them off the podium. `keyOf` exists because
   Liar's Dice keys its elimination list by NAME rather than id. A unit-test audit fails if a
   game with `H.eliminated` builds its own order.

2. **`rankByScore(list, key='score')`** — competition ranking (1-2-2-4): reuse the
   previous rank unless the score drops. Fixes the **podium-tie bug** — see
   [podium-and-scoring.md](podium-and-scoring.md).
3. **`mountScene(theme[, contentSelector])`** / **`mountMeadow()`** — the ambient
   **scene engine** (themed CSS figures along the bottom of the TV/viewer screen). See
   [ambient-scenes.md](ambient-scenes.md).
4. **`tvLobby(opts)`** — the shared **"waiting for players" TV lobby**. See
   [tv-lobby.md](tv-lobby.md).
5. **Control strip** — `mountControls()` self-mounts on `DOMContentLoaded`: one fixed
   top-right column of ⛶ fullscreen · 🌙 day/night · 🎵 music · 🔊 sound, identical on
   every page. It **reuses** each game's existing `#sound-togs`/`.audio-togs` container
   (which holds `#tog-music`/`#tog-sfx` wired to the game's own `toggleMusic`/`toggleSfx`)
   and prepends the fullscreen + theme buttons, so the game's audio code drives them for
   free. Also provides `toggleFullscreen()`.
6. **Shared prefs** (carry across all games via same-origin localStorage):
   - **Name** — `savedName()` / `saveName(n)` on the shared `games-name` key. Any name
     `<input data-save-name>` auto-saves on each keystroke (delegated handler in
     common.js), and reads back with `savedName()`. Type your name once, it follows you
     to every game.
   - **Day/night** — `savedTheme()` / `saveTheme(t)` / `applySavedTheme()` /
     `toggleTheme()` on the shared `games-theme` key (dark default). Each game ships a
     `body.day { … }` light palette; the strip's 🌙 button and `applySavedTheme()` are
     wired for you.
7. **Connection helpers** (see [connection-and-reconnect.md](connection-and-reconnect.md)):
   - **`clientId()`** — a per-TAB device id in sessionStorage, sent with every `join` so a
     host can match a returning player by device before falling back to their name.
   - **`rememberRoom` / `savedRoom` / `forgetRoom`** — per-tab memory of the room you're in,
     so a browser refresh rejoins instead of landing on the home screen.
   - **`setNetState('relay'|'stun'|'local'|'checking'|'none')`** — the connection badge in
     the control strip: 📡 relayed via TURN, 🌐 direct via STUN, 🏠 same network, ⏳ settling.
8. **Presence — who is actually still there.** The most load-bearing group in the file: it
   decides whether a round can close and who wears the 👑 crown. It exists because
   **`conn.on('close')` does not fire when a browser closes** (measured: zero close events in
   75 seconds), so `guestConns` confidently lists switched-off phones. Full story and the
   four bugs it came from: [connection-and-reconnect.md](connection-and-reconnect.md).
   - **`startHeartbeat(sendFn)` / `stopHeartbeat()`** — the phone says "still here" every 4s.
     Every game calls this on connect; there was no heartbeat anywhere before July 2026.
   - **`notePresence(player)`** — the host stamps `player.seen` on **any** message. A
     heartbeat is the guaranteed one; a roll or a vote is just as good a proof of life.
   - **`isPresent(player, conns)`** — heard from inside `PRESENCE_MS` (13s) *and* holding a
     connection. Ask this, never `guestConns` directly.
   - **`presentPlayers(players, conns, selfId, selfPlays)`** — backs every game's
     `connectedPlayers()`, which used to be a byte-identical copy in all 18.
   - **`claimSeat(players, msg, newId, conns, inLobby)`** — is this returning join the same
     person? A **cid** match wins outright (a device is in one place). A **name** match is
     weaker — two people really can both be called Ben — so mid-game it only reclaims a seat
     nobody has been heard from lately. **In a lobby a name is enough**, because there is
     nothing to steal and someone restarting a browser is back inside the presence window;
     making them wait it out is what produced lobbies reading "Neil, Karen, Karen, Karen".
   - **`rekeyPlayerId(H, oldId, newId, spec)`** — a refresh mints a new peer id, and the id
     is usually also a key elsewhere. This moves it in every shape a game stores one:
     `scalars` (`H.turn`), `arrays` (`H.turnOrder`), `maps` (`H.votes[id]`, including a value
     that *points at* the returning player), `whoObjs` (`H.card.who`), `idObjs` (`H.moved.id`).
     The shapes are shared; each game passes its own field names.
   - **`watchPresence(recheck)`** — the host re-asks "can this round close?" on a timer.
     Necessary because every game's `if (active.every(…))` is **edge-triggered**: it is only
     asked when somebody answers, so the last answer arriving before a departure is noticed
     leaves the room waiting for ever. It re-asks **every** tick — an earlier version skipped
     ticks where the player set looked unchanged, and that was quietly wrong.
9. **`setHTML(el, html)`** — the innerHTML swap every `render()` goes through. It blurs a
   focused input before the swap and restores focus + caret afterwards, so a phase change
   landing while you type can't strand the iOS keyboard over a destroyed field.

## `p2p.js` — PeerJS hardening

`makeRoomCode()` (4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ`, no I/O), plus:

- **`hostPeer(fullId, {onOpen, onConnection, onFatalError})`** — survives broker-drop via
  `peer.reconnect()`; treats `network`/`server-error`/`socket-*` as recoverable instead of
  tearing the room down.
- **`joinPeer({hostFullId, attempts, delayMs, rejoinAttempts, onReady, onLost, onGiveUp})`** —
  retries the first connect, **and owns the mid-game reconnect**: on a close it raises the
  curtain and re-joins (10 tries, 0.6s → 4s). Pass `onLost` to opt in; `onGiveUp(wasIn)`
  says whether you were in the game or the join never landed. Don't wire your own
  `hostConn.on('close')` — it would fight the retry loop.
- **`p2pCurtain(show[, text])`** — the self-contained "Reconnecting…" overlay (own markup
  and CSS, so no game needs to add anything).
- **`p2pWatchRelay(conn)` / `p2pPath()` / `p2pIsRelayed()`** — poll `getStats()` and report
  which ICE path won (`local` / `stun` / `relay`) to `setNetState`.

Every P2P game routes its `new Peer` calls through these — always with `ICE_CFG`.
The full story, including browser quirks and the symptom→cause table, is in
[connection-and-reconnect.md](connection-and-reconnect.md).

## `dice.js` — a rollable 3D die

`diceHTML({id, value, sides, cls})` → markup; `throwDie(id, value, {onTick, onLand})` →
rolls it and **returns the duration it picked** (0.62–1.4s, varied per throw, with the
spin scaled to match so a long throw tumbles more rather than slower); `settleDie(id,
value)` → snap to a face with no animation, for a re-render landing mid-throw.

Self-contained: namespaced `.d3d*` CSS injected on **first use**, so a game that never
rolls a die pays nothing for loading the file. Size and skin are CSS variables
(`--d3d-size`, `--d3d-box`, `--d3d-bg`, `--d3d-ink`, `--d3d-pip`). Silent by design —
SFX are per-game, so pass `onTick(duration)` / `onLand()` and play your own.

The landing deliberately comes from the easing curve over-rotating onto the face. A scale
pop and a low thud-plus-music-duck were both tried and both read as a separate event
stapled to the end of the roll rather than a die settling.

**Not used by liarsdice, on purpose.** Its `dieSVG(face, {size, hi, dim, anim})` draws up
to 40 flat dice at once, in three states that carry meaning (`hi` = matches the bid at the
reveal, `dim` = doesn't), down to 28px, in a bone-and-brass pirate skin. That's a different
job from one hero die being thrown, and the component has no notion of hi/dim.

## `fx.js` — visual FX

- **`burst(x, y, colors, n=14)`** — particle explosion; self-contained (injects its own
  `.fxp` CSS); caller passes the colour palette.
- **`popText(x, y, text, cls='gold')`** — floating score text; renders `.pop <cls>` and
  **relies on the game's own `.pop`/`.pop.*` CSS** (kept in-game), so each game's font +
  colours are unchanged.
- **`startConfetti(ms, cols)`** — owns one fullscreen `#fx-confetti` canvas + its state +
  resize; reads the game's `const CONFETTI_COLS` for its palette (or pass `cols`).

All early-return on a global `REDUCED` (`prefers-reduced-motion`), which the game defines.
`emojiRain`/`flashEdge` remain inline in the 1–2 games that use them.

## Audio — pick ONE profile

A game loads **either** `audio.js` **or** `ambient.js`, never both (they both define
`ac()`/`tone()`).

- **`audio.js`** — the byte-identical core of the full step-sequencer engine: `tone()`
  (synth voice) + `startMusicLoop()` (scheduler). A game using it still writes inline
  `ac()`, `TRACKS`, `playMusicStep()`, `setMusic()`, `duckMusic()` and its `s*` stingers —
  those are hand-tuned by ear and differ per game. Used by the 15 music games. See
  [animation-conventions.md](animation-conventions.md).
- **`ambient.js`** — the *lightweight* profile: a drifting chord pad + a simple `tone()` +
  an SFX bus (`ac`, `tone`, `duck`, `startPad`/`stopPad`). The pad mood is the game's
  `const AMBIENT_CHORDS` (a default is provided). Almost no authoring — a good default for
  a new game that doesn't need composed music. Used by **rockpaperscissors**.

## The guard convention (IMPORTANT)

Calls into a shared file that run at the **top of the inline script at load** are
**guarded**, e.g.:

```js
typeof mountScene === 'function' && mountScene('pirates');
let fName = (typeof savedName === 'function' ? savedName() : '');
```

Why: if a browser serves a **stale cached** shared file (an older one lacking the
function), an unguarded load-time call throws `ReferenceError` and **halts the whole game
script** → blank page, no QR. The guard makes a stale/missing file merely skip the feature.
Runtime calls (button handlers, `burst`, `tvLobby`, `saveName`, `toggleTheme`) don't need
the guard — the page has already loaded by then.

## Who loads what

- **plumptrek** additionally loads **`dice.js`** for its die.
- **The 18 P2P party games** load `common.js` + `p2p.js` + `fx.js`, and one audio profile:
  bestguess, bingo, letterstorm, brokenpencil, buzzin, categoryclash, cornerthemarket,
  doodleparty, familytrivia, fibbers, goinggone, herdmind, lastlaugh, liarsdice,
  moonlightvillage, oddsheep, **plumptrek** (all `audio.js`), and **rockpaperscissors**
  (`ambient.js`; its own DOM confetti, not `fx.js`).
- **ticktacktoe** loads `common.js` (for `mountScene`, the control strip, `clientId`,
  `rememberRoom`) **and** `p2p.js` — but only for `p2pCurtain` + `p2pWatchRelay`, through
  guarded `ttt*` wrappers. It still inlines its own `TTT_PEER_OPTS` and audio, holds its own
  seat-reservation logic (`TTT_HOLD_MS`), and its TV lobby renders on `document.body`.
- **index.html** loads `common.js` (for the control strip + day/night theme on the launcher).

## Adding a new game

Copy the closest existing game; it inherits the shared core automatically. Then:
- load `common.js`, `p2p.js`, `fx.js`, and one of `audio.js`/`ambient.js` after the CDNs;
- guard the `mountScene('<theme>')` call (add a theme to `SCENE_THEMES` if none fits);
- go through `hostPeer`/`joinPeer` (never bare `new Peer`); define `const PFX = '<PREFIX>-'`;
- pass `onLost: () => { connected = false; }` to `joinPeer` so drops auto-rejoin, send
  `cid: clientId()` with `join`, match the zombie slot on it, and call `rememberRoom` /
  `forgetRoom` + the `savedRoom()` check in `boot()`;
- make the captain the first *connected* player (`capPlayer()`), and give that phone the
  buttons the TV says it has;
- render the TV lobby with `tvLobby({...})`; use `rankByScore` for standings;
- put `data-save-name` on the name input; ship a `body.day { … }` light palette;
- define `const REDUCED = …` for `fx.js`; add a card to `index.html`.
