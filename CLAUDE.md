# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Multiplayer browser games served by GitHub Pages at https://haddley.github.io/games/ — published straight from the `main` branch root (`.nojekyll`). **There is no build, lint, or bundle step.** Each game is one (almost) self-contained HTML file with all CSS/JS inline; the shared dependencies are CDN scripts (PeerJS 1.5.4, qrcode-generator 1.4.4), Google Fonts, a Metered TURN relay (see "Connection transport" below), and one small first-party file — **`common.js`** at the repo root, a shared core that every P2P game loads via `<script src="common.js">`. It provides `ICE_CFG` (TURN config), the `rankByScore` podium helper, and an **ambient-scene engine** (`mountScene(theme)` / `mountMeadow()`): a themed CSS scene of figures ambling along the bottom of the TV/viewer screen (shown only under `body.viewer-mode`). Each game opts in with one line, e.g. `mountScene('pirates')`; themes live in `SCENE_THEMES` in common.js (`meadow` = the CSS-drawn woolly flock for the farm games; the rest are themed emoji casts — `pirates`, `night`, `letters`, `library`, `carnival`, `art`, `bingo`, `auction`, `masks`, `mystery`, `market`, `tictactoe`). The scene shows under `body.viewer-mode` **or** `body.tv-mode` (ticktacktoe uses the latter). ticktacktoe loads common.js **only** for `mountScene` — it still uses its own inline `TTT_PEER_OPTS` for connections, not `ICE_CFG`/`rankByScore`. skydive, synthwave and index.html don't load common.js at all.

`index.html` is the launcher grid — add a card there when adding a game. Each game has a companion plan (`bogglepartyplan.md`, `familytrivia.md`, …) written before the game was built; keep these as the reference for game rules and protocol design.

