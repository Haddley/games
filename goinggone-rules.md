# Going, Going, GONE! — the auctioneer's rules

**What this document is.** Everything the auctioneer does, why he does it, and — the part that
actually decides whether the game is fun — exactly how long a player has to decide at every point.
The numbers here are the numbers in `goinggone.html`; `unit/goinggone.test.js` reads them out of the
source and fails if the game and this document drift apart.

Related: `goinggoneplan-realitems.md` (the lots and the economy), `CLAUDE.md` (the repo's
conventions), `sim/goinggone.js` (the balance simulator).

---

## 1. What we copied from real auctions, and what we didn't

Research into how chattel and estate auctioneers actually work turned up three things that changed
the design. All three are about **pace**, which is the thing that was wrong.

**Fast is exciting; slow is fatal.** Mike Brandly — a working auctioneer who writes about the
trade — puts it plainly: *faster-paced auctions generate better financial results… slower auctions
cause bidders to leave from fatigue… with quicker pacing, more emotion is involved, and quick
buying decisions are more likely "yes" than "no".* A general chattel sale runs **80–100 lots an
hour**: 36 to 45 seconds a lot, start to finish, including moving the goods. Our lots were running
longer than that with nothing happening in them.

He also separates two speeds that are easy to confuse. **Engine speed** is how fast he talks.
**Ground speed** is how fast lots actually sell. A chant can be a blur while the sale crawls. We
had the opposite failing — a calm, well-spaced voice attached to a lot that took half a minute to
get nowhere.

**Silence is fatal.** A real auctioneer's chant never stops while he is waiting: *"Will you go six?
Will you give six? Will you buy 'em at six?"* The bid-calling **is** the waiting. Our windows used to
be genuinely silent — one line, then four or five seconds of a shrinking progress bar. On a TV that
does not read as suspense, it reads as a frozen screen.

**A dead lot is dropped, not endured.** When a lot has no interest he says something like *"I'll
have to pass that one"* and moves on immediately. In our old schedule the pass-in was the **longest
outcome in the game** — 38.5 seconds of nobody wanting something. Exactly backwards.

**Plain words, not rostrum contractions.** The trade says *"will ya give me"*, and written down it
reads as a typo rather than as an auctioneer — a synthesised voice makes it worse, because it says
every syllable evenly. Every one of those became **"who'll give me"** or **"do I hear"**, which are
just as authentic and survive being read off a screen.

**What we deliberately did not copy.** Real chant is filler syllables at 250+ words a minute
("dollarbiddollarbid-now-two"), which is unintelligible to anyone who has not spent time in a
saleroom, and speech synthesis cannot deliver it anyway. And genuine rostrum jargon fails at a
kitchen table: *"split it with me"* is what an auctioneer says when asking for half an increment,
and it was in the game until a player asked, reasonably, what on earth it meant. Our rule is
**real structure, plain words**.

---

## 2. The shape of a lot

Every lot runs the same five stages. Only the middle one can loop.

```
  INTRO ──▶ SEEKING AN OPENING BID ──▶ BIDDING ──▶ THE CLOSE ──▶ SOLD
              │  (he comes down)         │  (he softens)   │
              └──── nobody bit ──────────┴─────────────────┴──▶ PASSED IN
```

| Stage | What he is doing | Player's options |
|---|---|---|
| **Intro** | Announces the lot; the item unveils | none — watch |
| **Seeking** | Asks a price, comes down when nobody answers | take the ask, or wait |
| **Bidding** | Has a bid, wants the next one; softens his ask if it doesn't come | **take his ask**, or wait |
| **Close** | "Going once… going twice…" | raise — **bids still count** |
| **Sold / Passed in** | Hammer, or the tumbleweed | none |

---

## 3. THE CLOCK — how long a player gets

This is the table the game is judged on. Every value is in `goinggone.html`'s **clock block**, and
one function — `windowFor(bid)` — decides which of them applies. No other code sets the deadline;
a unit test enforces that.

| Beat | Window | Why that long |
|---|---:|---|
| Lot intro | **4.0 s** | Long enough to read the item and think "what's that worth?" |
| Opening ask #1 | **5.0 s** | The only genuinely cold decision in the game: no anchor, no price on screen yet |
| Opening ask #2 | **4.0 s** | He is getting impatient, and the number is now cheaper than one you already turned down |
| Opening ask #3 | **3.2 s** | |
| Opening ask #4 | **2.8 s** | |
| Opening ask #5 | **2.5 s** | The floor. Last chance before it walks out of the room |
| **After any bid** | **4.5 s** | Committing money always buys back a full window |
| Reduced ask #1 | **3.5 s** | He has come off the full jump; the sum is smaller, so the decision is easier |
| Reduced ask #2 | **3.0 s** | |
| Reduced ask #3 | **2.5 s** | |
| Going once | **1.6 s** | |
| Going twice | **1.6 s** | |
| Sold | **4.0 s** | The payoff — paddle number, price, gavel |
| Passed in | **2.6 s** | Get rid of it |

