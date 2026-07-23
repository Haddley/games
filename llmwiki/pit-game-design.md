# pit.html — design decisions

How the trading-floor heritage ([pit-heritage.md](pit-heritage.md),
[trading-hand-signals.md](trading-hand-signals.md)) becomes a phone-controlled party game.
Architecture (host-authoritative PeerJS, phones + TV viewer) is shared with the other
games — see the repo `CLAUDE.md`. This file records the *Pit-specific* choices.

## Players & deck

- **3–8 players** (`MIN_PLAYERS = 3`). Classic Pit needs 3+; it shines at 5–8.
- **Commodities in play = player count**, 9 cards per commodity → **9 cards each**.
  So 3 players = 3 suits (remove the rest), 4–8 players = that many suits. Authentic.
- Optional **Bull & Bear** cards (`bullBear`): 8-of-a-suit + Bull = Bull Corner (full
  points); 9 + Bull = **Double Bull** (×2). Anyone caught holding a Bull/Bear when someone
  else corners loses **20 per card**.
- Win score 300 / 500 / 750.

## Cornering & the bell (answers to common questions)

- The host **auto-detects** a valid corner every state update (`bestCorner` in
  `stateFor`): hold 9 of one suit (or 8 + Bull) and `canCorner` flips true.
- That makes the pulsing **🔔 CORNER** button appear **automatically** on that player's
  phone (`cornerBtnHTML`) — the player never has to figure out they've won, they just tap.
- The **bell rings on both** phone and TV (`sBell`), plus an opening-bell 3-2-1 countdown.
  (Historically some Pit editions had no bell — you just shouted "Corner!")

## Heritage visuals

- **Trader badges** — `traderBadge(name)` → acronym + 100–999, rendered as a laminated
  clip-on badge (`badgeHTML`) on phone strips, TV floor, lobby, standings, podium.
- **Pit crowd** — `pitCrowdHTML` draws ~16 waving traders in **multi-colour firm jackets**
  (`JACKETS` palette) behind the whole TV show, with **floor paper** scattered below.
- **Hand signals** — `handSigHTML(n)` draws the open-outcry **quantity** signal (1–4
  vertical fingers) on the shout button, the shouting banner, and over shouting traders on TV.
- **Paper** — `flyTradeSlips` (slips fly trader→trader on each trade), `paperStorm`
  (blizzard at corner/close), `.floorslip` (litter).

## Audio direction

Two influences, blended: **(1) open-outcry trading floor** (bell, ticker, crowd roar,
cash register) for SFX, and **(2) "Trading — Motivational Background Music"** (uplifting
corporate: ~116–128 BPM, four-on-the-floor, bright plucked arps, warm pads, anthemic
leads) for the music. Engine is the shared step-sequencer (see `CLAUDE.md` audio section):
adaptive intensity, match-point key shift, count-in fills, winner's motif.

- `lobby` — warm, optimistic, mid-tempo (doors about to open).
- `trading` — driving four-on-the-floor engine-room; intensity swells with shout activity.
- `corner` — triumphant uplift.
- `over` — full victory anthem.
- SFX: `sTrade` = cash-register cha-ching (scaled by bundle size), `sShout` = open-outcry
  bark + ticker burst, `sRoar` = crowd swell on the open, `sBell` = layered metallic bell,
  `sBuzz` = bear-penalty growl.

## Simulation / demo modes

Two hands-off, self-driving demos (add `&players=N`, default 4, clamped 3–8). Both are
purely local — no PeerJS, no real people — with bots counted as connected via stub
`guestConns` so the normal host flow drives everything. A single tap unlocks audio
(browser autoplay rule) — otherwise they run silent.

- **`?mode=tvsimulation`** — the **spectator / big-screen** perspective: watch the trading
  floor play itself (crowd, offer pills, trade feed, ticker, corner bell, podium).
  `?mode=simulation` is a back-compat alias for this.
- **`?mode=playersimulation`** — the **player / mobile-phone** perspective: "You" are trader
  #1 and auto-play — cards get selected, you SHOUT (with the hand signal), trades flash,
  and when your hand is a corner the pulsing 🔔 CORNER button appears and gets rung.

Shared core: `startSimulation(n, mode)` → `simRound` → `simBotAction` (bots dump their
least-held suit; equal counts auto-swap) → `simForceCorner` (guarantees resolution, drops a
Bear for the penalty). Player mode adds `simYouAction` (drives your real select→shout UI).
