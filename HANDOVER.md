# Where things stand — 27 July 2026

Written at the end of a long session so the next one starts from facts rather than
archaeology. Everything below is pushed; the working tree is clean.

## Finished and verified

| | |
|---|---|
| **Plump Trek sprites** | Kenney CC0 pieces, 30 to choose from, mood, walking between squares |
| **Licensing** | BSL 1.1 at the root, `sprites/` carved out as CC0 with reproducible provenance |
| **Connection / presence** | heartbeats, `claimSeat`, `rekeyPlayerId`, `presentPlayers`, `watchPresence` — all in `common.js`, all 19 games |
| **Build handshake** | a phone on older code is told, with a one-tap reload |
| **RPS knockout mode** | captain-selectable, on the shared `bracket.js` |
| **Liar's Dice** | aces wild is the captain's call (default off); the 1 is a skull and crossbones |
| **Share the room** | code + Copy link + Share on every player's phone, all 19 games |

Test suite as of the last full run: **208 e2e passed, 2 flaky** (both long-standing Plump Trek
ones), plus **153 unit tests**. Since then: `phone-host-room` (18), `share-room` (19),
`bracket` and RPS knockout all green.

## Open, in priority order

1. **Going, Going, GONE! real items** — the live work. See below.
2. **ticktacktoe is not on `bracket.js`.** Two implementations of the same draw exist. They use
   *different bye policies* (ticktacktoe shuffles then pairs top-vs-bottom so byes spread;
   `bracket.js` gives byes to top seeds as a block), so migrating is a design decision first,
   not a refactor. Detail in `llmwiki/elimination-modes.md`.
3. **The Buzzin' mid-game duplicate row was never reproduced in a harness.** The rule change is
   proven by unit tests only. Three attempts passed against the bug — see the memory note.
4. **`share-room` is wired per game but only Plump Trek was eyeballed.** The test proves the
   block renders and the link works; nobody has looked at all 19 for layout.

## Going, Going, GONE! — the live piece

**Nothing is applied to the game.** The current 40 invented lots still run.

- `goinggoneplan-realitems.md` — every decision, and what the simulator found
- `sim/goinggone.js` — the balance simulator. **Run it before touching `START_COINS` or the
  value spread**; guessing at those is how we got the 97%.
- `data/goinggone-lots-original.json` — the 40 invented lots, backed up
- `data/goinggone-lots-real.json` — **6 of ~30 researched**, each with source, `capturedOn`
  and a confidence rating

### Decisions taken

$1–$10,000 band (not a hard cap) · $15,000 purse · even spread · ~3 lots per player ·
`capturedOn` shown on the lot card while bidding · unaffordable lots pass in · over-band lots
keep **full value** and the bargain stands.

### What the simulator says

At 6 players / $15,000 / 18 lots / one $19,799 lot, **the monster lot decides the game 97% of
the time**. Cash is the lever, not the lot ($25,000 → 73%); saving it for last makes it worse.
More lots fixes "won nothing" (10.7% → 0%) but makes games *less* close (margin $3.3k → $24k).
**30 lots with 1 monster** looked best of everything tried.

Neil's instruction: **find the items first, sort the mixture out later.**

### Next research step

Two bands are empty — **$1–100** and **$5k–10k** — and the seed script prints them on every
run. Method that works, learned the hard way: name the *thing* and ask its price; category
searches ("surprisingly expensive everyday objects") return inflation journalism with nothing
purchasable in it. Budget one search per item. Corroborate across dealers where no single
retail listing exists. **Amazon is unusable** — product pages return HTTP 500 and site-limited
search gives category pages with no prices. Re-test before assuming.

Neil also asked for a search on *surprisingly inexpensive* items that look expensive — not
started.

### One thing to fix in the simulator

`monster won the game` is measured as "winner holds ≥ the monster's value in stock", which is
meaningless once there are several monster lots (it reads 100%). It should compare the winner's
single best bargain against their margin over second place.
