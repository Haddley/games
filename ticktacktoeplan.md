# ticktacktoe.html — Knockout tournament plan

Tic tac toe is the one game here that is inherently **2-player**, so a TV room seated
exactly two phones and told the third "room full". This plan adds the obvious party
shape: a **knockout bracket** on the big screen, 3–8 players, one match at a time.

The existing modes are untouched: phone-vs-phone over a room code is still a single
game, and a TV room with two players is simply a one-match tournament.

## Rules

- **3–8 players.** The field is padded to the next power of two with **byes**, drawn
  at random — a bye is a free pass into round 2.
- **Random draw.** Players are shuffled when the captain starts, and the pairings are
  revealed on the TV.
- **One match at a time** on the big screen. Everyone else watches it there; their
  phone says who's playing and whether they're next.
- **Draws force a rematch with the starts swapped.** ❌ moves first and has the
  advantage, so a drawn board immediately replays with the other player as ❌, and
  keeps going until someone actually wins. Every match has a real winner; no
  coin-flips, no draw-scoring.
- **Winner advances**, loser is out and watches. Last one standing is the champion.
- The **captain** (first phone to join) starts the tournament and starts a new one
  from the champion screen — the same 👑 convention as the other games.

## Bracket maths

```
seats      = shuffled players                (3–8)
size       = next power of two ≥ seats.length   (4 or 8)
byes       = size − seats.length             (spread through round 1)
rounds[0]  = pairs of seat indices, `null` = bye
rounds[r]  = winners of rounds[r−1], paired
```

Round names come off the end: last round = **Final**, then **Semi-final**,
**Quarter-final**, else **Round n**.

## Protocol (TV host ⇄ phones)

The TV is authoritative, as everywhere else. New messages:

| → phone | when |
|---|---|
| `{type:'tlobby', players, captain, canStart}` | someone joins/leaves before the start |
| `{type:'match', role, opp, round, rematch}` | you're playing this match |
| `{type:'watch', a, b, round, next}` | someone else's match; `next` = winner plays you |
| `{type:'out', by}` | you were knocked out |
| `{type:'champion', name, you}` | tournament over |
| `{type:'resume', role, snap}` | you dropped mid-match and came back (existing) |

| → TV | when |
|---|---|
| `{type:'join', name, cid}` | joining (existing) |
| `{type:'start'}` | captain starts the tournament |
| `{type:'again'}` | captain starts a fresh tournament from the champion screen |
| `{type:'move', cell}` | a move, accepted only from the two players in the current match |

## Drops

Reuses the seat-hold from the reconnect work:

- **Mid-match**: the seat and the board are held for `TTT_HOLD_MS` (45s) and the
  opponent is told "reconnecting…". Coming back gets `{type:'resume'}` with the
  authoritative board. Only if the hold expires does that player forfeit the match
  (their opponent advances) rather than the whole tournament ending.
- **Between matches**: a missing player is waited on for 20s when their match is due,
  then walked over. The bracket never stalls on an absent phone.
- Matching is by **device id** (`clientId()`), name second — same as every other game.

## TV screen

The bracket lives alongside the board: rounds as columns, each match a pair of name
plates, the live one highlighted, winners filling in as they're decided. Champion
screen ends with confetti and "👑 <name> wins the tournament".

## What is deliberately NOT here

- No third-place playoff (nobody has ever wanted one at a family party).
- No simultaneous matches — one board on one TV is the whole point.
- No seeding by past results; the draw is random each time.
