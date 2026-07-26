# plumptrek.html — Implementation Plan

**Plump Trek** 🐇 — a roll-and-move chaos board game for the TV. The big screen is the
board; phones are your die, your hand of cards and your decisions. Land on a space and
do what it says, hoard the cards that save you, and be first to complete the **Finale**.

Inspired by **Chungus Odyssey 2**, a Tabletop Simulator board game by *Zelly* (Aug 2023,
3–8 players, 30–90 min, 300 Gimmicks + 25 Finales + 25 Builds). The rules and the shape
of the board are the inspiration; the cast, the card text and the art here are our own —
see the naming convention in CLAUDE.md. **None of the source pack's assets are in this
repo**: the pack itself says not to redistribute them, and the original board is built
from other people's characters.

What the research turned up, and what we took from it:

- The **Finale** is the best idea in the game: the first player to reach that space draws
  a card that decides *how the game is won* — `Rock.` (2nd place joins you for rock paper
  scissors), `Vote.` (the room picks between the top two), `Last.` (last place names a
  number 1–10; guess it and *they* win), `Pity.` (choose someone else to win), `Fail.`
  (everyone wins except last). We kept that whole idea, and several of our Finales reuse
  mechanics from our own games.
- **Builds** bend one rule for the whole game (`SPEEDRUN` = d20, `HANDICAP` = the leader
  can't move, `FAMILY` = last place rolls twice). Kept, with the ten that work best
  digitally.
- Its sequel added **Whammies** — rare, high-impact Gimmicks shuffled into the deck. Cheap
  to do here, so ours are the `w: 0` cards, salted in at roughly one in twelve.
- The original's Gimmicks are a third movement effects, a third real-world dares, and a
  third things that need a PC (change your Steam name, download an app). We keep the first
  two — family-safe — and drop the third; a dare only works if the TV shows the room what
  you were asked, so it does.

## Shape

- **2–8 players** + a TV. Captain (first phone in) sets the board length and starts.
- **Board length** is a lobby setting, like Bingo's call speed:
  `short ≈ 10 min (32 spaces) · normal ≈ 20 min (48) · epic ≈ 35 min (72)`.
- Turn order is join order. On your turn: play a held card if you want, then **ROLL**.
- The TV animates the pawn along the path, resolves whatever it lands on, and shows the
  drawn card big. Everyone else's phone shows whose turn it is and their own hand.

## Board

Generated from a seed, not hand-drawn, so every game is a different track — but the
mix of space types is fixed:

| Space | Effect |
|---|---|
| `plain` | nothing |
| `gimmick` | draw 1 Gimmick card (roughly 40% of the board) |
| `gimmick2` | draw 2 |
| `boost` | move forward again (2–5) |
| `trap` | move back (2–6), sometimes losing a turn |
| `gate` | **STOP** — must roll ≥ 4 to pass the first time, or wait 3 turns |
| `fork` | **pick a path before rolling**: the long way, or a short cut that's all gates and Gimmick x2 |
| `finale` | first player to land here draws the **Finale** card (once per game) |
| `win` | the trophy |

Nodes are explicit: `{t, label, next:[i]}`. A `fork` node has two `next` entries and the
player is asked *before* they roll; movement then walks node to node, so the two routes
can be different lengths and rejoin wherever we like.

**Laying it out so people can follow it.** A wrapped grid reads as separate rows, and the
first version of this board genuinely confused everyone who looked at it. `placeSquare(k)`
now lays the track in *bands*: 9 squares across, then one square dropped **vertically**
below the last of them, then the next run back the other way. The corner square is what
makes the turn legible and puts air between the rows. Every square is numbered, and a
chevron sits in the gap after it, so the route is one continuous chain from START to WIN.
The square size scales with the number of rows, so an epic board still fits a TV.

## Cards

**Gimmick deck** (the heart of it). Each card is data, not code — a small op set the
host applies, so cards are cheap to add:

`move:n` · `moveTo:'start'|'last'|'first'` · `roll:{add,turns}` · `skip:n` · `extra:1` ·
`draw:n` · `sabotage` (choose someone to miss a turn) · `allMove:n` · `allTo:'last'` ·
`swap:'first'|'random'` · `hold:'immune'|'steal'|'forge'` · `dare:'…'`

Three flavours, mixed through the deck:
- **Movement/rules** — "Sprint! +3 to your next roll", "Rebirth! back to Start, but +2
  to every future roll", "Leech! your next roll applies to whoever's in front", "Chaos!
  draw 2 more".
- **Held cards** — kept in your hand until spent: **Immune!** (ignore one Gimmick),
  **Yoink!** (steal a card someone just drew), **Forge!** (draw a Gimmick whenever you
  like). This is the original's "keep cards until their effect is complete".
- **Dares** — silly, family-safe, phone-friendly: 10 pushups, touch your toes, play
  one-eyed for 2 turns, no talking for 2 turns, tell someone you love them, hold a smile.
  The phone shows the dare with a **Done** button; the TV shows it to the room so there's
  no cheating. Nothing that needs a PC, an app, or a slap.

**Finale deck** (12) — drawn when the first pawn reaches the Finale space; it decides how
the game is actually won, so the last stretch changes every time. Four resolve instantly
(`Win.`, `Pity.` choose the winner, `Lame.` everybody wins, `Fail.` everyone but last),
four are mini-games the room plays (`Rock.` rock-paper-scissors against 2nd, `Vote.` the
room decides, `Dice.` a roll-off where you get an extra die, `Last.` guess last place's
number), and four change the board's endgame (`Race.` back to 2nd and first one back
wins, `Roll.` first to roll a 6, `Duel.` coin flips best-of-five, `Toll.` you need a card
in hand to claim it).

