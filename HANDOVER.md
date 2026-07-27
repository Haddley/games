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

1. **Going, Going, GONE! real items** — ✅ SHIPPED 27 Jul 2026. See below for what is left.
2. **ticktacktoe is not on `bracket.js`.** Two implementations of the same draw exist. They use
   *different bye policies* (ticktacktoe shuffles then pairs top-vs-bottom so byes spread;
   `bracket.js` gives byes to top seeds as a block), so migrating is a design decision first,
   not a refactor. Detail in `llmwiki/elimination-modes.md`.
3. **The Buzzin' mid-game duplicate row was never reproduced in a harness.** The rule change is
   proven by unit tests only. Three attempts passed against the bug — see the memory note.
4. **`share-room` is wired per game but only Plump Trek was eyeballed.** The test proves the
   block renders and the link works; nobody has looked at all 19 for layout.

## Going, Going, GONE! — real items, SHIPPED

Built on 27 July 2026. The game now runs on **137 real lots** with verified prices, sources and
capture dates, 93 of them with photographs. The 40 invented lots are retired to
`data/goinggone-lots-original.json`.

Balance came from the simulator running against the real data, not from judgement:

| | |
|---|---|
| `START_COINS` | **$7,000** (was 1,000; the earlier guess of $15,000 was more than twice too big) |
| Lots | **3 per player**, captain can pick 2/3/4 (Short/Normal/Long) |
| Over-band lots (≥$10k) | **off by default**, captain toggle, full value when on |
| Bid raises | **scale with the price**, +10/50/100 up to +500/2,500/5,000 |
| Mystery lots | ~20% of the draw: **photo shown, name withheld** |

Verified: **162 unit tests** (9 new), the **2 goinggone e2e** specs, and the **23-test smoke**
suite all pass.

### Two findings worth keeping

**More cash makes games closer but leaves more players empty-handed** — the opposite of the
intuition, and the reason the purse came *down*. Scarcity is what spreads the lots around; with
deep purses the boldest bidder takes everything.

**The old "monster decides it" metric was broken** (it read the winner's stock against the
monster's value, which hits ~100% as soon as several big lots exist). Corrected to "winner's best
single bargain vs their margin over second", it confirms the finding rather than softening it —
one over-band lot moves the margin from ~10% of the winner's score to ~48%. That reversed the
plan's original "one per game at full value" decision, though *not* by capping value: they keep
their full worth and are simply off by default.

### Next on this game

1. **The $5k–10k band is thin** — 13 lots against the 10 a full table draws. Top toward ~25.
   Every other band has 28–42. `unit/goinggone.test.js` guards the floor.
2. **Nobody has play-tested it with humans.** Does the raise ladder feel right at a $3,000 bid?
   Does the photo make prices *too* guessable? Is a 5-second gavel long enough at these numbers?
3. **Photos are hotlinked and will rot.** The `onerror` fallback to emoji is in place, but no one
   has eyeballed all 93 in a browser.
