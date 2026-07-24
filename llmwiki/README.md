# llmwiki — game research notes

Reference material gathered while building the games in this repo, so a future
session doesn't have to re-research it. Each file is one topic.

## Index

**Repo-wide conventions**
- [shared-core.md](shared-core.md) — **`common.js`**: the shared first-party file every game loads (`ICE_CFG`, `rankByScore`, `mountScene`, `tvLobby`) + the stale-cache **guard convention**
- [ambient-scenes.md](ambient-scenes.md) — **`mountScene`**: themed figures ambling along the bottom of the TV (sheep, cows, bingo balls, pirates, wolves, …) — themes & how to add one
- [tv-lobby.md](tv-lobby.md) — **`tvLobby`**: boggleparty's "waiting for players" big-screen layout, now shared across every game (always-square QR, room code, chips, ⛶)
- [podium-and-scoring.md](podium-and-scoring.md) — tie-aware podiums: `rankByScore` (competition ranking) + `mrank-*` block colours so equal scores share a place
- [simulation-modes.md](simulation-modes.md) — the `?mode=tvsimulation` / `?mode=playersimulation` self-playing demos on every game: URLs, the bot-driver pattern, coverage
- [animation-conventions.md](animation-conventions.md) — the "house style" for animation & graphics: themed ambient backgrounds, entrance FX, win moments, the hard rules that keep tests green

**Pit (trading game)**
- [trading-hand-signals.md](trading-hand-signals.md) — open-outcry hand signals in London, New York & Chicago pits (buy/sell, quantity, price, months)
- [pit-heritage.md](pit-heritage.md) — the LIFFE / CBOT / NYMEX trading-floor look: coloured firm jackets, badges, paper slips, the bell, when the pits closed
- [pit-game-design.md](pit-game-design.md) — how `pit.html` translates that heritage into a party game: visuals, audio direction, simulation mode, rules

## How this connects to the code

`pit.html` is the game these notes feed. The heritage details here drive:
- the multi-colour **pit crowd** + **trader badges** + **floor paper** on the TV (`pitCrowdHTML`, `.tfig`, `badgeHTML`)
- the **open-outcry hand signals** on the shout button / offers / TV (`handSigHTML`)
- the **uplifting-corporate music** + **trading-floor SFX** (the AUDIO section)
