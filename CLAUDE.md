# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Multiplayer browser games served by GitHub Pages at https://haddley.github.io/games/ — published straight from the `main` branch root (`.nojekyll`). **There is no build, lint, or bundle step.** Each game is one (almost) self-contained HTML file with all CSS/JS inline; the shared dependencies are CDN scripts (PeerJS 1.5.4, qrcode-generator 1.4.4), Google Fonts, a Metered TURN relay (see "Connection transport" below), and **six small first-party shared files** at the repo root — **`common.js`**, **`p2p.js`**, **`fx.js`**, **`dice.js`**, **`audio.js`** and **`ambient.js`** (see **Shared files** below). The core is **`common.js`**, which every P2P game loads via `<script src="common.js">`. It provides `ICE_CFG` (TURN config), the `rankByScore` podium helper (and `rankByElimination` for knockout games — RPS, Liar's Dice), the shared **day/night theme + player-name prefs** and the injected top-right **control strip** (⛶ fullscreen · 🌙 day/night · 🎵 music · 🔊 sound), the shared **TV "waiting for players" lobby** (`tvLobby`), and an **ambient-scene engine** (`mountScene(theme)` / `mountMeadow()`): a themed CSS scene of figures ambling along the bottom of the TV/viewer screen (shown only under `body.viewer-mode`). Each game opts in with one line — **always guarded**: `typeof mountScene === 'function' && mountScene('pirates');` (the call sits at the TOP of the game's inline script; without the guard, a browser serving a *stale cached common.js* without `mountScene` throws a ReferenceError that halts the whole script → blank page, no QR. Keep the guard on every `mountScene`/`mountMeadow` call). Themes live in `SCENE_THEMES` in common.js (`meadow` = the CSS-drawn woolly flock for the farm games; the rest are themed emoji casts — `pirates`, `night`, `letters`, `library`, `carnival`, `art`, `bingo`, `auction`, `masks`, `mystery`, `market`, `tictactoe`, `rps`). `bingo` and `cows` are CSS-drawn actors (not emoji), like `meadow`'s flock. The scene shows under `body.viewer-mode` **or** `body.tv-mode` (ticktacktoe uses the latter). ticktacktoe loads common.js for `mountScene`, the control strip and the reconnect helpers — but still uses its own inline `TTT_PEER_OPTS` for connections, not `ICE_CFG`/`rankByScore`. index.html doesn't load common.js.

**Licence.** The repo is **Business Source License 1.1** (`LICENSE`) — source-available,
non-commercial production use granted, converting to Apache 2.0 on 2030-07-26. `sprites/`
is explicitly **carved out**: that art is Kenney's, CC0 1.0 public domain, and stays that
way (`sprites/LICENSE`, `sprites/CREDITS.md`). Adding third-party assets means doing all
four evidence steps in `llmwiki/sprites-and-licensing.md` — upstream licence verbatim, a
local copy of the licence text, provenance with the source archive's SHA-256, and a script
that reproduces our derived files byte-for-byte.

`index.html` is the launcher grid — add a card there when adding a game. Each game has a companion plan (`letterstormplan.md`, `familytrivia.md`, …) written before the game was built; keep these as the reference for game rules and protocol design.

## Shared files (repo root)

Six tiny, stable first-party scripts hold everything that was identical across games. Each game loads the ones it needs in `<head>` **before** its inline `<script>`, so their names are globals. **A syntax error in any of these breaks every game that loads it — always run the smoke e2e (`npx playwright test tests/smoke.e2e.spec.js`) after editing one; a `node` "new Function" parse check only catches *syntax*, not a runtime `ReferenceError`** (a stray `mode` token once parsed fine but blanked every game — see the memory note).

