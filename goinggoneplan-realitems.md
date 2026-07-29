# Going, Going, GONE! — real purchasable lots

The brief and the decisions already made, written down so the next session starts with them
rather than re-litigating them.

> **STATUS: BUILT (27 July 2026).** The game now runs on **969 real lots** with verified prices,
> sources and capture dates. The 40 invented lots are retired and backed up in
> `data/goinggone-lots-original.json`.
>
> `START_COINS` is **$7,000**, lots scale at **3 per player per round**, and over-band lots are
> **off by default** behind a captain toggle. All three numbers come from the simulator running
> against the real data — see "What the simulator says" below, and re-run it before changing any
> of them.
>
> **UPDATE (29 July 2026) — THE AUCTIONEER'S RULES ARE NOW A DOCUMENT.** Everything he does, and
> in particular **exactly how long a player gets to decide at every point**, is written up in
> **`goinggone-rules.md`** — with the research it came from, four guarantees the unit tests
> enforce, and a three-player three-round e2e (`tests/goinggone-auction.e2e.spec.js`) that records
> the transcript of a real auction and judges the schedule the room actually experienced. Start
> there before changing any timing. The headline change: he now **accelerates** as the room stays
> quiet, **never sits in silence** (there is a mid-window re-ask), closes with **two announced
> beats** of going once / going twice, and a lot nobody wants is now the **fastest** thing in the
> game rather than, as it was at 38.5 s, the longest.
>
> **UPDATE (28 July 2026) — ROUNDS, THE ASK, AND PASSING IN.** Three changes that hang together;
> see "The auctioneer" below.
>
> 1. **Rounds** (captain picks 1/2/3, default **3**). At the end of each round every shelf is
>    sold back at its **true value** and the whole net worth becomes the next round's bankroll.
>    Coins carry forward, the shelf does not, and the **podium only shows at the very end** — in
>    between there is a *banked board*. Good judgement therefore compounds.
> 2. **The band window climbs** with the round (`TIERS`/`roundBands`). Round 1 is the ordinary
>    $1–$10,000 spread; the last round of a 3-round game deals from $1,000 up through **$50,000+**,
>    because a table that has tripled its money should be shown lots it can now afford. A lot
>    whose reserve exceeds `REACH` (45%) of the richest bankroll is never dealt at all.
> 3. **Bidding no longer opens at zero.** The auctioneer *asks* for an opening bid, comes down
>    when nobody bites, and **passes the lot in** when the ask would go under the reserve.
> 4. **Paddles.** Every bidder gets a unique random two-digit number and the auctioneer sells to
>    it — "sold to bidder number forty-two" — never to a name, which is both how a rostrum works
>    and kinder to a speech engine facing "Bux". The paddle is drawn on both lobbies, the TV rail
>    and the SOLD card, and goes **up** on your own phone when you hold the bid.
> 5. **Fourteen hand-researched top-tier lots** (28 July), because the band-depth test reported
>    the $50,000+ tier holding eight lots, all of them catering equipment. See the research log.

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
| **Starting cash** | **$7,000** — `START_COINS`, set by the simulator. NOT the $15,000 originally guessed; see the sweep below for why higher is worse |
| **`capturedOn`** | **recorded per item**, and **shown on the lot card while bidding** — real prices move weekly, so a wrong-looking price needs an explanation rather than looking like a bug. Bidding is when the argument happens, so that is where the date has to be. Shipped as "WebstaurantStore · Jul 2026" under every lot |
| **Value spread** | **even across four neighbouring tiers**, and the window **climbs each round** — round 1 is $1–100/$100–1k/$1k–5k/$5k–10k; the last round of three is $1k–5k/$5k–10k/$10k–50k/$50k+ |
| **Lots per game** | **~3 per player per round** — 2 players → 6 lots, 6 → 18, 10 → 30. Captain picks Short/Normal/Long (2/3/4 per player) and **1/2/3 rounds** |
| **Rounds** | **3 by default.** Shelves sell back at true value between rounds and net worth becomes the bankroll; podium only at the end |
| **Unaffordable lot** | **passed in, unsold** — the ask runs down to the reserve and the lot leaves the room, with its true value revealed |
| **Over-band lots** | **OFF by default**, behind a captain toggle ("Big lot"), at FULL value when on. **This reverses the original decision** — see below |
| **Mystery lots** | ~20% of the draw shows **the photograph and withholds the name**. Only lots with a photo qualify; the name is withheld by the *host*, never client-side |
| **Opening bid** | **the auctioneer's ask**, not zero — a randomised 0.85×–1.9× of true value, so it is a clue with a lie in it. Nobody bites → he comes down a rung (×0.55–0.75) and asks again, up to 5 rungs |
| **Reserve** | **25% of true value**, never shown. When the next rung would go under it the lot is **passed in** |
| **Paddle numbers** | unique, random, two digits (10–99), kept across a reconnect. The sale is called to the number, never the name |
| **Purses** | hidden while a lot is live — the room sees a band (flush/comfortable/short/skint), never the figure. Revealed at the valuation, the banked board and the podium |
| **Splitting the increment** | as the hammer nears, his ask drops: full rung → ½ → ¼ → ~2% of the price (min $1), and he **waits `SOFT_STEP_MS` at each step** rather than running the whole descent inside one gavel. Any bid resets him to the full rung |
| **Bid raises** | **scale with the price** — +10/50/100 under $100, up to +25,000/100,000/250,000 in the top tier. A fixed ladder needed seventy taps to reach a serious bid |
| **Rounding** | values are rounded to **whole dollars** at embed time; the game's coin arithmetic is integer |

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