## Commands

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:e2e                                 # all E2E tests (headless)
npm run test:e2e:headed                          # watch the games play
npx playwright test tests/familytrivia.e2e.spec.js   # one game's suite
python3 -m http.server 8231                      # manual dev server (Playwright starts its own)
```

Tests need internet (public PeerJS broker; boggleparty also fetches the ENABLE dictionary from GitHub). They run with **1 worker, no parallelism** — the games are stateful P2P and each test drives several pages (host phone, guest phones, TV) in one browser. Screenshots land in `screenshots/` (gitignored) — the tests are as much a screenshot tour for eyeballing the UI as they are assertions.

## Architecture: how every multiplayer game works

The P2P pattern is identical across `boggle.html`, `pit.html`, `boggleparty.html`, `familytrivia.html` — read one to understand all (boggleparty and familytrivia are the most complete):

- **Host-authoritative state.** Whichever browser creates the room registers a PeerJS peer ID of `<GAME-PREFIX>-<4-letter code>` (e.g. `BGPARTY-KWXZ`, `FAMTRIV-ABCD`) and holds the single source of truth in a global `H` object. Guests hold no game logic; they send inputs and render whatever message last arrived.
- **Two client roles**, decided by the first message on a connection: `{type:'join', name}` → player (tracked in `guestConns{}`), `{type:'join_viewer'}` → TV/scoreboard (tracked in `viewerConns{}`). Viewers get their own `viewer_*` message variants with spectator-shaped payloads.
- **TV-host mode**: the big screen itself can create the room. It runs the authoritative host logic but renders the viewer UI (`isTvHost`), and the **first player to join becomes captain** — their phone drives settings/start/next via `{type:'ctl', action}` messages that the host only accepts from `H.players[0]`.
- **Rendering** is string-built `innerHTML` from a `render()` switch on a global `ui` state string. High-frequency updates (timer ticks, counters) **patch DOM nodes by id** instead of re-rendering, so in-progress touch interaction is never interrupted.
- **Reconnects**: a rejoining player with a known name whose old connection is dead takes over the "zombie" slot (`zombie.id = conn.peer`); viewers retry connecting once before giving up.
- **QR joining**: host/TV lobbies render a QR of `?room=XXXX`; the page pre-fills the join form from that query param on load.
- **Connection transport (TURN/ICE)**: WebRTC needs a TURN relay for players on restrictive/remote networks (symmetric NAT, mobile carriers, corporate wifi) — STUN alone only connects friendly NATs, which is why same-LAN players work but a remote player fails with "Negotiation of connection failed". `ICE_CFG` (and the `rankByScore` podium helper) now live in **`common.js`** at the repo root — a small shared-core script each game loads with `<script src="common.js"></script>` in its `<head>`, *before* the inline `<script>`, so `ICE_CFG` is a global the game passes to **every** `new Peer(...)` call — host `new Peer(id, ICE_CFG)`, guest/viewer `new Peer(undefined, ICE_CFG)`. ticktacktoe is the exception: it's class-based and still inlines the same `iceServers` array (inside `TTT_PEER_OPTS`) for its own connections — it loads `common.js` only for the ambient `mountScene`, not for `ICE_CFG`. **When adding a game or a `new Peer` call, load `common.js` and pass `ICE_CFG`, or remote players silently can't join.** The Metered credentials are hardcoded in `common.js` (free tier, 50 GB/mo shared quota); rotate them in the Metered dashboard if the quota is abused. `common.js` is deliberately tiny/stable — a syntax error there breaks *every* game at once, so only truly-identical primitives belong in it; each game is otherwise still a self-contained file.
- **Broker reconnect**: the PeerJS signaling broker periodically drops a peer's socket, which de-registers the host's room ID so *new* guests get `peer-unavailable` ("Could not reach room") even though the host tab still shows the lobby. herdmind's `makeRoom` handles this with `peer.on('disconnected', () => peer.reconnect())` and treats `network`/`server-error`/`socket-*` errors as recoverable instead of tearing down the room; its `joinGame` retries the whole connect up to twice (700 ms apart) covering both `peer-unavailable` and negotiation failures. This resilience is **not yet ported to the other games** — replicate it when hardening join flakiness.

## Audio & animation conventions

Every game has a self-contained procedural WebAudio engine and a CSS/JS FX stack. **`brokenpencil.html` and `herdmind.html` are the reference implementations** — copy patterns from them when polishing another game.

- **Engine basics**: `ac()` lazy-inits on first pointer gesture (autoplay policy); `musicGain` ≈ 0.33, `sfxGain` ≈ 0.55; `TRACKS` is a step sequencer (32 sixteenth-steps per bar-pair, `bassBars`/`leads`/`pads`/`hat`/`kick`/`stab` lanes, per-track `waves` + swing); `setMusic(track)` switches per game phase; `musicUrgent` (timer low) lifts the lead an octave and adds hats.
- **The music quality stack** (apply all five when touching a game's audio):
  1. `duckMusic(dur)` — sidechain-style dip of `musicGain` called at the top of big stingers (win fanfare, fail trombone, moo) so they read clearly over the music.
  2. **Adaptive layers** — `musicIntensity` (0/1 = rhythm section ± lead, 2 = full arrangement); `playMusicStep` gates stabs/arp on intensity ≥ 2 and lead on ≥ 1 (urgency forces full); `setMusic` sets the per-track default (answer/work tracks start lean); a `bump*Intensity` helper raises it as player progress comes in (call it from BOTH phone `applyMsg` and TV `applyViewerMsg`, including patch branches).
  3. **Match-point key change** — `musicKeyShift` (+2 semitones) applied to every melodic voice (bass, stabs, lead, arp) when the decisive round starts (score ≥ target−1, or final chain/round); reset to 0 on lobby/podium tracks.
  4. **Count-in fills** — `setMusic` plays a one-beat rising snare fill and pushes `musicNext` past it so the new track enters on a downbeat instead of hard-cutting.
  5. **Winner's motif** — `sWin` opens by quoting the first ~8 notes of the game's own `TRACKS.lobby.leads[0]` melody before the trill + crash, so each game's fanfare is its own hummable tune.
- **Animation rules**: entrance animations are gated on `#app.fresh` (set only on real screen changes) so same-screen re-renders never re-trigger them; high-frequency updates patch DOM by id; every decorative JS effect early-returns on `REDUCED` (`prefers-reduced-motion`), and the stylesheet kills all animation under the same media query.
- **FX helpers** available in the reference games: `burst` (particle explosion), `popText` (floating score text), `startConfetti`, `emojiRain`, `flashEdge` (full-screen edge glow), `body.time-low` vignette during final seconds, suspense curtains (`votes-curtain`), shine sweeps (`.win::after`), and ambient layers (`#meadow` grazing sheep, `#doodle-bg` drifting doodles).