- **`common.js`** — the P2P/UI core: `ICE_CFG` (TURN), `rankByScore` podium helper, the ambient-scene engine (`mountScene`/`SCENE_THEMES`), the shared TV lobby (`tvLobby`), the injected top-right **control strip** (`mountControls`: ⛶ fullscreen · 🌙 day/night · 🎵 music · 🔊 sound — self-mounts on `DOMContentLoaded`, reusing the game's `#sound-togs`/`.audio-togs` container), shared prefs (`savedName`/`saveName` via any `<input data-save-name>` + the shared `games-name` key; `savedTheme`/`applySavedTheme`/`toggleTheme` + `body.day` light mode + the shared `games-theme` key), and the **connection-resilience helpers**: `clientId()` (per-tab device id in sessionStorage, sent with every `join` so a host can match a returning player), `rememberRoom`/`savedRoom`/`forgetRoom` (per-tab memory of the room, so a refresh rejoins), `setNetState('relay'|'stun'|'local'|'checking'|'none')` / `setRelayBadge(on)` (the connection-path button in the strip — **every game shows it once connected**, naming the mechanism that actually got the two devices talking: 📡 TURN relay, 🌐 STUN hole-punch (direct across networks), 🏠 same wifi/LAN (no server at all), ⏳ still settling, `'none'` = not in a room, badge hidden. Tapping explains it. `?net=0` on any game URL hides it for good, `?net=1` restores it, sticky per browser) and `setHTML(el, html)` (innerHTML swap that blurs/restores focus so a phase change can't strand the iOS keyboard — every game's `render()` goes through it, guarded). Every P2P game loads it; `index.html` loads it too (for the strip + theme).
- **`p2p.js`** — PeerJS hardening: `makeRoomCode()`, `hostPeer(fullId,{…})` (broker-drop reconnect), `joinPeer({…})` (join retry **and** mid-game auto-rejoin), `p2pCurtain(on)` (the self-contained "Reconnecting…" overlay) and `p2pWatchRelay(conn)` / `p2pPath()` (polls `getStats()` for the selected candidate pair and maps its candidate types to relay/srflx+prflx/host → `setNetState`; tries `transport.selectedCandidatePairId`, then a nominated/succeeded pair, then the raw candidate list for older WebKit, and accepts WebKit's `relayed` spelling. A host holding several connections shows the most notable path: relay > stun > local). Every P2P game routes `new Peer` through these (always with `ICE_CFG`). A game opts into auto-rejoin by passing `onLost: () => { connected = false; }` to `joinPeer`; `onGiveUp(wasIn)` says whether it was a failed join or a lost game.
- **`fx.js`** — visual FX: `burst(x,y,colors,n)` (particles; self-contained `.fxp` CSS), `popText(x,y,text,cls)` (floating text; uses the game's own `.pop` CSS), `startConfetti(ms,cols)` (owns one `#fx-confetti` canvas; reads the game's `const CONFETTI_COLS`). All early-return on a global `REDUCED`. (`emojiRain`/`flashEdge` are still inline in the 1–2 games that use them.)
- **`bracket.js`** — a single-elimination knockout draw (`makeBracket`/`nextMatch`/`reportWinner`/`roundName`), pure logic with byes handled properly. RPS's knockout mode runs on it; **ticktacktoe still has its own copy** and has not been migrated — see `llmwiki/elimination-modes.md`. Battle royale (everyone at once, mass elimination) and a knockout bracket (two at a time) are **different mechanics**, not one wearing two hats; do not try to unify them.
- **`dice.js`** — a rollable 3D die: `diceHTML({id, value, sides, cls})` for the markup, `throwDie(id, value, {onTick, onLand})` to roll it (returns the duration it picked), `settleDie(id, value)` to snap to a face. Injects its own namespaced CSS on **first use**, so a game that never rolls pays nothing; size and skin are CSS variables (`--d3d-size`, `--d3d-bg`, `--d3d-ink`…). Makes no sound — pass `onTick`/`onLand` and play your game's own stingers. Values over 6 switch to numerals. Used by plumptrek. **liarsdice deliberately does NOT use it** — see the note below.
- **audio — pick exactly ONE profile per game:**
  - **`audio.js`** — the full step-sequencer engine's byte-identical core (`tone()`, `startMusicLoop()`). A game using it still writes inline `ac()`, `TRACKS`, `playMusicStep()`, `setMusic()`, `duckMusic()` and its `s*` stingers — those are hand-tuned per game. Used by the 15 music games.
  - **`ambient.js`** — the *lightweight* alternative: a drifting chord pad + simple `tone()` + SFX bus (`ac`, `tone`, `duck`, `startPad`/`stopPad`; pad mood via `const AMBIENT_CHORDS`). Almost no authoring — good default for a new game that doesn't need composed music. Used by rockpaperscissors. **Never load both** (both define `ac()`/`tone()`).

**Why liarsdice keeps its own dice.** `dieSVG(face, {size, hi, dim, anim})` in liarsdice.html is not duplication to be tidied away. Its dice do a different job: up to 40 on screen at once, read at a glance in three *states* that carry the game's meaning (`hi` = matches the bid at the reveal, `dim` = doesn't), at half a dozen sizes down to 28px, in a weathered-bone pirate skin. Flat SVG is right for that; forty 3D cubes would be heavier and less legible, and the component has no concept of hi/dim. `dice.js` is for a single hero die that gets *thrown*. Don't unify them.

ticktacktoe is the partial exception: it keeps its own class-based connection code and inline `TTT_PEER_OPTS` + audio (and its TV room runs a **knockout tournament** — `this.tour`, see `ticktacktoeplan.md`), but loads `common.js` (for `mountScene`, the strip, `clientId`, `rememberRoom`) and `p2p.js` (only for `p2pCurtain` + `p2pWatchRelay`, both called through guarded `ttt*` wrappers).

## Commands

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:unit                                # fast unit tests, no browser (common.js, p2p.js, dice.js,
                                                 #   plumptrek, goinggone data/draw/ask/purse/voice, name collisions)
npm run test:e2e                                 # all E2E tests (headless)
npm run test:e2e:headed                          # watch the games play
npx playwright test tests/smoke.e2e.spec.js      # broad smoke net (every game loads + scene + square QR)
npx playwright test tests/familytrivia.e2e.spec.js   # one game's suite
python3 -m http.server 8231                      # manual dev server (Playwright starts its own)

node scripts/build-goinggone-lots.js             # re-embed Going, Going, GONE!'s lots after editing the JSON
node sim/goinggone.js --cash-sweep               # its balance simulator, against the real lots
node sim/goinggone.js --by-round                 #   …round by round: do the bands outrun the money?
```

`unit/` holds pure-JS unit tests (`node --test`, no deps) — including `presence.test.js`,
whose **audit tests read every game** and fail if one drifts from the shared connection
rules; that is what found three games' worth of stranded-id bugs. `common-names.test.js`
is the other audit to know about: common.js and a game's inline script share ONE global
lexical scope, so a duplicate top-level `const` is a SyntaxError that blanks the whole
game — **run it before adding any top-level name to a shared file.** Also: `common.js` helpers and its
storage/badge state, `p2p.js`'s room codes + error classes + ICE-candidate mapping,
`dice.js`'s pips and orientations, and Plump Trek's board maths. Browser scripts are
tested by evaluating the file with `new Function` and pulling out the names — pass
`sessionStorage`/`localStorage`/`location` as **function parameters** to stub them
without touching globals (see `unit/common-prefs.test.js`). For a game's inline script,
slice the block you want out of the HTML by its declaration (`unit/plumptrek.test.js`).

**Test data against the code that reads it.** Plump Trek's cards are data interpreted by
`applyOps`, so `unit/plumptrek.test.js` greps the engine for the ops/kinds/ids it
actually implements and asserts every card only uses those — a typo'd key used to leave a
card that silently did nothing and failed no test. Worth copying for any data-driven
content.

`tests/`
holds the Playwright e2e specs, incl. `smoke.e2e.spec.js` which loads **every** game
and asserts common.js is wired, the ambient scene builds, the TV-lobby QR is square,
a stale `common.js` can't blank a game, and the 📡 relay badge + reconnect curtain
mount/unmount. `reconnect.e2e.spec.js` covers the resilience end to end (a dropped
phone rejoining its seat, a browser refresh, the crown passing and coming back);
`ticktacktoe.e2e.spec.js` does the same for its bespoke connection code; `relay.e2e.spec.js`
forces `iceTransportPolicy:'relay'` so a real TURN-relayed link must light the 📡 badge;
`shared.e2e.spec.js` checks what common.js promises EVERY game (control strip, prefs
carrying between games, focus surviving a re-render, every attract mode playing itself,
every launcher card resolving); `dice.e2e.spec.js` tests the die component on its own.

The peer-heavy specs set `test.describe.configure({ retries: 1 })`: several rooms opened
in quick succession sometimes get throttled by the **public** PeerJS broker and a join
never lands. That's the shared external service, not a game — but don't reach for a retry
to paper over a real race.

Remember that a direct connection is the *normal* result even for two phones on
different networks — STUN hole-punches through most home NATs, and TURN only takes
over when it can't. 🌐 rather than 📡 is the good outcome, not a broken detector.
(Two browsers on one machine always report 🏠, so the e2e forces
`iceTransportPolicy:'relay'` to exercise the TURN path.)

Tests need internet (public PeerJS broker; letterstorm also fetches the ENABLE dictionary from GitHub). They run with **1 worker, no parallelism** — the games are stateful P2P and each test drives several pages (host phone, guest phones, TV) in one browser. Screenshots land in `screenshots/` (gitignored) — the tests are as much a screenshot tour for eyeballing the UI as they are assertions.

## Architecture: how every multiplayer game works

The P2P pattern is identical across `boggle.html`, `cornerthemarket.html`, `letterstorm.html`, `familytrivia.html` — read one to understand all (letterstorm and familytrivia are the most complete):

- **Host-authoritative state.** Whichever browser creates the room registers a PeerJS peer ID of `<GAME-PREFIX>-<4-letter code>` (e.g. `BGPARTY-KWXZ`, `FAMTRIV-ABCD`) and holds the single source of truth in a global `H` object. Guests hold no game logic; they send inputs and render whatever message last arrived.
- **Two client roles**, decided by the first message on a connection: `{type:'join', name}` → player (tracked in `guestConns{}`), `{type:'join_viewer'}` → TV/scoreboard (tracked in `viewerConns{}`). Viewers get their own `viewer_*` message variants with spectator-shaped payloads.
- **TV-host mode**: the big screen itself can create the room. It runs the authoritative host logic but renders the viewer UI (`isTvHost`), and the **first player to join becomes captain** — their phone drives settings/start/next via `{type:'ctl', action}` messages that the host only accepts from `H.players[0]`.
- **Rendering** is string-built `innerHTML` from a `render()` switch on a global `ui` state string. High-frequency updates (timer ticks, counters) **patch DOM nodes by id** instead of re-rendering, so in-progress touch interaction is never interrupted.
- **Connection/presence/rejoin is SHARED and audited.** `common.js` owns `startHeartbeat`,
  `notePresence`, `isPresent`, `presentPlayers` (behind every game's `connectedPlayers()`),
  `claimSeat`, `rekeyPlayerId` and `watchPresence`; `p2p.js` owns the connection itself. Games
  supply only their own field names and their own idea of what absence means in play.
  `unit/presence.test.js` contains **audit tests** that read every game and fail if one
  hand-rolls any of it, stores a player id in a field its rekey doesn't cover, or waits for
  every player without re-asking when one leaves. Those audits found three games' worth of
  bugs that six hand-fixes had missed. **`tests/connection-battery.e2e.spec.js`** then asks
  all nineteen the same five questions over real rooms — join · restart · go silent · come
  back · no ghosts — which is what caught Liar's Dice sending heartbeats it never recorded.
- **`conn.on('close')` does NOT fire when a tab closes.** A closed tab, a flat battery or a
  force-quit leaves the data channel quiet with no FIN, so `guestConns` still lists a device
  that is gone (measured: zero close events across 75s). Every "are they here?" check built on
  `guestConns` — including `capPlayer()` — has this blind spot. Plump Trek therefore also
  keeps a pessimistic `p.away`, set when the `IDLE_ROLL_MS` timeout actually fires (real
  evidence: waited 70s, heard nothing) and cleared by any inbound message; `beginTurn` skips
  it, so the room pays that wait **once** instead of every lap. A heartbeat in `p2p.js` would
  be the proper fix and would also stop a dead phone holding the crown. See
  `llmwiki/connection-and-reconnect.md`.
- **Nothing may require a captain to notice.** Plump Trek recovers from a dropped phone by
  itself (`p.away` + `beginTurn` skipping). The captain's **👋 Continue without X** and
  **🏕 Back to the lobby** are a *tidy-up*, offered only when somebody has actually gone, and
  both are guarded on `MIN_PLAYERS` **in the host**, not just in the UI — a hidden button is
  a hint, the host decides. "Back to the lobby" keeps the connected players and reopens the
  door, so the people who dropped out and brand-new players can both join.
- **A player IS their peer id, and a refresh mints a new one.** Re-pointing their row in
  `H.players` is *not enough* — the id is also the key in every other place the host stored
  it (`H.turn`, `H.turnOrder`, `H.order`, `H.card.who`, `H.choice.who`, `H.moved.id`,
  `H.votes[id]`, finale mini-game state…). Miss one and the room **silently stops**: Neil
  refreshed on his own turn in Plump Trek, rejoined, and his phone never offered the Roll
  button again, because `me.myTurn` is `H.turn === p.id` and `H.turn` still held the dead
  peer. No error anywhere; the host was waiting for a roll from nobody. The rejoin path
  therefore calls **`hostRekeyPlayer(zombie, conn.peer)`**, which rewrites them all at once
  (`plumptrek.html`, and `oddsheep.html` for its `turnOrder`/`votes`). **If you add a field
  that stores a player id, add it to that function** — a unit test greps the engine for
  id-holding fields and fails if the rekey doesn't mention one. Games that keep an *object
  reference* (lastlaugh's `H.judge`) or an *index* (liarsdice's `activePlayers`) are immune
  by construction; games that keep an id are not.
- **Reconnects**: three layers. (1) The host keeps a dropped player's slot: a rejoining `join` takes over the "zombie" slot, matched on `msg.cid` (the device id from `clientId()`) first and the name second (`zombie.id = conn.peer`). (2) The phone/TV *re-joins itself* — `joinPeer` raises the shared curtain on a mid-game close and retries 10× (0.6s → 4s backoff) before giving up. (3) A browser refresh walks back in via `savedRoom()` in each game's `boot()`. The **host/TV is never remembered** — `H` can't survive a reload, so re-creating an empty room would be a lie; that's the one unrecoverable failure.
- **👑 Captain = first CONNECTED player** (`capPlayer()` = `connectedPlayers()[0] || H.players[0]`), never plain `H.players[0]` — otherwise a captain whose phone sleeps freezes the room with nobody able to press Start/Next. When the crown moves, `capSync(prevCapId)` (called deferred from both `case 'join'` and `conn.on('close')`) re-syncs only the two phones involved plus the TV — never a full broadcast, which would interrupt everyone else mid-interaction. Whatever a captain can drive, their own phone must actually show: check the podium/"play again" screen too.
- **QR joining**: host/TV lobbies render a QR of `?room=XXXX`; the page pre-fills the join form from that query param on load.
- **Connection transport (ICE: host → STUN → TURN)**: WebRTC tries three kinds of path, in order, and the one it settles on is what the badge reports (see below): **host** candidates (both devices on the same wifi — no server involved), **server-reflexive** candidates (a **STUN** server tells each device its public address and the two NATs hole-punch — this is what two phones on *different* networks normally get), and finally **relay** candidates (**TURN** forwards every packet, for peers behind symmetric/restrictive NATs — mobile carriers, corporate wifi — where no direct path exists). STUN-only was the old default and is why same-LAN players worked while some remote players failed with "Negotiation of connection failed"; TURN is the fallback that fixes those, not the normal path. `ICE_CFG` lives in **`common.js`**, loaded in each game's `<head>` *before* the inline `<script>`, so it's a global the game passes to **every** `new Peer(...)` — host `new Peer(id, ICE_CFG)`, guest/viewer `new Peer(undefined, ICE_CFG)`. ticktacktoe keeps its own class-based peer plumbing, but **no longer its own credentials**: `TTT_PEER_OPTS` now composes `ICE_CFG` from common.js. It shares the rules too — `claimSeat`, `notePresence`, `isPresent`, `startHeartbeat`, `warnIfStale`, `showStaleBuild`, `clientId`, `rememberRoom`, `p2pCurtain`, `p2pWatchRelay` — via guarded `ttt*` wrappers. What stays its own is the peer lifecycle and the fact that its TV holds *seats* in a bracket rather than players, which is domain modelling, not duplication. **When adding a game or a `new Peer` call, load `common.js` and pass `ICE_CFG`, or remote players silently can't join.**
- **Seeing which path you got**: `p2p.js` polls `getStats()` on the live `RTCPeerConnection`, maps the selected candidate pair's types, and every game shows the result in the control strip — 🏠 same network · 🌐 STUN/direct · 📡 TURN relay · ⏳ settling (`?net=0` hides it). `p2pPath()` returns the same value in the console. **A direct connection across two networks is the normal, healthy result** — "no 📡" almost always means STUN did its job, not that detection broke. `tests/relay.e2e.spec.js` forces `iceTransportPolicy:'relay'` to exercise the TURN path for real, because two browsers on one machine always connect 🏠.
- **Broker reconnect**: the PeerJS signaling broker periodically drops a peer's socket, which de-registers the host's room ID so *new* guests get `peer-unavailable` ("Could not reach room") even though the host tab still shows the lobby. herdmind's `makeRoom` handles this with `peer.on('disconnected', () => peer.reconnect())` and treats `network`/`server-error`/`socket-*` errors as recoverable instead of tearing down the room; its `joinGame` retries the whole connect up to twice (700 ms apart) covering both `peer-unavailable` and negotiation failures. This now lives in `p2p.js` (`hostPeer`/`joinPeer`) and every game uses it, ticktacktoe included (hand-ported).

## Emoji fonts, and the one-scope trap

- **Incomplete emoji fonts draw a box.** Fire OS (the Silk browser on a Fire TV), older smart-TV
  browsers and some Androids ship fonts missing anything recent — 🪶 arrived in 2020 and boxes on
  a Fire TV while the music plays perfectly. Guessing which glyphs a given telly has is hopeless,
  so **`common.js` owns a detector**: `emojiOK(ch)` measures the glyph against a codepoint nothing
  can have (same width ⇒ tofu), `emojiPick(…)` returns the first drawable option, and `mountScene`
  filters each theme's cast through it — never to empty, because a scene of nothing is worse than
  a scene of boxes. Games call them **guarded** (`typeof emojiPick === 'function' ? … : opts[0]`)
  so a stale common.js still shows the emoji; goinggone resolves its chrome once into `ICON` and
  falls back to 📦 for a lot's own emoji.
- **⚠️ common.js and a game's inline script share ONE global lexical scope.** A top-level
  `const castOf` in common.js is a **SyntaxError** in any game that already has one — and a
  SyntaxError takes the entire inline script with it: blank page, no QR, no scene. Adding an
  emoji helper called `castOf` did exactly that to Plump Trek, which has had its own for months.
  `function` redeclaration is legal (the later wins — letterstorm and liarsdice deliberately
  override common.js's `toggleFullscreen`), **`const`/`let`/`class` is fatal.**
  `unit/common-names.test.js` audits every game against every shared file it loads and names both
  files; run it before adding ANY top-level name to a shared file.

## Audio & animation conventions

Every game has a procedural WebAudio engine and a CSS/JS FX stack. The byte-identical primitives now live in the **shared files** (`fx.js`, and `audio.js`/`ambient.js` — see "Shared files" above); the hand-tuned parts (`TRACKS`, `ac()`, `playMusicStep()`, stingers) stay inline. **`brokenpencil.html` and `herdmind.html` are the reference implementations** — copy patterns from them when polishing another game.

- **Engine basics**: `ac()` lazy-inits on first pointer gesture (autoplay policy); `musicGain` ≈ 0.33, `sfxGain` ≈ 0.55; `TRACKS` is a step sequencer (32 sixteenth-steps per bar-pair, `bassBars`/`leads`/`pads`/`hat`/`kick`/`stab` lanes, per-track `waves` + swing); `setMusic(track)` switches per game phase; `musicUrgent` (timer low) lifts the lead an octave and adds hats.
- **The music quality stack** (apply all five when touching a game's audio):
  1. `duckMusic(dur)` — sidechain-style dip of `musicGain` called at the top of big stingers (win fanfare, fail trombone, moo) so they read clearly over the music.
  2. **Adaptive layers** — `musicIntensity` (0/1 = rhythm section ± lead, 2 = full arrangement); `playMusicStep` gates stabs/arp on intensity ≥ 2 and lead on ≥ 1 (urgency forces full); `setMusic` sets the per-track default (answer/work tracks start lean); a `bump*Intensity` helper raises it as player progress comes in (call it from BOTH phone `applyMsg` and TV `applyViewerMsg`, including patch branches).
  3. **Match-point key change** — `musicKeyShift` (+2 semitones) applied to every melodic voice (bass, stabs, lead, arp) when the decisive round starts (score ≥ target−1, or final chain/round); reset to 0 on lobby/podium tracks.
  4. **Count-in fills** — `setMusic` plays a one-beat rising snare fill and pushes `musicNext` past it so the new track enters on a downbeat instead of hard-cutting.
  5. **Winner's motif** — `sWin` opens by quoting the first ~8 notes of the game's own `TRACKS.lobby.leads[0]` melody before the trill + crash, so each game's fanfare is its own hummable tune.
- **Animation rules**: entrance animations are gated on `#app.fresh` (set only on real screen changes) so same-screen re-renders never re-trigger them; high-frequency updates patch DOM by id; every decorative JS effect early-returns on `REDUCED` (`prefers-reduced-motion`), and the stylesheet kills all animation under the same media query.
- **FX helpers**: `burst` (particle explosion), `popText` (floating score text) and `startConfetti` now come from **`fx.js`** (shared); still inline where used are `emojiRain`, `flashEdge` (full-screen edge glow), `body.time-low` vignette during final seconds, suspense curtains (`votes-curtain`), shine sweeps (`.win::after`), and ambient layers (`#meadow` grazing sheep, `#doodle-bg` drifting doodles).

## TURN relay (metered.ca)

Cross-network play relies on a TURN relay from **Metered** (metered.ca — "Open Relay"). Account/usage facts a future instance needs:

- **Why we pay for it at all**: PeerJS's default config is STUN-only, which cannot connect a peer behind a symmetric/restrictive NAT (mobile carriers, corporate wifi). TURN relays that peer's traffic. Without it, same-LAN players connect but remote players fail — see "Connection transport" above. It is a **fallback**, not the usual path: most cross-network play is STUN-direct and never touches the relay.
- **Is it actually being used?** Look at the connection badge in any game's control strip: 📡 means this device's link is relayed (quota is being spent), 🌐 means STUN got a direct path, 🏠 means same network. That's the honest answer to "are we on the relay?" — don't infer it from an absent icon.
- **Plan & quota**: free tier, **~50 GB/month** of relayed traffic, shared across *all* games and *all* players (the same credentials are reused everywhere). TURN only carries traffic when a direct P2P path can't be established, but data-heavy games (doodleparty, brokenpencil drawings) consume more relay than text games. If the monthly quota is exhausted, TURN stops relaying and remote players silently fail again until it resets — check the **Metered dashboard** (dashboard.metered.ca) for usage.
- **The `iceServers` set** each game embeds (STUN + TURN across ports/transports so at least one punches through any firewall; the `:443` and `turns` TLS entries are what tunnel through HTTPS-only networks):
  - `stun:stun.relay.metered.ca:80`
  - `turn:standard.relay.metered.ca:80` (and `:80?transport=tcp`)
  - `turn:standard.relay.metered.ca:443`
  - `turns:standard.relay.metered.ca:443?transport=tcp`
- **Credentials**: a Metered username + credential, **hardcoded in cleartext** in `common.js`'s `ICE_CFG` (and, separately, ticktacktoe's inline `TTT_PEER_OPTS`). Current username: `35410ce7572a64d0dad7b813`. They're public (visible in page source) — acceptable for family games, but anyone can burn the quota. **To rotate** (new key from the Metered dashboard): change the username+credential in **`common.js`** — **one place, and only one**: ticktacktoe used to keep its own copy inside `TTT_PEER_OPTS` and no longer does (it composes `ICE_CFG` instead), and a unit test fails if the credentials ever reappear in a second file. Then verify (`common.js` parses; a game page loads it and `typeof ICE_CFG === 'object'`).
- **No backend**: because the games are static HTML with no server, credentials are long-lived and embedded rather than minted per-session. A credential-vending endpoint would be the "correct" hardening but is overkill unless quota abuse actually happens.

