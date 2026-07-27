# Simulation / demo modes (repo-wide)

Every multiplayer game in this repo now ships two hands-off, self-driving demo modes,
plus single self-play for the games without a spectator/player split. First built in
`cornerthemarket.html`, then ported to all games.

## URLs

- `?mode=tvsimulation` — open the **spectator / TV** view; the game plays itself.
- `?mode=playersimulation` — open the **phone / player** view; "You" (player #1 / host) auto-plays.
- `?mode=simulation` — back-compat **alias for tvsimulation**.
- `&players=N` — player count (clamped to each game's MIN..MAX), default 4.

Examples: `cornerthemarket.html?mode=tvsimulation&players=6`, `familytrivia.html?mode=playersimulation`.

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
- Games that lacked TV-host support (liarsdice) got a small sync hook that feeds
  `viewerStateMsg()`/`buildViewerDisplay()` into the viewer render (mirroring pit's
  `tvHostSync`).

Boot routing parses `?mode=` **before** the normal `?room` handling and calls
`startSimulation(n, 'tv'|'player')`.

## Coverage & caveats

- **Both modes:** pit, familytrivia, categoryclash, bestguess, herdmind, fibbers, oddsheep,
  brokenpencil, doodleparty, goinggone, bingo, moonlightvillage, letterstorm, liarsdice.
- **rockpaperscissors** (newest game) ships `?mode=tvsimulation` (bots throw ✊✋✌️ each
  round to a champion) — the fastest way to watch its elimination/stalemate flow.
- **Single self-play** (no spectator/player split): ticktacktoe (two bots, both mode params
  do the same thing).
- **Audio:** these run silent until the first tap anywhere (browser autoplay policy).
- **Great for QA/design:** loading `?mode=tvsimulation` is the fastest way to watch a game's
  full flow, animations, and audio without wiring up phones — used heavily to verify the
  animation-polish pass.

Verified: 30 headless runs (15 games × 2 modes) advance past the lobby with zero pageerrors.

## The phone demo starts in the LOBBY (plumptrek, rockpaperscissors)

`?mode=playersimulation` used to add every bot at once and start the game immediately, so the
demo skipped the part a new player actually meets first — the room filling up, and the
captain's controls on it. In RPS that mattered: the attract mode never showed the only screen
that explains there are **two ways to play**.

Those two games now add bots one at a time on a ~1.1s beat, hold the full lobby for a couple
of seconds, then play on. Roughly:

```js
if (!isTvHost) {
    myId = 'sim-0'; addBot(0); applyMsg(lobbyMsg());
    let joined = 1;
    simTimer = setInterval(() => {
        if (joined < want) { addBot(joined++); applyMsg(lobbyMsg()); return; }
        clearInterval(simTimer);
        simTimer = setTimeout(() => { hostStartGame(); /* …then the usual driver */ }, 1800);
    }, 1100);
    return;
}
```

**The other sixteen games still jump straight in.** Their `startSimulation` functions vary
too much in shape for a safe scripted edit — several have no `hostStartGame()` to anchor to —
and a blind pass across all of them is how half-wired changes get in. Apply the pattern per
game as each lobby earns it.
