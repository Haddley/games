# Going, Going, GONE! — real purchasable lots

The brief and the decisions already made, written down so the next session starts with them
rather than re-litigating them. **Not yet started** — the current 40 invented lots are still
live and backed up in `data/goinggone-lots-original.json`.

## Why change it

The invented lots ("The Slightly-Golden Goose", £520) are funny but the price is arbitrary,
so guessing is guessing. The appeal of a real item is that you *could* buy it today, which
makes being wrong about it funny in a different and better way — and makes arguing about it
worthwhile.

## Decisions taken

| | |
|---|---|
| **Top end** | **$10,000** (confirmed) |
| **Bottom end** | $1 |
| **Starting cash** | $15,000 (up from `START_COINS = 1000`) |
| **`capturedOn`** | **recorded per item**, and **shown on the lot card while bidding** — Amazon prices move weekly, so a wrong-looking price needs an explanation rather than looking like a bug. Bidding is when the argument happens, so that is where the date has to be |
| **Value spread** | **even across the range** — roughly equal numbers in every price band, not a pile of cheap ones with a few monsters |
| **Lots per game** | **~3 per player** — 2 players → 6 lots, 6 → 18, 10 → 30. Everyone wins roughly three things whatever the table size |
| **Unaffordable lot** | **passed in, unsold** — like a real auction with a reserve |
| **Over-ceiling lots** | **allowed, at FULL value** — a lot genuinely worth $19,799 that sells for $8,000 is a $11,799 bargain and stands. See the note below: this is a deliberate acceptance of a game-deciding swing |
| **Two sources** | one Amazon (US) list, one Temu list, kept separate |

## What makes a good lot

The whole game is "you cannot tell the price from the category". Neil's examples are the
brief:

- **a bolt-together plastic boat** — looks like a toy, is a real boat, costs far more than it looks
- **a pop-up container home** — several tiny homes shipped in one container, expanding on site in minutes; the sort of thing that could plausibly be $2,000 or $30,000

So prefer:

- items whose **shape gives no clue** to their price
- things that are **surprisingly cheap** (Temu is full of these) as well as surprisingly dear
- objects a family will have opinions about, not commodities with a known price (no phones,
  no games consoles — everyone knows roughly what those cost)

Avoid: anything that dates instantly, anything whose price is common knowledge, and anything
that needs explaining before the joke lands.

## Data shape

```json
{
  "source": "amazon-us",
  "capturedOn": "2026-07-27",
  "lots": [
    { "emoji": "🛶", "name": "…", "desc": "…", "value": 249, "url": "…", "capturedOn": "2026-07-27" }
  ]
}
```

`capturedOn` sits on each lot as well as the file, because a list will be topped up over time
and the items in it will not all have been checked on the same day.

## The rest of the job (not started)

1. **Research** the two lists. Real listings, real prices — inventing plausible ones defeats
   the point entirely.
2. **Rebalance.** Values go from 0–700 to 1–10,000 and cash from 1,000 to 15,000. This is not
   a find-and-replace: bid increments, auction pacing and the scoring all assume the current
   spread.

   **An even spread is the harder of the two options and was chosen deliberately.** Every lot
   becomes a real decision and nobody can coast through a cheap round.

   **"Going broke" is not the problem I first assumed, and the correction matters.** The score
   is `coins + shelf` (see `finishValuation`), so money spent is not lost — it is converted
   into things that might win you the game. A player who has spent everything is fully
   invested, not out. What they lose is the ability to bid on later lots, which is a smaller
   problem than sitting on nothing, and is exactly what the lot count is for:

   **Lots scale with the player count, ~3 per player.** More players means fewer wins each,
   so the same purse stretches further — the scaling is self-balancing rather than a rule
   anyone has to think about. It also keeps "everyone goes home with about three things"
   true at any table size, which is what makes the final valuation feel like a fair contest
   rather than an accident of how many lots happened to fit.

   Bid increments need to scale with the lot too: $1 steps on a $9,000 item would take all
   evening.
3. **Over-ceiling lots keep their full value, and the bargain stands.** The $10,000 figure is
   the band the *ordinary* lots are spread across, not a hard cap on what can appear. An item
   genuinely worth $19,799 can be bought for whatever somebody dares bid, and the profit is
   real.

   **This was chosen with the arithmetic in front of us, so do not "fix" it later by
   accident.** A $19,799 lot won at $8,000 is +$11,799 — roughly 79% of a starting purse, and
   very likely to decide the game on its own. That is the point: the best story of the evening
   is somebody sinking half their money into one enormous gamble and being right. If
   playtesting shows it flattens everything else, the lever to reach for is **how many** such
   lots appear (one per game, ideally late), NOT capping their value — capping turns a real
   price into a fake one, which is the thing this whole rework exists to get away from.

   Note it also interacts with the pass-in rule: with a $15,000 purse somebody can always
   reach a big bid, so these lots will rarely if ever pass in.