**The four guarantees** (each is a unit test):

1. **Nothing is under 2.5 seconds** (`MIN_DECIDE_MS`). That is the floor for noticing a changed
   number on a phone in your hand and acting on it. Urgent is good; unfair is not.
2. **A bid always buys back a full window.** Whatever pressure he had built, a bid resets the
   CLOCK completely — full 4.5 s, close called off. Longer than every other beat in the game bar
   one: the very first cold ask, at 5 s, which is the only decision anybody makes with no price on
   the board at all. The player who just spent money is never given less time than the one who sat
   still. What a bid does **not** reset is the NUMBER — see §5.
3. **He only ever accelerates.** Each unanswered call is shorter than the one before it, in both
   the seeking and the bidding phases. The room can feel him losing patience.
4. **The dullest outcome is the fastest.** A lot nobody wants takes **24.1 s** end to end. A lot
   that sells after a single bid takes up to **28.2 s**. Wanting something is never punished with a
   longer wait than not wanting it.

**Total lot time.** 24–30 seconds typical, which puts us at roughly 120–150 lots an hour — a touch
faster than a real saleroom, which is right, because our audience is on a sofa and the "porter"
never has to carry anything.

### Nothing is ever silent

Two mechanisms, because a quiet window is the bug this schedule exists to fix.

- **Mid-window re-ask.** Partway through every unanswered ask (at the halfway mark) he fires the
  chant again — *"Who'll give me sixty? Sixty? Anywhere?"* — from `P_CHANT`, short and quick
  (rate 1.5) so it reads as pressure rather than a new announcement.
- **Fair warning — and only where he means it.** On his **last rung**, at 50 % of the window the
  screen shows *going…*, at 25 % *going… GOING…*, and the 25 % mark speaks a fair-warning line
  (`P_GOING`). On any earlier rung it says **coming down…** instead, because that is what is about
  to happen.

  This is a rule, not a detail. Saying *"going… GOING…"* and then offering a **smaller** increment
  is a threat he never intended to keep, and a room that hears it three times a lot learns that the
  word means nothing — which is precisely what it did. Coming down has its own line (`P_SPLIT`),
  spoken **at the start of the cheaper ask** rather than on top of the fair warning at the end of
  the dearer one.

Through the **close** both are suppressed. "GOING ONCE" is the line everybody knows and it does not
share its beat with anything; a second utterance would simply cancel it, since `speechSynthesis`
cancels rather than queues.

### How fast he talks

One dial, `SAY_RATE` (0.85), multiplied into every utterance; the per-line rates under it are only
relative character (the chant is quicker than the hammer). The first build ran the bid calls at
1.4–1.5×, which on a synthetic voice is not "auctioneer" but unintelligible — and every number here
is one somebody has to act on. `speechMs()` divides by the same dial, so the beats that wait for him
to stop talking (the banked board) follow it automatically.

---

## 4. Seeking an opening bid — and the lie

Bidding does not start at zero. The auctioneer **calls a price**, and he is not honest about it.

- The opening ask is a random **0.85× to 1.9×** the lot's true value — so it is a clue with a lie
  built into it. Sometimes it is a gift and nobody notices.
- Each time nobody answers, he drops to **55–75 %** of the previous ask.
- He will do this at most **five times** (`ASK_STEPS`), and never below the **reserve**, which is
  **25 % of true value** (`RESERVE_FRAC`).
- Every price he calls is a number a person would say — `roundAsk` gives $48,000, never $47,318.
- The whole ladder is drawn **up front and kept on the host**. Phones are told the current ask and
  nothing else. How far he is willing to come down is the auctioneer's secret, and that secret is
  the entire reason waiting is frightening.

**Passed in.** Run out of rungs and the lot is passed in: nobody gets it, and — importantly — its
true value is announced anyway, so the room learns what it just let walk out of the door.

**The only legal opening move is to take his ask.** No under-bidding, no jumping in high. If your
phone taps a moment after the ask drops, the bid is honoured at the ask it is *actually* standing
at, rather than being thrown away.