## The job — what shipped, and what is still open

All of the following is **done** unless marked otherwise.

1. ✅ **Research.** 137 real lots with source URLs, capture dates and confidence ratings, across
   `data/goinggone-lots-real.json` (hand-researched, one search per item) and
   `data/goinggone-lots-catalogue.json` (bulk-harvested from retailer category pages).
2. ✅ **Rebalance.** Cash `1,000 → 7,000`, values `0–700 → 1–98,027`, raises scale with the price,
   lots scale with the table. The numbers came from the simulator, not from guessing.

   **"Going broke" was never the problem I first assumed, and the correction matters.** The score
   is `coins + shelf` (see `finishValuation`), so money spent is not lost — it is converted into
   things that might win you the game. A player who has spent everything is fully invested, not
   out. The simulator bears this out: the *rich* settings are the exclusionary ones.
3. ✅ **Over-band lots keep full value, and are off by default.** See the simulator section — this
   is the one decision the arithmetic reversed. Capping their value is still the wrong lever and
   we did not do it; the lever used was *how many*, which is what the original note recommended.
4. ✅ **A lot nobody can afford is PASSED IN**, unsold, as at a real auction with a reserve. Worth
   watching in play: at $7,000 the simulator sees this on only ~0.4% of lots, so it stays a rare
   event rather than an anticlimax. If the last lots start going unsold, the answer is the lot
   ORDER (dear items while people can still afford them), not a rule change.
5. ✅ **Lot card shows the source and date while bidding** — "WebstaurantStore · Jul 2026".
6. ✅ **TV reveal is much bigger**, sized in `vmin`, four cards instead of six, with the drama
   scaled to the money: `mag-big` past $500 and `mag-huge` past $2,000 grow the figure, light the
   card and enlarge the particle burst.
7. ✅ **Synchronised phone reveal** — unchanged and still correct: driven off the host's
   `revealStep` broadcast, never off phone-side timers, so no device sees the number a beat early.

### Still open

- **The $5k–10k band is thin.** 13 lots against the 10 a full 10-player table draws — it passes
  `unit/goinggone.test.js` with only three to spare. Top it toward ~25 before heavy use. Every
  other band has 28–42.
- **Photos are hotlinked** from retailer CDNs. Every `<img>` falls back to the lot's emoji via
  `onerror`, so a blocked or rotted image degrades to the old card rather than breaking — but
  they will rot, and nobody has eyeballed all 93 in a browser yet.
- **Not play-tested with humans.** Three things the simulator cannot judge: whether the raise
  ladder feels right at a $3,000 bid, whether the photo makes prices *too* guessable, and whether
  a 5-second gavel is long enough when the numbers are this big.

## Files

- `data/goinggone-lots-real.json` — hand-researched lots, rich confidence notes
- `data/goinggone-lots-catalogue.json` — bulk catalogue harvest, plus the list of which retailers
  allow fetching and which block it
- `data/goinggone-lots-original.json` — the 40 invented lots, retired but safe
- `scripts/build-goinggone-lots.js` — regenerates the embedded `const LOTS` from the JSON. **Run
  it after editing the data**; `unit/goinggone.test.js` fails if the embed goes stale
- `goinggone.html` — `LOTS` (generated), `START_COINS`, `RAISE_LADDER`, `BANDS`, `buildLotOrder`,
  `lotView`, `revealStep`, `finishValuation`
- `unit/goinggone.test.js` · `tests/goinggone.e2e.spec.js` · `sim/goinggone.js`

## The simulator — `sim/goinggone.js`

Built because we were guessing at the numbers, and they are arithmetic questions.

```sh
node sim/goinggone.js                                  # the shipped settings
node sim/goinggone.js --players 8 --cash 12000         # ask a question
node sim/goinggone.js --cash-sweep                     # what does the purse do?
node sim/goinggone.js --big-sweep                      # what does the big lot do?
node sim/goinggone.js --table-sweep                    # does it hold from 2 players to 10?
node sim/goinggone.js --synthetic --max 700            # the old invented-lot world
```