## Going, Going, GONE! — real items

The lots are **real purchasable objects with verified prices**, not invented ones — 137 of them,
93 with product photography. The whole point is that you *could* buy the thing today, so being
wrong about it is funny in a better way and worth arguing about. **Nothing in the data is
invented**: if a price could not be verified from a live source, the item is not there.

- **The JSON is the source; `goinggone.html` holds a generated copy.** Edit
  `data/goinggone-lots-real.json` (hand-researched) or `data/goinggone-lots-catalogue.json` (bulk
  catalogue harvest), then run **`node scripts/build-goinggone-lots.js`**. Same arrangement as
  `familytrivia-pack.json` → `FAMILY_PACK`. `unit/goinggone.test.js` fails if the embed goes
  stale, so a forgotten run is caught by tests rather than by a wrong price mid-game.
- **The balance numbers come from the simulator, not from judgement.** `START_COINS = 7000`,
  3 lots per player per round, 3 rounds, `RESERVE_FRAC = 0.25`, `REACH = 0.45`, over-band lots off
  by default. **Run `node sim/goinggone.js` before touching any of them** — it loads the real lots
  and deals them exactly as `buildLotOrder` does. `--cash-sweep`, `--big-sweep`, `--table-sweep`,
  `--round-sweep`, `--by-round`.