**The nerve game.** Waiting for the next drop is the best decision in the game, and it has two
ways of going wrong: somebody else takes it at the price you turned down, or the lot leaves the
room entirely.

---

## 5. Bidding — and softening the ask

Once there is a bid there is **one option: take his ask.** A rostrum has no menu — he calls a price
and your paddle either goes up or it does not. (It used to offer the reduced ask alongside two
bigger jumps. That made the phone a calculator, and the bigger jumps were exactly the ones nobody
was taking, which is why he had come down in the first place.) You cannot outbid yourself, and you
cannot bid past your bankroll.

If a window empties with no raise, he does what a real auctioneer does: he **asks for less**, and
waits again. Three steps, each with its own window (see the table).

**His ask never climbs back up.** He came down to $25 because the room would not give him $100; a
bid at $25 is not evidence they have changed their minds, so re-running the whole descent after
every single bid is a descent they have already sat through. Within a lot he only ever descends;
each new lot starts him back at a full jump.

That is a measured decision, not a taste one — `sim/goinggone-bidding.js` plays thousands of lots
under each rule:

| Rule | taps/lot | seconds/lot | price/value |
|---|---:|---:|---:|
| reset to the top on every bid (old) | 3.4 | 47.9 | 122 % |
| **leave it where the room left it (shipped)** | **3.9** | **40.8** | **118 %** |
| step back up one rung on a bid | 3.5 | 43.7 | 119 % |
| seed a new lot from the last few lots' appetite | 6.7 | 43.1 | 116 % |

Seven seconds a lot, for half a tap, at the same price. The last row is the idea that looks
sensible and is not: a lot that opens on a soft rung climbs in dribs, and nearly doubles the taps.

**He calls the price, never the increment.** With $140 bid and a $25 ask he says *"I'll take one
hundred and sixty-five — just twenty-five more"*, not *"I'll take twenty-five"*. The increment only
ever appears as "just X more", which is the one place it is the natural thing to say.

**And the price he calls is a round one.** `askLadderFor(price)` builds his asks as a descending
ladder of **round prices** — the next multiple of each successively smaller unit — rather than by
shrinking the step. With $2,963 bid he asks $3,500, then $3,100, then $3,050. Not $3,022. Building
it the other way round misbehaves badly: at $21,000 a half-step and a quarter-step both round to
$21,500, so he "comes down" three times to the same number.

He stops softening when there is no genuinely lower round price left to call — on some prices the
ladder is shorter than three steps, and coming down to the number he just said reads as a stuck
screen rather than as an auctioneer.

---

## 6. The close

Out of round numbers to offer, he closes it properly:

> **GOING ONCE…** (1.6 s) → **GOING TWICE…** (1.6 s) → **GONE**, gavel.

Both beats are separate host states, both are announced aloud, and **bids are legal through both**.
That is what makes the close a snipe window instead of a wait: 3.2 seconds where the price is fixed
and anybody who has been holding back can still take it. A raise in the close cancels it outright
and buys a fresh full window.

The hammer is the game's own `sGavel()` stinger, fired the instant the sold screen lands.

---

## 7. What he says

Every line is picked at random from a pool, so no lot plays the same twice. All of it is spoken
through the shared voice layer (any device with speech and the 🗣 toggle on) **and** printed on
screen, because the family TV is a Fire TV running Silk, which has no speech voices at all.

| Pool | When | Example |
|---|---|---|
| `P_LOT` | Lot announced | "Lot number seven." |
| `P_MYSTERY` | Mystery lot | "And I'm not telling you what it is." |
| `P_OPEN` | First ask | "Who'll start me at two hundred?" |
| `P_DROP_LEAD` + `P_DROP_BODY` | Each drop | "You're breaking my heart. Then who'll give me one-fifty?" |
| `P_CHANT` | Mid-window | "Who'll give me one-fifty? Anywhere?" |
| `P_BID` | A bid lands | "I'm bid one-fifty, now two hundred, who'll give me two hundred?" |
| `P_ACK` | 35 % of bids | "Bidder number forty-two." |
| `P_GOING` | Fair warning | "Fair warning — I'm selling at two hundred." |
| `P_SPLIT` | Reduced ask | "I'll take one-seventy-five. Just twenty-five more, anybody?" |
| `P_ONCE` / `P_TWICE` | The close | "Going ONCE…" |
| `P_SOLD` | Hammer | "SOLD! To bidder number forty-two, for two hundred!" |
| `P_PASSED` | No sale | "Passed in. It never made its reserve." |