4. **A lot nobody can afford is PASSED IN**, unsold, as at a real auction with a reserve.
   Needs a "no sale" state in the reveal and the scoring — the lot simply does not enter
   anyone's shelf. Worth watching in playtesting: passing in at the very end could be an
   anticlimax at the moment the game should peak, so if the last lots keep going unsold, the
   answer is the lot ORDER (dear items while people can still afford them), not a rule change.

5. **Lot card shows the source and date while bidding** — "Amazon · Jul 2026" — so the price
   is arguable from real information and a stale figure has a visible explanation.
6. **TV reveal: much bigger.** The current result text is hard to read from a sofa. Size it
   like the rest of the TV layouts (`vmin`), and scale the drama to the size of the profit or
   loss — a $4,000 mistake should not look like a $12 one.
7. **Synchronised phone reveal.** The interesting part, and the easy one to get subtly wrong.
   It must be driven off the host's existing `revealStep` broadcast, **never** off phone-side
   timers, or devices drift and somebody sees the number a beat early — which spoils it for
   the room. The host already sequences the reveal; the phones should render whatever step
   the latest broadcast says, and nothing else.

## Files

- `data/goinggone-lots-original.json` — the 40 invented lots, safe
- `data/goinggone-lots-amazon.json` — to write
- `data/goinggone-lots-temu.json` — to write
- `goinggone.html` — `const LOTS`, `START_COINS`, `revealStep`, `finishValuation`

## The simulator — `sim/goinggone.js`

Built because we were guessing at the numbers, and they are arithmetic questions.

```sh
node sim/goinggone.js                                  # the current settings
node sim/goinggone.js --players 8 --cash 20000         # ask a question
node sim/goinggone.js --compare --games 3000           # sweep cash × monster lots
node sim/goinggone.js --monster-last true              # does saving it for last help?
```

It plays thousands of auctions with bidders who misjudge every lot by a **factor** rather
than a fixed amount (2× out is common, 10× rare) and differ in nerve. Every knob is a flag,
so no one has to edit the file to ask something. It is deliberately **not** the game — it
models only what decides balance. A bad verdict is a real finding; a good one still needs
humans to play it.

### What it has already told us (July 2026)

**At the chosen settings — 6 players, $15,000, 18 lots, one lot worth $19,799 — whoever wins
the monster lot wins the game 97% of the time.** The other seventeen lots are close to
decorative.

The lever is **cash, not the lot**:

| purse | monster decides the game |
|---|---|
| $5,000 | 99.7% |
| $10,000 | 99.9% |
| $15,000 | 97.3% |
| $25,000 | 73.3% |

Even $25,000 leaves it deciding three games in four. **Saving the monster for last makes it
worse** (99.6%) — everyone arrives with a full purse, so it becomes a shootout.

And raising cash creates a different problem: **"won nothing" climbs from 0.2% at $5k to
17.8% at $25k**. A richer table lets the bold bidders take everything and quiet players go
home empty-handed.

*Caveat:* "monster won the game" is measured as the winner holding at least the monster's
value in stock, which could in principle be reached from other lots. At these settings that is
unlikely, but it is a proxy, not a proof. Tighten it before relying on it for a close call.

### What this does NOT settle

The decision was to keep monster lots at full value **on purpose** — the best story of the
evening is somebody sinking half their purse into one gamble and being right. The simulator
says that story will be the *only* story. That is a judgement call about what kind of evening
this is, not a bug: if a 97% swing is the intended drama, the numbers simply confirm it works.
If it is not, the untested lever is **how many** monster lots appear and whether other lots can
compete — not capping their value, which turns a real price into a fake one.

## Research: what works

Recorded in `data/goinggone-lots-real.json` under `researchLog`, and worth repeating here:

- **Item-specific searches work. Category searches do not.** "Surprisingly expensive everyday
  objects" returns inflation journalism with nothing purchasable in it. Every good lot so far
  came from naming the *thing* and asking what it costs.
- **Budget roughly one search per item**, and corroborate across dealers where no single
  retail listing exists (the shipping container is priced from three).
- **Amazon is unusable** with these tools — product pages return HTTP 500 and site-restricted
  search returns category pages with no prices. Re-test before assuming it still is.
- The seed script **prints the empty price bands** so the next session can aim at them. An
  even spread has to be hunted deliberately, not taken as it turns up.