- **The constants duplicated on purpose, which must move together:** `TIERS`/`BAND_SPAN`/
  `MAX_CLIMB`/`OVER_BAND`/`REACH`/`RESERVE_FRAC`/`ASK_*`/`DROP_*` in `goinggone.html` and in
  `sim/goinggone.js`. If they drift, the simulator stops describing the shipped game.
- **Rounds, and why the money compounds.** The captain picks 1/2/3 rounds (default 3). At the end
  of each round every shelf is sold back at its **true value** and the whole net worth becomes the
  next round's bankroll (`startBanking` → the `banked` phase → `startRound`). Coins carry forward,
  the shelf does not, and the **podium only appears after the last round** — in between there is a
  banked board that is deliberately *not* a podium (no medals, no confetti, no play-again). The
  lot tiers **climb with the round** (`roundBands`) so a table that has tripled its money is shown
  lots it can now afford; `H.usedLots` spans the whole game so nothing is ever sold twice. Awards
  come from `H.gameReveals` (every round), not the round that just ended.
- **The auctioneer asks; he does not wait for zero.** Bidding opens at his *ask* — a randomised
  0.85×–1.9× of true value, so it is a clue with a lie in it. Nobody bites → he comes down a rung
  (`checkGavel`) and asks again, up to 5 rungs, floored at the 25% reserve; past that the lot is
  **passed in** and its true value is revealed. **The ladder and the reserve never leave the
  host** — `stateFor` sends only the current ask and the number of drops so far. Not knowing how
  far he will go is the entire game of nerve; leak it and there is no reason ever to bid early.
  All of this is real auction practice, not invention (auctioneers genuinely fish down for an
  opening bid, and "passed in" is the trade's term) — see the research in
  `goinggoneplan-realitems.md`.
- **He calls the PRICE, never the increment.** With 140 bid and his ask reduced to 25 he says
  "I'll take one hundred and sixty-five" — the price it makes — not "I'll take 25", which is what
  he did at first and which means nothing to a room. In `P_SPLIT`, `{n}` is the resulting price
  and `{r}` the step, and `{r}` may only appear where "more" makes it obviously an increment; a
  unit test enforces both. The TV's countdown label and the phone's button carry that same number
  (`+25` with `165` beneath) so all three agree. **And no trade jargon:** "split it with me" is
  real rostrum shop-talk and complete gibberish at a kitchen table.
- **Spoken commentary is capped at ONE line; the screen carries all four.** Spoken numbers are
  dear — "forty-five thousand nine hundred" is three seconds — so two lines push the banked board
  past eighteen seconds, and the board must be held open for as long as he is talking or the next
  round starts and `say()` cancels him mid-sentence (which is exactly what happened). Worse, a TV
  with no voice would then sit on a silent board for those eighteen seconds. `startBanking`
  measures the hold with `speechMs()` rather than using a fixed one. The podium is not on a clock,
  so it gets two.
- **The auctioneer sums the round up, from what actually happened.** `commentaryFor(rows, reveals,
  final)` builds up to four lines on the host at `finishValuation` — who leads, the round's real
  best bargain, its real disaster, who never lifted their paddle, and whether it is close or a
  runaway — because "well played everyone" is worth nothing on a TV. Each line carries **two**
  strings: `text` for the screen (names) and `spoken` for the auctioneer (paddle numbers only).
  Shown on the banked board and the podium, staged to land after the thing they comment on; spoken
  as **one** utterance, because `say()` cancels and three calls would clip down to the last line.
- **Nobody can read another bidder's purse while a lot is live.** The exact figure is the one
  piece of information that turns this from a guessing game into an arithmetic one ("he has $217,
  so $220 takes it"), so during `lot_intro`/`bidding`/`sold` (`PURSE_HIDDEN`) `stateFor` sends a
  **band** — flush · comfortable · short · skint, from their share of the room's average — instead
  of `coins`. Withheld **on the host**, like mystery lots and for the same reason: phones render
  whatever arrives, so hiding it client-side leaves it one console away. Lots won stays public (a
  paddle going up is not a secret), your own purse always reaches you via `myCoins`, and the
  valuation, banked board and podium show the real numbers — they are the payoff. The e2e asserts
  what actually crosses the wire, not what the TV happens to draw.
- **He SPLITS THE INCREMENT as the hammer falls, and WAITS at each step.** Once bidding is running
  the smallest acceptable raise softens (`softMinRaise`/`softRaises`): full rung → ½ → ¼ → a floor
  of `RAISE_FLOOR` (2%) of the current price, never under $1. So a $60 traffic cone genuinely
  reaches "just one more" while a $67,000 Cessna bottoms out near $1,300 — a literal $1 everywhere
  would make the last bid a reflex test rather than a judgement. The bigger jumps stay on offer
  throughout: he is lowering his ask, not capping enthusiasm.
  **Each step gets its own `SOFT_STEP_MS` window**, exactly as fishing for an opening bid does.
  Deriving the step from how much of one 5s gavel had elapsed put the whole descent inside that
  gavel and left the cheapest ask on offer for well under a second — a reflex test again, which is
  what Neil heard. Any bid resets him to the full rung and a full window.
  Two things this depends on. The ask may **never rise** as he comes down (the floor can otherwise
  exceed the quarter-rung — a unit test asserts monotonicity across every band). And the step is
  **explicit host state** (`H.bid.soft`, broadcast alongside `span`, the length of the current
  window): no device derives the ladder from its own clock any more, which is what let the
  clock-skew grace and the whole local-countdown path be deleted.
- **Every bidder has a PADDLE, and the auctioneer sells to the number.** `freePaddle()` deals a
  unique random two-digit number (10–99) at `hostAddPlayer`; two digits so it always reads as a
  rostrum number ("bidder number forty-two", never "bidder seven"), and a rejoining player keeps
  theirs because the seat object survives the reconnect. `saySold` never speaks a player's *name* —
  that is how a real auction house works, and it saves the speech engine mangling "Bux". The
  paddle is drawn (`paddleHTML`, CSS blade + handle in the player's colour, everything scaled off
  `--pad-h`) in both lobbies, the TV rail, the SOLD card, and on your own phone, where **it goes
  up when you hold the bid** — patched only when that state changes, or the raise animation
  restarts on every bid in the room.
- **The attract mode takes parameters:** `?mode=tvsimulation&players=3&rounds=3&lots=4` —
  bidders (2–10), banked rounds (1–3) and lots per player per round (2–4). Defaults are 4 / 2 / 2,
  short enough that the demo loop turns over but still showing the banking between rounds.
- **Two iOS rules that look like bugs in our code and are not.** (1) iOS Safari grants permission
  to speak **once, only from inside a user gesture**, and every line this game says arrives later
  from a network message — so `toggleVoice()` speaks immediately when switched on, and the first
  tap anywhere spends a silent utterance on `primeSpeech()`. Without that the auctioneer is mute
  on iPhone for good while the same build works in Chrome. (2) **Web Audio respects the hardware
  Ring/Silent switch** on iOS, unlike video playback — a silenced iPhone plays no music, no
  stingers and no speech, and there is no API that can detect it. If somebody reports "no sound at
  all" on an iPhone, that switch is the first thing to check, not the code.
- **The auctioneer is DRAWN as well as heard, TV only.** `mountAuctioneer()` builds a CSS figure
  at the bottom-left — no new third-party art, because that would mean the whole provenance dance
  in `llmwiki/sprites-and-licensing.md`. He is mounted **outside `#app`**: that element's innerHTML
  is replaced on every render, and a head rebuilt mid-sentence drops its mouth animation every
  time a bid lands. His mouth opens **once per syllable of the words actually being spoken**
  (`planMouth`/`startMouth`): the plan is built from the text, the jaw drops further for an "aw"
  than an "ee", and it SHUTS at punctuation, which is what makes a full stop read as one. Never a
  keyframe loop — a fixed flap looks identical whether he is saying "sold" or a hundred and
  fifty-three thousand, and that is exactly how it looked when first built. (Nor a loop *plus* a
  per-word inline height: a running CSS animation overrides inline styles, so that version
  computed the variation and threw it away.) `onstart`/`onend` bracket it and `onboundary`
  re-anchors it against the real audio; the syllable estimate deliberately errs LONG, because
  `onend` always stops the mouth whereas a short plan leaves him mouthing silence. The gavel arm
  swings from `sGavel()`. `.tv` reserves a `padding-bottom` band for him so he never stands on the
  layout; the e2e asserts that no laid-out element overlaps him. Size is one number, `--ah`.
- **He has a SPEECH BUBBLE, and it is not decoration.** `bubble()` fills on every line the
  auctioneer utters and runs **before** the `canSpeak()` gate on purpose: on a screen with no Web
  Speech at all — a Fire TV — the bubble *is* his performance. It takes the width the screen can
  spare, stands about his height, and if there is no voice `mimeLine()` runs the mouth anyway, so
  he mouths the words instead of standing frozen under a caption. TV only, and the e2e asserts it
  never covers the layout.
- **The valuation's running totals stay SHUT until the last lot is valued.** A net worth ticking
  up beside the reveals gives the ending away — watch the numbers and you know who won before the
  final card turns. During the reveals the rail shows only how many of each bidder's lots are
  still to come, in **seating order** so even the order says nothing; the totals snap in when the
  last card is done, and the banked board or podium then stages them.
- **The auctioneer's VOICE is spoken, TV only.** `say()` drives Web Speech from the phrase banks
  (`P_OPEN`/`P_DROP_*`/`P_BID`/`P_GOING`/`P_SOLD`/`P_PASSED`), assembled from the trade's real
  filler words rather than stored whole, with `words()` turning 3100 into "three thousand one
  hundred" — never "thirty-one hundred", which was reported by ear twice: counting in hundreds is
  an American rostrum idiom, and it disagrees with the figure on the screen beside it.
  **Both message handlers must speak the same beats.** The say() calls live in `applyMsg` (phone)
  AND `applyViewerMsg` (TV); they were TV-only at first, so removing the role gate granted phones
  permission for something never invoked — the toggle did nothing, with no error to find.
  `unit/goinggone.test.js` audits the two handlers against each other. The voice is **not** gated
  on `sfxOn` either: it has its own button, and having 🔊 silence it too made a setting look like
  a bug.
  **Any device may speak** — the 🗣️ toggle decides and appears on every screen, including a TV
  that arrived via "…or show an existing auction" (that path sets `isViewer`). It merely DEFAULTS
  off on a phone, because five phones and a telly calling the same lot a beat apart is bedlam;
  `voiceOn()` resolves that default from the role at call time, since the role is not known at
  boot. It cancels rather than queues (a chant lagging the screen is worse than silence), and has its own
  🗣️ toggle. **Web Speech and WebAudio are separate subsystems with separate gates**, so a screen
  that plays music and stingers happily can still be mute — one working tells you nothing about
  the other, and the symptom is identical whatever the cause (he goes quiet and his mouth stops,
  because the mouth is driven by the utterance's own `onstart`). Three causes, and `voiceHint()`
  names the one that actually happened rather than guessing: a page nobody has interacted with is
  refused `not-allowed` (measured in the attract mode: 14 lines handed over, 0 started; one click
  and they play — and nobody clicks a television), a browser with **no voices installed** accepts
  the utterance and plays nothing (common on smart-TV browsers — this is what Neil hit, his laptop
  being fine), and a chosen voice can simply refuse. Only the first is worth a permanent banner,
  because only tapping fixes it; the others take themselves away after 12s. `voiceDiag()` in the
  console prints the lot. **The game is fully playable mute** — every line he speaks is also on
  the screen. `say()` also never cancels and speaks in the
  same tick (that wedges Chrome — the new utterance never starts) and falls back to the browser's
  default voice if the chosen one errors, with a watchdog for the case where nothing starts and
  nothing errors either. All three failures look identical from a sofa: he goes quiet and his
  mouth stops, because the mouth is driven by the utterance's own `onstart`.
  **A clip bank was built to give Silk a voice and abandoned on the sound** — see
  `goinggoneplan-realitems.md`; do not rebuild it without new information. Concatenated single
  words do not sound like a sentence, and the better the voice the worse the joins; the best
  candidate (Piper's `alan`) is also "All Rights Reserved" with nobody left to ask.
  `voiceScore()` ranks rather than first-matches, so Google UK English Male wins where it exists
  (Chrome only — Safari has Apple voices, Silk has none) and any downloaded Premium/Enhanced voice
  is preferred automatically without hard-coding names.
  Recorded clips were considered and rejected: the numbers come out of a live auction,
  so they cannot be pre-recorded, and files would need hosting and licensing this repo has not got.
- **Raises scale with the price** (`RAISE_LADDER`/`raisesFor`) — a fixed +10/+50/+100 needed
  seventy taps to reach a serious bid once lots ran to $10,000. The host validates the raise
  against the ladder *at the current price*; never trust the phone's number.
- **A lot's name/desc must never state or hint at its price** — the game IS guessing the price.
  The first catalogue harvest wrote the price into the flavour text ("A lump of iron with a
  handle. Thirty-eight dollars.") and 59 lots leaked their own answer onto the bidding screen.
  `unit/goinggone.test.js` now fails on `$`-amounts, "dollars"/"cents"/"bucks"/"quid",
  "*n* grand", or any comparative hint ("costs more than a car", "cheapest", "expensive",
  "worth") in either field of the source JSON.
- **Mystery lots show the photo and withhold the name**, chosen from lots that have an image. The
  withholding happens in `lotView` and `stateFor` on the **host** — including on the owner's own
  shelf — because phones render whatever arrives.
- **Over-band lots (≥$10k) keep their full value but are OFF by default.** The simulator is
  unambiguous: one of them takes the winner's margin from ~10% of their score to ~48%. The lever
  is *how many*, never capping the value — capping turns a real price into a fake one, which is
  the thing this rework exists to get away from.
- `data/goinggone-lots-original.json` — the 40 invented lots, retired but safe.
- Photos are **hotlinked** from retailer CDNs and every `<img>` has an `onerror` fallback to the
  lot's emoji. They will rot; that fallback is what stops a dead URL becoming a broken TV.

## Plump Trek specifics

`plumptrek.html` is the only board game: a generated path of nodes with explicit links
(`board[i].next` — a `fork` node has two, so the short cut can differ in length and
rejoin), pawns walked square by square so `gate`s can stop them mid-run. **Cards are
data, not code**: `GIMMICKS`/`FINALES`/`BUILDS` describe effects with a small op set that
`applyOps` interprets (`move`, `moveTo`, `roll`, `skip`, `draw`, `sabotage`, `allMove`,
`hold`, `dare`…), so a new card is one line. The Finale card decides the *win condition*
when the first pawn reaches it — several of them are mini-games (`rps`, `vote`, `guess`,
`dice`, `coin`). Nothing may stall the room: dares (`DARE_MS`), choices (`CHOICE_MS`) and
an idle phone (`IDLE_ROLL_MS`) all time out and play on. Board and shuffles come from a
seeded RNG (`seedRng`/`rnd`), and `?seed=` makes a game reproducible for tests.

Two bits of presentation here are unlike anything else in the repo, and both took a
couple of goes to get right — copy them rather than reinventing:

- **Drawing a path so people can follow it.** A plain wrapped grid reads as disconnected
  rows. `placeSquare(k)` lays the track out in *bands*: `BOARD_RUN` (9) squares across,
  then one square dropped **vertically** below the last of them, then the next run back
  the other way. That corner square is what makes the direction obvious and spaces the
  rows apart. Every square carries its number, and a chevron sits in the *gap* after it
  (`.sqa.r/.l/.d`), so the route is a continuous chain from START to WIN. Square size
  scales with the row count (`--sqs`) so an epic board still fits a 1080p screen.
- **The die** now lives in **`dice.js`** (extracted so any game can roll one); this game
  supplies only its size/skin via `.die` and its own rattle through `onTick`/`onLand`.
  Worth knowing about the motion, because it took several goes: the landing is the easing
  curve over-rotating slightly and rocking back — **not** a scale pop, and **not** a low
  thud with a music duck. Both were tried; both read as a separate event bolted onto the
  end rather than the die settling. The duration the component picks is always under
  `DIE_WAIT`, the beat the host holds before walking the pawn, so the die has landed
  before the piece moves.

- **The player pieces are SPRITES**, and they're the only third-party art in the repo:
  Kenney's CC0 New Platformer Pack + Emotes Pack, repacked into `sprites/trekkers.png`
  (9 poses × 5 characters) and `sprites/emotes.png` (12 balloons). Every animation is a
  fixed frame sequence stepped with `step-end`, never a tween — a flipbook. Five characters
  cover **30 pieces** via a CSS `hue-rotate`, of which the **first 12 are the auto-assigned,
  best-spread pool**. Players pick a piece on the home screen (`fSeat`, `trek-seat`); the
  host grants it (`hostAddPlayer`) and hands out a random free one from the first 12 if it's
  gone; the lobby re-shows the picker with taken pieces crossed out (`lobbyMsg.taken`,
  `hostSetSeat`). There is no emoji avatar — the sprite IS the piece.
  - **A sheet's grid is a contract with the CSS.** The `?v=9x5` token on the background URL
    exists because a browser holding the old PNG against new CSS shows each window across
    *two* frames — sliced trekkers, no error, no clue. Rebuild a sheet with a different row
    or column count and you MUST bump the token.
  - **Mood** (`MOOD`, `MOOD_LOOK`, `REACTIONS`): each trekker carries −3…+3, derived on the
    client by diffing snapshots (nothing on the wire), fading a step each time the turn comes
    round to them. It bends their idle tempo, posture and colour, and — the point — the same
    event reacts differently depending on the mood it lands on. The reaction reads the mood
    the event **landed on**, not the one it leaves behind (`moodPass` snapshots before
    `bumpMood`), or nobody ever gets a first-time reaction.
  - Full reference: **`llmwiki/sprites-and-licensing.md`**.

Inspired by Chungus Odyssey 2 (TTS) — mechanics only; the cast, cards and art are ours,
and the source pack is gitignored, not in the repo. See `plumptrekplan.md`.

## Family Trivia specifics

`familytrivia-pack.json` (101 questions, "The Family Chronicles") is the **source** for the `FAMILY_PACK` constant embedded inside `familytrivia.html`. If you edit the JSON, re-embed it — replace the value of `const FAMILY_PACK = {...};` in the HTML with the JSON file's content (one line, e.g. via a small node script). Scoring is the Rarity Payout: `min(500, round₁₀(100 × answering/correct))`, plus a streak bonus of `50 × (streak − 2)` from 3 in a row.

## Conventions

- Room codes are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I/O, to avoid 1/0 confusion).
- Test tricks for speed: shrink the host timer or `H.qIndex`/`H.timeLeft` via `page.evaluate` rather than waiting out rounds; top-level `let` globals (`roomCode`, `H`) are reachable from `evaluate`.
- Keep games playable at both phone (390×844) and TV (1920×1080) viewports; TV layouts use `vmin` units under a `body.viewer-mode` class.
- **Never interpolate prose into an inline handler.** `onclick="doChoose(${JSON.stringify(label)})"` looks fine until the label contains a quote — it closes the attribute and the button silently does nothing. Plump Trek's fork ("The long way round") stalled the whole game this way. Pass an **index or id** in the handler and put the words in the button's text.
- **Naming & inspiration.** A game's own name (title, `<h1>`, TV logo, filename) must be **original or genuinely generic** — never someone's trademark. Rules and mechanics are free to borrow; names aren't. "Boggle Party" and "Pit!" were renamed to Letter Storm and Corner the Market for exactly this. Where a game *is* inspired by something, say so plainly in a 💡 `.inspo` line on its `index.html` card — preferring the public-domain ancestor when there is one (Fictionary, Guggenheim, Eat Poop You Cat, Werewolf), and naming the commercial game when that's the honest answer. The launcher footer carries the standing disclaimer (original games, not affiliated/endorsed, trademarks belong to their owners). Never copy actual content — card text, word lists, question banks — only mechanics.