**It reads the real lots by default** and deals them across the same four bands as
`buildLotOrder`, so its verdict describes the game people actually play. The bands are duplicated
in both files — change them in one and you must change the other, or these numbers quietly become
fiction.

It plays thousands of auctions with bidders who misjudge every lot by a **factor** rather than a
fixed amount (2× out is common, 10× rare) and differ in nerve. Every knob is a flag, so no one has
to edit the file to ask something. It is deliberately **not** the game — it models only what
decides balance. A bad verdict is a real finding; a good one still needs humans to play it.

**Run it before touching `START_COINS`, the band edges or the big-lot default.** Guessing at those
is exactly how the first attempt landed on a purse more than twice too large.

### What the simulator says (July 2026, against the REAL lots)

It now loads `data/goinggone-lots-*.json` and draws them exactly as `buildLotOrder` does, so its
verdict describes the shipped game. `node sim/goinggone.js --cash-sweep`, 6 players, 18 lots:

| purse | margin/winner | won nothing | lots won | purse spent | locked out |
|---|---|---|---|---|---|
| $5,000 | 16.5% | 0.0% | 3 | 83.7% | 13.8% |
| $6,000 | 13.2% | 0.9% | 3 | 78.7% | 9.1% |
| **$7,000** | **9.9%** | **2.8%** | **3** | **73.0%** | **6.4%** |
| $8,000 | 7.8% | 5.5% | 3 | 68.2% | 4.5% |
| $10,000 | 7.9% | 9.9% | 3 | 58.9% | 1.9% |

**1. More cash makes games closer but leaves more players empty-handed.** This is the opposite of
the intuition and it is the reason the purse is $7,000 rather than the $15,000 first guessed:
scarcity is what spreads the lots around. With deep purses the boldest bidder simply takes
everything and the quiet players go home with nothing. $7,000 is the knee — close games with
almost nobody shut out.

**2. One over-band lot decides the game by itself.** `--big-sweep`, same settings:

| big lot | margin/winner | won nothing | purse spent |
|---|---|---|---|
| no | 9.9% | 2.9% | 73.0% |
| yes | 47.7% | 0.2% | 82.1% |

The winner's lead over second goes from a tenth of their score to nearly half. **This reversed
the original decision.** The plan argued these were "the best story of the evening" and warned
against capping their value — and it was right that capping is the wrong lever. So we did not
cap it: over-band lots keep their **full** value and the whole bargain stands. They are simply
**off by default**, behind a captain toggle, because a six-fold swing cannot be the default
experience. The lever reached for was *how many*, exactly as the plan said it should be.

**3. Three lots per player holds at every table size.** `--table-sweep` gives a median of exactly
3 lots won per player from 2 players up to 10, so "everyone goes home with about three things"
needs no special case.

### What the auctioneer says, and when (28 July 2026)

The patter is spoken through Web Speech where a device has it, and **written in a speech bubble
everywhere** — the bubble fills before the `canSpeak()` check precisely so that a screen with no
voice still gets the performance. Timing is the part that bites:

- **One** commentary line is spoken at the end of a round; all four are on the screen. Spoken
  numbers are dear ("forty-five thousand nine hundred" is three seconds), so two lines would hold
  the banked board past eighteen seconds — and a television with no voice would sit on a silent
  board for all of it. `startBanking` measures its hold with `speechMs()` rather than a fixed
  wait, because a fixed one cut him off mid-sentence when the next round began.
- The **podium is not on a clock**, so it gets two lines.
- `say()` cancels whatever is talking rather than queueing: a chant lagging the screen is worse
  than silence. That is also why anything that must be heard in full needs its screen held open.

## The auctioneer: the ask, the fishing, and passing in (28 July 2026)

Real bid-calling was researched before this was built, and the mechanic turns out to be the
authentic one rather than an invention:

- Auctioneers **fish for an opening bid** — they call a number, and if nobody bites they call a
  lower one, until somebody opens. Bidding then ascends from there.
- A lot that never clears its hidden minimum is **"passed in"** — the trade's own term.
- The chant is **two numbers** (what is bid, what he wants next) stitched with *filler words*:
  "dollar bid", "now", "will ya give me", "I'm bid", "bid'em at". Closing runs "going once, going
  twice", "fair warning", "all done, all through", then the hammer.

So: `askLadder(value)` draws a random descending ladder — opening ask **0.85×–1.9×** of true
value (he is not an honest man, and sometimes the opening ask is a *gift*), each rung **×0.55–0.75**,
at most **5 rungs**, floored at the **25% reserve**. Nobody opens → `checkGavel` walks him down a
rung every `ASK_MS`. Rungs exhausted → **passed in**, and the true value is revealed, because
otherwise the room never learns what it let walk out of the door.