**Build deck** (10) — one card at the start, table-wide, bending a rule for the whole
game (the original's "advanced" mode; a lobby toggle, on by default): `CHAOS` (2 cards
per Gimmick space), `SPEEDRUN` (a d20 instead of a d6), `ONE` (+1 to every roll),
`HANDICAP` (the leader rolls half), `FAMILY` (last place rolls twice, keeps the best),
`UNSTABLE` (first and last swap at the end of every round), `INFLATION` (double every
number on every card), `ENTROPY` (draw a Gimmick wherever you land), `DIRECT` (no Finale
— first to the end simply wins), `COLLECTOR` (holding 4 cards wins outright).

## Protocol

Same host-authoritative pattern as every other game (copied from `lastlaugh.html`, which
brings the deck/hand machinery, and `oddsheep.html`'s turn order). New messages:

Everyone is looking at the same board, so there is **one** `state` message rather than a
message per phase (the bingo/herdmind pattern): the public part carries the board, the
pawns, the phase, the drawn card and the Finale; the `me` part carries only your hand and
whether the game is waiting on you. Viewers get the same thing minus `me`.

| → host | |
|---|---|
| `roll` · `play` (a held card, by index) · `choose` (a player, a route, a number, an RPS throw, a vote) · `done` (dare) · `ctl` (captain: set/start/again) |

Nothing may stall the room: an unconfirmed dare (`DARE_MS` 45s), an unmade choice
(`CHOICE_MS` 30s) and a phone that's been put down (`IDLE_ROLL_MS` 70s) all time out and
the game plays on.

## The die

A CSS cube — six pipped faces, `FACE_ROT` maps a value to the rotation that brings its
face to the front — thrown with a duration that varies per roll (0.62–1.4s) and a spin
that scales with it, so a long throw genuinely tumbles more rather than running the same
tumble slowly. The landing is the easing curve over-rotating a few degrees and rocking
back onto the face; the rattle SFX is generated across the actual duration and ends on
one last wooden click.

Two things were tried and removed because they read as separate events stapled to the end
of the roll rather than the die settling: a scale pop (dice don't grow) and a low thud
with a music duck (that's a drum hit, and ducking the music twenty times a game makes
every roll feel like a big moment). Throws are capped under `DIE_WAIT`, the beat the host
holds before walking the pawn, so the die has always settled before the piece sets off.

## Reuse

Everything structural is inherited, not rewritten: `common.js` (ICE, scene, TV lobby,
control strip, reconnect helpers, `setHTML`), `p2p.js` (`hostPeer`/`joinPeer`, auto-rejoin,
relay badge), `fx.js` (burst, popText, confetti), `audio.js` + a `TRACKS` set tuned for a
board game. Captain = first *connected* player (`capPlayer`/`capSync`), zombie-slot
reconnect by `clientId()`, refresh recovery via `savedRoom()` — all standard.

## Not doing

- No trading, no money, no properties — it's a race, not Monopoly.
- No simultaneous turns; one pawn moves at a time so the TV always has a subject.
- No per-player boards: the shared board on the TV is the whole point.
