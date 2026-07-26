# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Multiplayer browser games served by GitHub Pages at https://haddley.github.io/games/ — published straight from the `main` branch root (`.nojekyll`). **There is no build, lint, or bundle step.** Each game is one (almost) self-contained HTML file with all CSS/JS inline; the shared dependencies are CDN scripts (PeerJS 1.5.4, qrcode-generator 1.4.4), Google Fonts, a Metered TURN relay (see "Connection transport" below), and **five small first-party shared files** at the repo root — **`common.js`**, **`p2p.js`**, **`fx.js`**, **`audio.js`** and **`ambient.js`** (see **Shared files** below). The core is **`common.js`**, which every P2P game loads via `<script src="common.js">`. It provides `ICE_CFG` (TURN config), the `rankByScore` podium helper, the shared **day/night theme + player-name prefs** and the injected top-right **control strip** (⛶ fullscreen · 🌙 day/night · 🎵 music · 🔊 sound), the shared **TV "waiting for players" lobby** (`tvLobby`), and an **ambient-scene engine** (`mountScene(theme)` / `mountMeadow()`): a themed CSS scene of figures ambling along the bottom of the TV/viewer screen (shown only under `body.viewer-mode`). Each game opts in with one line — **always guarded**: `typeof mountScene === 'function' && mountScene('pirates');` (the call sits at the TOP of the game's inline script; without the guard, a browser serving a *stale cached common.js* without `mountScene` throws a ReferenceError that halts the whole script → blank page, no QR. Keep the guard on every `mountScene`/`mountMeadow` call). Themes live in `SCENE_THEMES` in common.js (`meadow` = the CSS-drawn woolly flock for the farm games; the rest are themed emoji casts — `pirates`, `night`, `letters`, `library`, `carnival`, `art`, `bingo`, `auction`, `masks`, `mystery`, `market`, `tictactoe`, `rps`). `bingo` and `cows` are CSS-drawn actors (not emoji), like `meadow`'s flock. The scene shows under `body.viewer-mode` **or** `body.tv-mode` (ticktacktoe uses the latter). ticktacktoe loads common.js for `mountScene`, the control strip and the reconnect helpers — but still uses its own inline `TTT_PEER_OPTS` for connections, not `ICE_CFG`/`rankByScore`. index.html doesn't load common.js.

`index.html` is the launcher grid — add a card there when adding a game. Each game has a companion plan (`letterstormplan.md`, `familytrivia.md`, …) written before the game was built; keep these as the reference for game rules and protocol design.

## Shared files (repo root)

Five tiny, stable first-party scripts hold everything that was identical across games. Each game loads the ones it needs in `<head>` **before** its inline `<script>`, so their names are globals. **A syntax error in any of these breaks every game that loads it — always run the smoke e2e (`npx playwright test tests/smoke.e2e.spec.js`) after editing one; a `node` "new Function" parse check only catches *syntax*, not a runtime `ReferenceError`** (a stray `mode` token once parsed fine but blanked every game — see the memory note).