The ladder and the reserve **never leave the host**: phones are sent the current ask and the
number of drops so far, never how far he is willing to go. Not knowing is the whole game — hold
out for another drop and somebody else may take it, or it leaves the room entirely.

### What the simulator says about ROUNDS (28 July 2026)

`node sim/goinggone.js --by-round`, 6 players, 18 lots a round, 3 rounds:

| round | bands | bankroll after | paid/value | passed in |
|---|---|---|---|---|
| 1 | $1–100 · $100–1k · $1k–5k · $5k–10k | $9,144 | 78.8% | 0.3% |
| 2 | $100–1k · $1k–5k · $5k–10k · $10k–50k | $15,302 | 68.8% | 6.6% |
| 3 | $1k–5k · $5k–10k · $10k–50k · $50k+ | $25,181 | 64.6% | 8.0% |

Three findings that set the shipped numbers:

**1. The compounding is real and it is the point.** Table wealth ends at ~360% of the starting
purse, so round 3 genuinely can afford the $50,000 tier. Without the climbing window the late
rounds would be rich players buying traffic cones.

**2. The reserve fraction is the pass-in dial, and 0.25 is the knee.** At 0.35 the last round
passed in **22%** of its lots — a quarter of the running order wheeled off, which is not drama,
it is dead air. At 0.25 the arc is 0.3% → 6.6% → 8.0%: rare early, a handful later, and it climbs
as the lots get grander, which is exactly the right shape.

**3. Affordability must be judged lot by lot, not tier by tier.** The top tier runs from $50,000
to a private aircraft; "somebody could clear the cheapest thing in this tier" is a different
question from "somebody could clear THIS". `REACH = 0.45` — a lot's reserve may not demand more
than 45% of the richest bankroll — and the pass-in rate halved.

The winner's lead widens with rounds (7.7% → 16% → 21% of their own score), which is what
compounding does. Three rounds is the default anyway: it is the shape of the game Neil asked for,
and 21% is still a lead you can lose on the last lot.

#### The old metric was broken, and the corrected one confirms the finding

"Monster won the game" used to be measured as *the winner holds at least the monster's value in
stock* — which reads ~100% as soon as several big lots exist and told us nothing. It now measures
**the winner's single best bargain against their margin over second place**: take that one lot
away and do they still win? Read it next to `margin/winner`, never alone — in a close game a tiny
margin is trivially easy to exceed, so the figure is naturally high (~98%) even in well-balanced
settings. `margin/winner` is the honest headline.

## The auctioneer's voice on a device that has none — TRIED AND ABANDONED (28 July 2026)

Amazon Silk on a Fire TV plays the music and the stingers perfectly and never speaks. A **clip
bank** was built to get round that: a vocabulary of number words plus the fixed fragments between
the number-shaped holes in the patter templates, concatenated at runtime, which reproduces any
line including prices that do not exist until somebody bids them. The pipeline worked — 160 clips,
1.2 MB, every test line tokenising with no gaps. **It was abandoned on the sound.**

Do not rebuild it without new information. What was actually tried:

| Engine | Verdict |
|---|---|
| **espeak-ng** | Formant synthesis, so no recorded samples and no licence question at all — and completely unusable. 1985 robot. |
| **Piper `en_GB-alan`** | Easily the best of them, and **cannot ship**: its LICENSE reads "Copyright 2022 Mycroft AI / All Rights Reserved", no grant, no clarification anywhere, and Mycroft AI folded in 2023 so there is nobody to ask. |
| **Piper `norman` / `john` / `bryce` / `joe`** | Public domain or CC0, so shippable, but not good enough to change the verdict. |
| **Piper `aru`** | CC BY 4.0 — a credit line only. Same verdict. |
| **Piper `northern_english_male`** | CC BY-SA 4.0. Workable (`voice/` could be carved out of the BSL like `sprites/` is) but share-alike for no gain. |

The deeper problem is not the engine. **Concatenated single words do not sound like a person
speaking a sentence**, and the better the voice, the more the joins stand out. A whole-line render
is fine and a stitched line is not, and the numbers cannot be rendered whole in advance.

**So Silk gets no auctioneer, and that is fine.** Every line he speaks is also on the screen —
the ask, the patter under the price, the going label, SOLD, PASSED IN, the round commentary — so
the game loses flavour there and nothing else. `voiceHint()` says which of the three reasons
applies rather than leaving it a mystery. If this is ever revisited, the only thing that would
change the answer is a licence-clean voice good enough that a WHOLE line can be pre-rendered —
which the live prices rule out — or Silk gaining a TTS engine.

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
