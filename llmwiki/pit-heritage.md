# Trading-floor heritage — the look & sound of open outcry

Visual + audio reference for the `pit.html` party game.

## The coloured jackets (LIFFE, London)

The London floor was **not** all-red — it was a riot of colour. Each firm wore its own
jacket colour for instant identification across a packed pit:

- LIFFE **locals** (independent traders) wore distinctive **red** jackets embroidered "LIFFE".
- Member firms used **blue, green, orange, gold/yellow, cyan, purple, pink** — firm-specific.
- Jackets carried **embroidered patches** (exchange affiliation), **firm badges**, and sometimes **sponsor logos** on the sleeves/chest.
- Traders wore a **clip-on ID badge** with an acronym + number (e.g. the "KB 737" seen in floor photos) — short so it could be read/shouted fast.

→ In the game: the TV **pit crowd** (`pitCrowdHTML` / `.tfig`) draws waving traders in a
palette of these firm colours, each with a white clip-on badge; every player gets a
generated **badge** (`traderBadge` → acronym + 100–999 number) shown everywhere.

## The paper

Order slips ("decks") were scribbled and **thrown** — the floor was carpeted in paper by
the close, and photos show it ankle-deep during a frenzy.

→ In the game: paper slips **fly between traders** on every trade (`flyTradeSlips`), a
**paper storm** rains at a corner/close (`paperStorm`), and slips **litter the floor**
under the TV crowd (`.floorslip`).

## The bell

The **opening/closing bell** bracketed the session; ringing the bell = the iconic moment.
In Pit the card game, cornering a market and "ringing the bell" (or shouting **"Corner!"**)
wins the hand — some editions shipped a real desk bell.

→ In the game: an **opening-bell 3-2-1 countdown**, a layered metallic **bell SFX**
(`sBell`) on both phone and TV, and a big **CORNER** button.

## The sound of the floor

Open outcry was a **wall of noise** — hundreds shouting numbers, ticker machines, the bell.
"As the final seconds approach, the Ring erupts… traders jump up and begin shouting."
The information was partly *in* the roar.

→ In the game audio: a synthesized **crowd-roar** swell on the open, **cash-register**
"cha-ching" on completed trades, ticker clicks on card taps, and the bell.

## When the pits closed

- **LIFFE** open outcry: closed **24 Nov 2000** (last 3 of 26 pits), killed by electronic
  competition (Eurex took ~90% of the Bund by end-1996).
- **CME/CBOT** (Chicago): most physical pits closed **May 2021**.
- **LME** ("the Ring"): the last major open-outcry holdout, into the 2020s.

## Sources

- [Farewell open outcry — The TRADE](https://www.thetradenews.com/farewell-open-outcry/)
- [LIFFE — Corporate Finance Institute](https://corporatefinanceinstitute.com/resources/derivatives/london-international-financial-futures-exchange-liffe/)
- [Trading jacket — Grokipedia](https://grokipedia.com/page/Trading_jacket)
- [The Legacy of Open Outcry Trading — Cboe](https://www.cboe.com/thefloor)
- [How Noise Matters to Finance — UMinnPress](https://manifold.umn.edu/read/how-noise-matters-to-finance/section/2613f2ee-0364-4fdb-b9ae-c163c2e79204)
- [CME to permanently close most physical trading pits](https://investing.com/news/stock-market-news/cme-to-permanently-close-most-physical-trading-pits-2495376)