## TURN relay (metered.ca)

Cross-network play relies on a TURN relay from **Metered** (metered.ca — "Open Relay"). Account/usage facts a future instance needs:

- **Why we pay for it at all**: PeerJS's default config is STUN-only, which cannot connect a peer behind a symmetric/restrictive NAT (mobile carriers, corporate wifi). TURN relays that peer's traffic. Without it, same-LAN players connect but remote players fail — see "Connection transport" above.
- **Plan & quota**: free tier, **~50 GB/month** of relayed traffic, shared across *all* games and *all* players (the same credentials are reused everywhere). TURN only carries traffic when a direct P2P path can't be established, but data-heavy games (doodleparty, brokenpencil drawings) consume more relay than text games. If the monthly quota is exhausted, TURN stops relaying and remote players silently fail again until it resets — check the **Metered dashboard** (dashboard.metered.ca) for usage.
- **The `iceServers` set** each game embeds (STUN + TURN across ports/transports so at least one punches through any firewall; the `:443` and `turns` TLS entries are what tunnel through HTTPS-only networks):
  - `stun:stun.relay.metered.ca:80`
  - `turn:standard.relay.metered.ca:80` (and `:80?transport=tcp`)
  - `turn:standard.relay.metered.ca:443`
  - `turns:standard.relay.metered.ca:443?transport=tcp`
- **Credentials**: a Metered username + credential, **hardcoded in cleartext** in `common.js`'s `ICE_CFG` (and, separately, ticktacktoe's inline `TTT_PEER_OPTS`). Current username: `35410ce7572a64d0dad7b813`. They're public (visible in page source) — acceptable for family games, but anyone can burn the quota. **To rotate** (new key from the Metered dashboard): change the username+credential in **`common.js`** (one place, ~5 lines) and in **ticktacktoe.html**, then verify (`common.js` parses; a game page loads it and `typeof ICE_CFG === 'object'`).
- **No backend**: because the games are static HTML with no server, credentials are long-lived and embedded rather than minted per-session. A credential-vending endpoint would be the "correct" hardening but is overkill unless quota abuse actually happens.

## Family Trivia specifics

`familytrivia-pack.json` (101 questions, "The Family Chronicles") is the **source** for the `FAMILY_PACK` constant embedded inside `familytrivia.html`. If you edit the JSON, re-embed it — replace the value of `const FAMILY_PACK = {...};` in the HTML with the JSON file's content (one line, e.g. via a small node script). Scoring is the Rarity Payout: `min(500, round₁₀(100 × answering/correct))`, plus a streak bonus of `50 × (streak − 2)` from 3 in a row.

## Conventions

- Room codes are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I/O, to avoid 1/0 confusion).
- Test tricks for speed: shrink the host timer or `H.qIndex`/`H.timeLeft` via `page.evaluate` rather than waiting out rounds; top-level `let` globals (`roomCode`, `H`) are reachable from `evaluate`.
- Keep games playable at both phone (390×844) and TV (1920×1080) viewports; TV layouts use `vmin` units under a `body.viewer-mode` class.
