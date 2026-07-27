# Elimination: battle royale vs knockout bracket

Two ways to run a game where players are knocked **out** rather than scoring points. They
look similar from a distance and are not remotely the same thing, and the difference is worth
holding onto because "can't we just share this?" comes up every time somebody looks at them.

| | Battle royale | Knockout bracket |
|---|---|---|
| who plays each round | **everyone still in** | **exactly two** |
| eliminations per round | 0, or several at once | always exactly 1 |
| structure | none — just "who's still alive" | rounds, seeds, byes, a draw |
| does order matter? | no, it's simultaneous | yes — who plays whom, and when |
| feels like | fast, loud, chaotic | tense, one screen, everyone watching |
| good for | 6–12 people, short attention spans | 4–8 people, a proper final |
| used by | **Rock Paper Scissors** (only) | **Rock Paper Scissors**, **Tic Tac Toe** |

**Forcing one into the other is the mistake to avoid.** A battle royale has no pairs and no
match order; giving it seats and a draw means inventing both. A knockout has no concept of
"everyone on the losing symbol" — every match has exactly one loser. What they genuinely
share is the *ending*: a finishing order built from elimination order in reverse, which is
`rankByElimination` in common.js.

## Battle royale — RPS only

Everyone throws at once. Then:

- **exactly two symbols on the table** → everyone on the losing symbol is out. That can be
  one player or seven.
- **one symbol, or all three** → **stalemate**. Nobody goes out and the round replays. Three
  players all throwing rock, or rock/paper/scissors all present, resolve to nothing.
- **last one standing wins.**

The stalemate rule is what makes it work with a big group: with eight players you will
usually see all three symbols, so early rounds mostly stalemate and the field thins fast once
it drops to two symbols. It is also why a battle royale can't be a bracket — a round with
seven survivors and one elimination has no pairing to describe.

Absence is handled by `playingNow()` (alive **and** present): a phone nobody is holding is
not waited for, not thrown for, and cannot be crowned. See
[connection-and-reconnect.md](connection-and-reconnect.md).

## Knockout bracket — `bracket.js`

A shared single-elimination draw. Pure logic — no DOM, no peers, no rendering:

```js
const b = makeBracket(seatIds);   // 5 players → 3 byes, 1 first-round match
nextMatch(b)                      // → {r, m, a, b}, or null when it's over
reportWinner(b, seatId)           // advance; returns the champion when there is one
roundName(b, r)                   // "Quarter-final" · "Semi-final" · "Final"
stillIn(b) / knockedOut(b)        // who's left; who went out, earliest first
```

**Byes are the whole reason this is shared rather than written twice.** Player counts are
rarely a power of two, so somebody has to sit round one out and it must be a defensible
somebody. Byes go to the **top seeds** — the earliest entrants — and only in round one, which
is what every real tournament does. Five players → the next power of two is eight → three
byes and one first-round match; the three who sat out then join the winner for a four-player
semi-final round.

Round names count back from the **final**, because that's what people recognise: a round of
eight is the quarter-final however many rounds came before it. Two players play "the Final",
not "round 1".

`knockedOut(b)` returns losers earliest-first, which is exactly the order `rankByElimination`
wants — so the podium comes free.

### What a "match" means is the game's business

`bracket.js` never decides that. Tic Tac Toe plays one board per match. **RPS plays first to
two throws** — a single RPS throw is pure luck, and losing a bracket place to one unlucky
throw would feel arbitrary in a way a battle royale does not. That asymmetry is deliberate:
in a royale a bad throw costs you one round out of many; in a knockout it would cost you the
tournament.

## Choosing a mode (RPS)

The captain picks in the lobby, before the start — `H.mode` is `'royale'` or `'knockout'`,
sent to every phone in `lobbyMsg` so non-captains can see what they're about to play. It is
lobby-only: switching mid-game would leave a half-run bracket or a half-eliminated field.

Tic Tac Toe has no such choice — head-to-head noughts and crosses *is* a two-player match, so
a bracket is the only sensible way to run more than two people.

## ⚠️ Open: Tic Tac Toe still has its own bracket

`bracket.js` was written **from** ticktacktoe's tournament logic, but ticktacktoe has **not
been migrated onto it**. As it stands there are two implementations of the same idea in the
repo, which is exactly the situation that produced every drift bug documented in
[connection-and-reconnect.md](connection-and-reconnect.md).

Migrating it is the obvious next step and is deliberately not a small job: its bracket is
entangled with seats, connection holds (`TTT_HOLD_MS`), mid-match reconnects and the
`resume`/`oppback` messages, so the refactor has to be done a step at a time with its eight
e2e tests run between each. Until that happens, **a change to knockout behaviour has to be
made in both places** — and there is no test that will tell you if you forget.
