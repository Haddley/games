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
   becomes a real decision and nobody can coast through a cheap round — but two consequences
   have to be designed for rather than discovered:

   - **fewer lots per game**, since a $10,000 item against a $15,000 purse ends the bidding
     for whoever wins it. Count the lots per game against the new spread rather than keeping
     whatever number is there now.
   - **going broke early.** A run of dear lots could leave somebody with nothing to do for
     the rest of the game, which is the one outcome a party game must not produce. Decide the
     mitigation up front — a floor on remaining cash, cheaper lots interleaved by the
     generator rather than by luck, or income between lots.

   Bid increments need to scale with the lot too: $1 steps on a $9,000 item would take all
   evening.
3. **Lot card shows the source and date while bidding** — "Amazon · Jul 2026" — so the price
   is arguable from real information and a stale figure has a visible explanation.
4. **TV reveal: much bigger.** The current result text is hard to read from a sofa. Size it
   like the rest of the TV layouts (`vmin`), and scale the drama to the size of the profit or
   loss — a $4,000 mistake should not look like a $12 one.
5. **Synchronised phone reveal.** The interesting part, and the easy one to get subtly wrong.
   It must be driven off the host's existing `revealStep` broadcast, **never** off phone-side
   timers, or devices drift and somebody sees the number a beat early — which spoils it for
   the room. The host already sequences the reveal; the phones should render whatever step
   the latest broadcast says, and nothing else.

## Files

- `data/goinggone-lots-original.json` — the 40 invented lots, safe
- `data/goinggone-lots-amazon.json` — to write
- `data/goinggone-lots-temu.json` — to write
- `goinggone.html` — `const LOTS`, `START_COINS`, `revealStep`, `finishValuation`