**He sells to the paddle, never the name.** Every player gets a random unique paddle number at
join. It is what the auctioneer calls, exactly as a real one does — and it also spares synthesis
from mangling "Bux".

**Delivery speed varies by line**, which is most of what makes it sound like a person: the bid
chant is fast (rate 1.42), the mid-window chant faster (1.5), fair warning steady (1.15), the
close slow (1.08 falling to 1.0), and "SOLD" lands at 1.1 with the gavel under it.

---

## 8. What each player can see

Deliberately incomplete, because full information kills the bluff. The TV shows every player's
bankroll as a **band** (`purseBand`), not a figure — and the withholding happens on the **host**,
in `stateFor`, because phones render whatever arrives. Mystery lots show the photograph and
withhold the name, again host-side, including on the owner's own shelf.

---

## 9. Between rounds, and the end

Bankrolls carry forward across rounds, so later rounds have real money in the room and a private
aircraft can genuinely go under the hammer. At a round's end every lot is valued in turn (5.2 s a
card, staged: card → true value → profit stamp) and **only when the last card has played** do the
new bankrolls appear — the reveals are the drama, and showing the answer early throws it away.
Commentary follows, one line spoken and the rest on screen. The podium comes only at the very end.

---

## 10. Changing any of this

- The clock lives in **one block** in `goinggone.html`, and **one function**, `windowFor(bid)`,
  applies it. `openWindow(ms)` is the only thing allowed to set a deadline.
- `unit/goinggone.test.js` reads that block straight out of the HTML and enforces every guarantee
  in §3. Changing a number without changing this document will not fail a test; changing it in a
  way that breaks a guarantee will.
- `tests/goinggone-auction.e2e.spec.js` plays three players through three rounds against a real
  host and records the whole transcript — every ask, every window, every option offered, every line
  of commentary — then asserts the schedule the room actually experienced.
- The economy is separate and belongs to the simulator: run `node sim/goinggone.js` before touching
  `START_COINS`, `BANDS`, `RESERVE_FRAC` or the lot counts.

---

## 11. Suggestions from the research, not yet built

Everything above is in the game. These came out of the same reading and are not — recorded here so
the reasoning survives, roughly in the order I would do them.

**1. "It's on the market."** The single strongest idea. In a British saleroom, the moment the
bidding passes the reserve the auctioneer announces it — *"it's on the market, it will sell
today"* — and the room changes completely, because until that instant everyone knows the lot might
still walk. We already have a hidden reserve doing exactly that job silently. Say it out loud the
first time a bid crosses `reserveFor(value)`: one line, one sting, a gold flash on the price. It
turns a number nobody can see into the best beat in the lot, and it costs about fifteen lines of
code. It does leak that the price is now ≥ 25 % of the true value, which is a real clue — but
that is a *good* trade, because it rewards the player who pushed the bidding there.

**2. Save the money lot for last.** Real sales are ordered deliberately: something cheap and easy
first to get paddles moving, the best lot near the end when the room is warm and the bankrolls are
committed. `buildLotOrder` currently shuffles within its bands. Sorting the last lot of each round
to be the round's most valuable would give a round a shape — and it would make the "bank everything
into one swing" decision much sharper.

**3. A ringman.** On a real floor, spotters bark — *"YEP!"*, *"HEP!"* — the instant they catch a
bid, before the auctioneer says anything. A 150 ms bark on the bid stinger, in a different voice
from the auctioneer's, would make a bidding war feel like a room rather than a turn-based game.
Cheap: it is a stinger, not speech, so it works on the Fire TV too.

**4. Adaptive pacing between lots.** After a fast sale the room is hot and `INTRO_MS` could shave a
beat; after a pass-in it should not. Real auctioneers ride momentum exactly like this. Low risk,
but it needs care not to trip guarantee 1.

**5. The commentary still falls flat, and the reason is structural.** It reads standings — *"Ada
leads with $8,400"* — which is a scoreboard, not a story. What makes a round-end funny is the
specific: who overpaid, who got a steal, who bought nothing at all, who lost the same lot twice.
The material is all there in `H.reveals`, unused. It also has no memory: nothing ever refers to a
previous round, so a three-round game has no arc. This is a bigger job than the other four and is
worth doing on its own.

**6. A house bid.** Auctioneers do take bids "off the wall" to start a dead lot. It would rescue
the tumbleweed lots — but it is also a lie the game would be telling its players about whether
anybody wanted the thing, and the pass-in is currently one of the funniest moments in a round. I
would not build this.
