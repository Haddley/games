# Simulation / demo modes (repo-wide)

Every multiplayer game in this repo now ships two hands-off, self-driving demo modes,
plus single self-play for the games without a spectator/player split. First built in
`pit.html`, then ported to all games.

## URLs

- `?mode=tvsimulation` — open the **spectator / TV** view; the game plays itself.
- `?mode=playersimulation` — open the **phone / player** view; "You" (player #1 / host) auto-plays.
- `?mode=simulation` — back-compat **alias for tvsimulation**.
- `&players=N` — player count (clamped to each game's MIN..MAX), default 4.

Examples: `pit.html?mode=tvsimulation&players=6`, `familytrivia.html?mode=playersimulation`.

## How it works (the pattern)

No PeerJS, no real players — bots run the whole game locally:

- Bots are added via the game's own `hostAddPlayer(...)` and registered as **stub
  connections**: `guestConns[botId] = { peer: botId, send() {} }`, so `connectedPlayers()`
  counts them and `send(conn,...)` is a harmless no-op.
- **TV mode** sets `isHost=true; isTvHost=true; myId='__sim_host__'` + `viewer-mode`.
- **Player mode** sets `isHost=true; isTvHost=false; myName='You'; myId='__you__'` and
  adds "You" as player #1, then bots.
- A phase-guarded timer/loop drives the game through every phase to gameover, then loops
  (`hostNewGame`). Bots apply inputs through the game's real host handlers (valid, plausible
  answers/bids/votes/words/strokes); "You" drives the real phone UI where practical.
- Games that lacked TV-host support (boggle, liarsdice) got a small sync hook that feeds
  `viewerStateMsg()`/`buildViewerDisplay()` into the viewer render (mirroring pit's
  `tvHostSync`). boggle also got a stub viewer connection.

Boot routing parses `?mode=` **before** the normal `?room` handling and calls
`startSimulation(n, 'tv'|'player')`.

## Coverage & caveats

- **Both modes:** pit, familytrivia, categoryclash, bestguess, herdmind, fibbers, oddsheep,
  brokenpencil, doodleparty, goinggone, bingo, moonlightvillage, boggleparty, boggle, liarsdice.
- **rockpaperscissors** (newest game) ships `?mode=tvsimulation` (bots throw ✊✋✌️ each
  round to a champion) — the fastest way to watch its elimination/stalemate flow.
- **Single self-play** (no spectator/player split): ticktacktoe (two bots, both mode params
  do the same thing).
- **Excluded:** skydive, synthwave — single-player real-time arcade, no host/phase model.
- **Audio:** these run silent until the first tap anywhere (browser autoplay policy).
- **Great for QA/design:** loading `?mode=tvsimulation` is the fastest way to watch a game's
  full flow, animations, and audio without wiring up phones — used heavily to verify the
  animation-polish pass.

Verified: 30 headless runs (15 games × 2 modes) advance past the lobby with zero pageerrors.