- **`common.js`** — the P2P/UI core: `ICE_CFG` (TURN), `rankByScore` podium helper, the ambient-scene engine (`mountScene`/`SCENE_THEMES`), the shared TV lobby (`tvLobby`), the injected top-right **control strip** (`mountControls`: ⛶ fullscreen · 🌙 day/night · 🎵 music · 🔊 sound — self-mounts on `DOMContentLoaded`, reusing the game's `#sound-togs`/`.audio-togs` container), shared prefs (`savedName`/`saveName` via any `<input data-save-name>` + the shared `games-name` key; `savedTheme`/`applySavedTheme`/`toggleTheme` + `body.day` light mode + the shared `games-theme` key), and the **connection-resilience helpers**: `clientId()` (per-tab device id in sessionStorage, sent with every `join` so a host can match a returning player), `rememberRoom`/`savedRoom`/`forgetRoom` (per-tab memory of the room, so a refresh rejoins), `setNetState('relay'|'stun'|'local'|'checking'|'none')` / `setRelayBadge(on)` (the connection-path button in the strip — **every game shows it once connected**, naming the mechanism that actually got the two devices talking: 📡 TURN relay, 🌐 STUN hole-punch (direct across networks), 🏠 same wifi/LAN (no server at all), ⏳ still settling, `'none'` = not in a room, badge hidden. Tapping explains it. `?net=0` on any game URL hides it for good, `?net=1` restores it, sticky per browser) and `setHTML(el, html)` (innerHTML swap that blurs/restores focus so a phase change can't strand the iOS keyboard — every game's `render()` goes through it, guarded). Every P2P game loads it; `index.html` loads it too (for the strip + theme).
- **`p2p.js`** — PeerJS hardening: `makeRoomCode()`, `hostPeer(fullId,{…})` (broker-drop reconnect), `joinPeer({…})` (join retry **and** mid-game auto-rejoin), `p2pCurtain(on)` (the self-contained "Reconnecting…" overlay) and `p2pWatchRelay(conn)` / `p2pPath()` (polls `getStats()` for the selected candidate pair and maps its candidate types to relay/srflx+prflx/host → `setNetState`; tries `transport.selectedCandidatePairId`, then a nominated/succeeded pair, then the raw candidate list for older WebKit, and accepts WebKit's `relayed` spelling. A host holding several connections shows the most notable path: relay > stun > local). Every P2P game routes `new Peer` through these (always with `ICE_CFG`). A game opts into auto-rejoin by passing `onLost: () => { connected = false; }` to `joinPeer`; `onGiveUp(wasIn)` says whether it was a failed join or a lost game.
- **`fx.js`** — visual FX: `burst(x,y,colors,n)` (particles; self-contained `.fxp` CSS), `popText(x,y,text,cls)` (floating text; uses the game's own `.pop` CSS), `startConfetti(ms,cols)` (owns one `#fx-confetti` canvas; reads the game's `const CONFETTI_COLS`). All early-return on a global `REDUCED`. (`emojiRain`/`flashEdge` are still inline in the 1–2 games that use them.)
- **audio — pick exactly ONE profile per game:**
  - **`audio.js`** — the full step-sequencer engine's byte-identical core (`tone()`, `startMusicLoop()`). A game using it still writes inline `ac()`, `TRACKS`, `playMusicStep()`, `setMusic()`, `duckMusic()` and its `s*` stingers — those are hand-tuned per game. Used by the 15 music games.
  - **`ambient.js`** — the *lightweight* alternative: a drifting chord pad + simple `tone()` + SFX bus (`ac`, `tone`, `duck`, `startPad`/`stopPad`; pad mood via `const AMBIENT_CHORDS`). Almost no authoring — good default for a new game that doesn't need composed music. Used by rockpaperscissors. **Never load both** (both define `ac()`/`tone()`).

ticktacktoe is the partial exception: it keeps its own class-based connection code and inline `TTT_PEER_OPTS` + audio (and its TV room runs a **knockout tournament** — `this.tour`, see `ticktacktoeplan.md`), but loads `common.js` (for `mountScene`, the strip, `clientId`, `rememberRoom`) and `p2p.js` (only for `p2pCurtain` + `p2pWatchRelay`, both called through guarded `ttt*` wrappers).

## Commands

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:unit                                # fast unit tests for common.js (Node built-in runner, no browser)
npm run test:e2e                                 # all E2E tests (headless)
npm run test:e2e:headed                          # watch the games play
npx playwright test tests/smoke.e2e.spec.js      # broad smoke net (every game loads + scene + square QR)
npx playwright test tests/familytrivia.e2e.spec.js   # one game's suite
python3 -m http.server 8231                      # manual dev server (Playwright starts its own)
```

`unit/` holds pure-JS unit tests for `common.js` (`node --test`, no deps). `tests/`
holds the Playwright e2e specs, incl. `smoke.e2e.spec.js` which loads **every** game
and asserts common.js is wired, the ambient scene builds, the TV-lobby QR is square,
a stale `common.js` can't blank a game, and the 📡 relay badge + reconnect curtain
mount/unmount. `reconnect.e2e.spec.js` covers the resilience end to end (a dropped
phone rejoining its seat, a browser refresh, the crown passing and coming back);
`ticktacktoe.e2e.spec.js` does the same for its bespoke connection code; `relay.e2e.spec.js`
forces `iceTransportPolicy:'relay'` so a real TURN-relayed link must light the 📡 badge.

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
- **Reconnects**: three layers. (1) The host keeps a dropped player's slot: a rejoining `join` takes over the "zombie" slot, matched on `msg.cid` (the device id from `clientId()`) first and the name second (`zombie.id = conn.peer`). (2) The phone/TV *re-joins itself* — `joinPeer` raises the shared curtain on a mid-game close and retries 10× (0.6s → 4s backoff) before giving up. (3) A browser refresh walks back in via `savedRoom()` in each game's `boot()`. The **host/TV is never remembered** — `H` can't survive a reload, so re-creating an empty room would be a lie; that's the one unrecoverable failure.
- **👑 Captain = first CONNECTED player** (`capPlayer()` = `connectedPlayers()[0] || H.players[0]`), never plain `H.players[0]` — otherwise a captain whose phone sleeps freezes the room with nobody able to press Start/Next. When the crown moves, `capSync(prevCapId)` (called deferred from both `case 'join'` and `conn.on('close')`) re-syncs only the two phones involved plus the TV — never a full broadcast, which would interrupt everyone else mid-interaction. Whatever a captain can drive, their own phone must actually show: check the podium/"play again" screen too.
- **QR joining**: host/TV lobbies render a QR of `?room=XXXX`; the page pre-fills the join form from that query param on load.
- **Connection transport (ICE: host → STUN → TURN)**: WebRTC tries three kinds of path, in order, and the one it settles on is what the badge reports (see below): **host** candidates (both devices on the same wifi — no server involved), **server-reflexive** candidates (a **STUN** server tells each device its public address and the two NATs hole-punch — this is what two phones on *different* networks normally get), and finally **relay** candidates (**TURN** forwards every packet, for peers behind symmetric/restrictive NATs — mobile carriers, corporate wifi — where no direct path exists). STUN-only was the old default and is why same-LAN players worked while some remote players failed with "Negotiation of connection failed"; TURN is the fallback that fixes those, not the normal path. `ICE_CFG` lives in **`common.js`**, loaded in each game's `<head>` *before* the inline `<script>`, so it's a global the game passes to **every** `new Peer(...)` — host `new Peer(id, ICE_CFG)`, guest/viewer `new Peer(undefined, ICE_CFG)`. ticktacktoe is the exception: it's class-based and inlines the same `iceServers` array (inside `TTT_PEER_OPTS`) for its own connections, while loading `common.js`/`p2p.js` for the scene, strip and reconnect helpers. **When adding a game or a `new Peer` call, load `common.js` and pass `ICE_CFG`, or remote players silently can't join.**
- **Seeing which path you got**: `p2p.js` polls `getStats()` on the live `RTCPeerConnection`, maps the selected candidate pair's types, and every game shows the result in the control strip — 🏠 same network · 🌐 STUN/direct · 📡 TURN relay · ⏳ settling (`?net=0` hides it). `p2pPath()` returns the same value in the console. **A direct connection across two networks is the normal, healthy result** — "no 📡" almost always means STUN did its job, not that detection broke. `tests/relay.e2e.spec.js` forces `iceTransportPolicy:'relay'` to exercise the TURN path for real, because two browsers on one machine always connect 🏠.
- **Broker reconnect**: the PeerJS signaling broker periodically drops a peer's socket, which de-registers the host's room ID so *new* guests get `peer-unavailable` ("Could not reach room") even though the host tab still shows the lobby. herdmind's `makeRoom` handles this with `peer.on('disconnected', () => peer.reconnect())` and treats `network`/`server-error`/`socket-*` errors as recoverable instead of tearing down the room; its `joinGame` retries the whole connect up to twice (700 ms apart) covering both `peer-unavailable` and negotiation failures. This now lives in `p2p.js` (`hostPeer`/`joinPeer`) and every game uses it, ticktacktoe included (hand-ported).

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
- **Credentials**: a Metered username + credential, **hardcoded in cleartext** in `common.js`'s `ICE_CFG` (and, separately, ticktacktoe's inline `TTT_PEER_OPTS`). Current username: `35410ce7572a64d0dad7b813`. They're public (visible in page source) — acceptable for family games, but anyone can burn the quota. **To rotate** (new key from the Metered dashboard): change the username+credential in **`common.js`** (one place, ~5 lines) and in **ticktacktoe.html**, then verify (`common.js` parses; a game page loads it and `typeof ICE_CFG === 'object'`).
- **No backend**: because the games are static HTML with no server, credentials are long-lived and embedded rather than minted per-session. A credential-vending endpoint would be the "correct" hardening but is overkill unless quota abuse actually happens.

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
- **The die.** A real CSS cube (`.cube` + six pipped `.face`es, `FACE_ROT` maps a value
  to the rotation that brings its face forward), thrown with a randomised duration and a
  spin that scales with it, so no two throws look alike. The landing is the easing curve
  over-rotating slightly and rocking back — **not** a scale pop, and **not** a low thud
  with a music duck; both were tried and both read as a separate event bolted onto the
  end rather than the die settling. Throws are capped under `DIE_WAIT`, the beat the host
  holds before walking the pawn, so the die has always landed before the piece moves.
  Over 6 shows numerals instead of pips (the SPEEDRUN build swaps in a d20).

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
