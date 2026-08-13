# kingscorner.html — rules & protocol reference

## Context

Kings Corner (Kings in the Corner) is a 2–4 player patience/rummy-hybrid card game, built on
the same host-authoritative P2P pattern as every other game in this repo (see `CLAUDE.md`).
It reuses `common.js` (connection/prefs/scene/control-strip core), `p2p.js` (PeerJS
hardening) and `ambient.js` (the lightweight audio profile — a quiet regal pad plus a
handful of tone() stingers, not the full `audio.js` step sequencer). Turn-based, host
authoritative, phone-vs-phone with an optional TV/spectator view, closest in shape to
`liarsdice.html` (turn order, phone+TV) and borrowing the captain-toggle `ctl` pattern
verbatim from `rockpaperscissors.html`.

Rules source of truth: bicyclecards.com/how-to-play/kings-corner — 2–4 players, standard
52-card deck, ranks K-Q-J-10-9-8-7-6-5-4-3-2-A (Ace low, no wraparound), deal 7 each, a
cross layout (N/E/S/W pre-dealt one card each, NW/NE/SW/SE King-only corners),
descending/alternating-color play, and the literal **draw-then-play-then-pass** turn order
(not the "draw as a last resort" variant some other sites describe). First to empty their
hand wins the round. Bicycle's page gives no stalemate or multi-round scoring rule, so this
game defines simple, clearly-flagged house rules for those two gaps only (see below).

## Game rules

- **Deck**: standard 52 cards, no jokers. Rank 1 = Ace (low; there is no wraparound — a 2
  cannot land on an Ace, and a King can only ever be the *base* of a pile, never a target).
- **Board**: 8 piles arranged in a cross — N, E, S, W each start with one face-up card dealt
  from the deck; NW, NE, SW, SE are **corners** and start empty.
- **Deal**: after the four cross cards, each player gets 7 cards, dealt round-robin starting
  from that round's starting player. The remainder is the face-down stock.
- **A card may be played** onto a pile if: the pile is empty AND (the pile is a **corner** →
  only a **King** may start it; the pile is a **side** pile → anything may start it); or the
  pile is non-empty and the card is exactly **one rank below** the pile's top card **and the
  opposite colour** (red ♥♦ / black ♠♣).
- **A whole run may be moved** from one pile onto another: pick any card within a pile, and
  that card plus everything stacked on top of it (already a valid descending/alternating-color
  run, by construction — see "why no separate run-checker" below) moves as one unit onto a
  pile it could legally receive its lead card on.
- **Turn order — draw, then play, then pass** (the literal Bicycle rule): on your turn you
  draw one card from the stock (unless the stock is already empty), then you may make **any
  number** of legal plays (hand→pile or pile→pile), then you end your turn. You cannot
  play before drawing (unless the stock is empty, in which case there is nothing to draw and
  you go straight to plays).
- **Winning a round**: the first player to empty their hand wins the round immediately —
  the check happens the instant a hand-card play empties it, without waiting for the rest of
  the turn.
- **Winning the match**: a captain-chosen target of 1, 3 or 5 rounds won. First to reach it
  takes the match.

### House rules (not in Bicycle's text, invented here and flagged as such)

- **Stalemate**: once the stock is empty, if every active player completes a full turn
  playing zero cards (a full round-robin of "draw is unavailable, no legal play, pass"),
  the round ends in a stalemate. Whoever holds the **fewest cards** wins the round (ties
  split the win — everyone tied for fewest gets a round win).
- **Rounds-to-win**: Bicycle describes a single hand; the captain picks best-of-1/3/5 in the
  lobby so an evening has a match, not just one hand.

### What is deliberately NOT here

- **No timed turns and no skip-a-stalled-player control.** This is a slow, thinking game —
  there is no clock anywhere in it, and (per the repo's presence rules) nothing waits for
  "everyone" in a way that could stall, so there was never a need for a captain override to
  skip a quiet phone. A player who has gone away simply keeps their seat and their turn
  until they come back; the game does not move on without them, and it was never asked to.
- **No scoring beyond rounds-won.** No points for cards left in hand, no bonus for going out
  fast — the podium is `rankByScore` on `roundsWon`, nothing more.
- **No jokers or wild cards.** Standard 52-card deck only.
- **No "play 3-at-once from the stock" or other house variants.** Draw is always exactly one
  card. Some real-world house rules deal differently or allow drawing multiple cards to
  unstick a hand; none of that is here — this is the literal Bicycle rule set plus the two
  gap-fillers above, nothing else invented.
- **No phrase banks, voice-picking heuristic, or drawn narrator figure.** Milestones, hints,
  and rejections are all spoken (see below), but through one plain `speak(text)` call — no
  `P_OPEN`/`P_SOLD`-style template banks, no `voiceScore()` voice ranking, no on-screen
  auctioneer with a mouth to animate. Going, Going, GONE!'s auctioneer earns that machinery
  by speaking constantly, all evening; Kings Corner's narrator speaks rarely enough that a
  single default-voice utterance is the right amount of engine, not a placeholder for more.

## Why no separate run-checker is needed

A pile is only ever built by legal single-card drops onto its current top (or by moving an
already-legal run onto it), so every adjacent pair of cards in `pile.cards` already satisfies
descending-alternating-color by construction. That means:

- Any **contiguous suffix** of a pile's `cards` array is automatically a legal run — moving a
  run is just "does the suffix's lead card fit the destination pile", no separate
  run-validity walk required.
- A run led by a King is necessarily the **entire pile** (nothing outranks a King, so a King
  can only ever sit at index 0 — the base), which is exactly the case the rules allow onto an
  empty corner.

## Networking

Host-authoritative PeerJS, room peer id `KGCRN-XXXX` (4-letter code, no I/O). Phone-hosted
or TV-hosted, exactly like every other game here: `hostPeer`/`joinPeer` from `p2p.js` (always
via `ICE_CFG`), `claimSeat`/`notePresence`/`startHeartbeat`/`presentPlayers` from `common.js`
for reconnects and the 👑 captain, `warnIfStale`/`showStaleBuild` for the build-version
handshake, `rememberRoom`/`savedRoom` so a refreshed phone walks straight back to its seat.

**No `hostRekeyPlayer` is needed at all.** `H.turnIdx`, `H.winner`, `H.matchWinner` and
`H.roundStartIdx` are all **indices into `H.players[]`**, not stored ids — the same trick
Liar's Dice uses for `activePlayers`/`bidderIdx`. Hands live directly on `player.hand`.
`H.players` is never spliced or reordered once `H.phase !== 'lobby'` (no eliminations in
this game), so an index stays valid across every reconnect — only `player.id` changes on a
rejoin, and `zombie.id = conn.peer` is the whole fix. Zero id-keyed fields means the repo's
rekey-coverage audit (`unit/presence.test.js`) needs nothing special from this game.

**No `watchPresence`/`hostPresenceRecheck` either.** This is turn-based, one actor at a
time — the game never does an `X.every(...)`-style "waiting for everyone" that could stall
on a departed phone, so there is nothing for a presence-driven re-check to unstick.

## Message protocol

| Sender | Message | Notes |
|---|---|---|
| Guest→Host | `{type:'join', cid, build, name}` | `claimSeat(H.players, msg, conn.peer, guestConns, H.phase==='lobby')`, `warnIfStale` first |
| Guest→Host | `{type:'join_viewer'}` | TV/spectator |
| Guest→Host | `{type:'hb'}` | heartbeat |
| Guest→Host | `{type:'ctl', action, value}` | captain-only: `assist` (bool), `roundsToWin` (1\|3\|5), `start`, `again`, `next_round` |
| Guest→Host | `{type:'draw'}` | draw this turn's card |
| Guest→Host | `{type:'play_hand', cardId, pileId}` | play a hand card onto a pile |
| Guest→Host | `{type:'move_pile', fromPileId, cardId, toPileId}` | move a run (lead = `cardId`) between piles |
| Guest→Host | `{type:'end_turn'}` | pass to the next non-spectating player |
| Host→Guest | `{type:'lobby', players, roomCode, tvHost, captain, assistOn, roundsToWin}` | |
| Host→Guest | `{type:'state', ...}` | one shape for playing / round_over / match_over, see below |
| Host→Guest | `{type:'version', host}` | stale-build handshake |
| Host→Viewer | `{type:'viewer_lobby', ...}` | |
| Host→Viewer | `{type:'viewer_state', ...}` | mirrors `state` minus `myHand`/`isMyTurn`/`hasDrawnThisTurn` |

The `state` message sent to each player:

```js
{
  type: 'state', phase, roomCode, round, roundsToWin, assistOn,
  myHand, isMyTurn, hasDrawnThisTurn, stockCount,
  piles,                                  // the FULL board — public info, no hidden layout
  players: [{ name, handCount, roundsWon, isTurn, spectating }],
  turnPlayerName, isCaptain,
  milestones,                             // last ~8 {seq, text} commentary entries
  winnerName, stalemateWinnerNames, matchWinnerName,
}
```

`H.piles` is sent to everyone in full — there is no hidden information on the board itself
(unlike a player's hand), so there is nothing to withhold there.

## Game flow

1. **Lobby** — QR + room code; captain toggles the turn-assistant default and picks best-of
   1/3/5; Start disabled below `MIN_PLAYERS` (2).
2. **Deal** — cross cards dealt, 7 cards round-robin per active player from the round's
   starting player, remainder becomes the stock. Turn goes to the starting player.
3. **Playing** — draw (if the stock has cards and you haven't already this turn) → any number
   of legal plays → end turn. Hitting an empty hand wins the round immediately.
4. **Round over** — winner banner (or a stalemate tie list), rounds-won tally; captain-only
   "Next round" rotates the starting player, promotes any mid-round joiners out of spectating,
   and re-deals.
5. **Match over** — first to `roundsToWin` rounds; podium via `rankByScore` on `roundsWon`;
   captain-only "Play again" returns everyone to the lobby with the same connections.

**Mid-round joiners** are appended to `H.players` as `spectating: true` — never inserted,
nobody removed — so every existing index stays valid. They're promoted to real players (and
dealt in) at the start of the *next* round.

## Rendering notes

Full `setHTML`-based re-render on every `lobby`/`state`/`viewer_state` message, exactly like
`liarsdice.html`/`rockpaperscissors.html` — there is no host-driven timer tick here to
protect with DOM-patch-by-id, so a full re-render is simplest and correct. Local UI-only
selection state (`selHandCard`, a card id; `selFromPile`, a pile id — see below) is kept in
top-level `let`s that survive the re-render and are re-applied as CSS classes (`.playable`,
`.sel` on hand cards, `.selected`/`.glow` on piles) each time.

The board is a 3×3 CSS grid: `NW N NE / W · E / SW S SE`, with the centre cell showing the
stock count and the Draw button when it's legal. Each pile shows only its **base and its
exposed top card**, offset in a small two-card fan — not every card it holds. This is
lossless, not a simplification that loses information: a pile is built entirely from legal
drops, so its ranks strictly decrease with no repeats between those two ends, meaning the
run in between is fully determined by them (rank counts down one at a time, colour
alternates). A `×N` badge appears once there's actually something hidden (3+ cards) to say
so. Rendering only two cards also sidesteps the earlier fan-overflow problem (a long run
growing into the pile below it) without needing to cap anything.

**Pile-to-pile selection is by PILE, not by card.** The first version made every card in a
pile individually clickable, since a move can pick up any card within a pile as the lead of
the run above it — but that meant landing a tap on a specific card buried under a 2px fan,
which in practice meant only the top card was ever reliably tappable. `resolvePileMove(from,
to)` removes the need to pick a card at all: a pile's ranks strictly decrease with no
repeats (built entirely from legal single-card drops), so for any non-empty destination
there is **at most one** card in the source pile with the right rank+colour — no guessing,
just a lookup. The only real ambiguity is an EMPTY non-corner destination, where any card
could start it; there the whole pile is moved by default, since "pile → pile" reads as "move
this stack over there." `kcPileClick(pileId)` now takes a single argument: tap a pile to
select it as the source (only the whole `.kc-pile` div is a click target — cards inside carry
no handler of their own), tap a destination pile to send the move, tap the selected pile
again to deselect. `computeGlowPiles` glows every pile `resolvePileMove` can legally reach
from the current selection, the same function the move itself resolves against.

## The turn assistant (client-side only, no extra network round-trips)

All computed locally off the same `state`/`viewer_state` payload every client already
renders from, using the exact same pure functions (`canDropOnPile`, `legalHandMoves`,
`legalPileMoves`, `explainReject`, `suggestMove`) the host uses to validate moves.

**A found-in-testing correction worth recording**: `canDropOnPile` alone answers "does this
card fit this pile," not "is it legal for me to move right now" — the host also enforces
Bicycle's draw-then-play order (`hostPlayFromHand`/`hostMovePile` require
`hasDrawnThisTurn || stock empty`) and, being fire-and-forget, silently drops a play that
arrives before the draw rather than broadcasting a reason. The first shipped version of the
assistant didn't know about that gate, so it happily glowed a card and a destination pile as
legal *before* the draw — a real player selected one, tapped the glowing pile, and nothing
happened, with no explanation, because the host had already thrown the message away. Every
assistant entry point now runs through `canActNow()` (`isMyTurn && (hasDrawnThisTurn ||
stockCount === 0)`) before it will glow, select, or hint anything, and a tap that arrives too
early gets "Draw a card first" instead of silence. With that gate in place the assistant
genuinely can never promise something the host will then refuse.

- **Highlight legal moves** — gated on `assistOn`, `isMyTurn`, AND `canActNow()`: every
  playable hand card gets a `.playable` glow, and once a card (or a pile-run) is selected,
  its legal destination piles glow too. Nothing glows before the draw.
- **Explain a rejected move** — tapping an illegal destination toasts a plain-English reason
  ("7♠ is the same colour as 8♣ — you need the opposite colour.", "Only a King can start a
  corner pile."). **Not gated on `assistOn`** — silently ignoring a tap is bad UX regardless
  of the assistant setting.
- **Hint** — visible only when `assistOn && isMyTurn`; calls `suggestMove` locally, selects
  the suggested card/pile (which reuses the same highlight styling, with a pulsing outline)
  and toasts what to try, or says plainly that there's nothing to do but draw or end the turn.
- **Milestone toasts** — the host appends a short line to `H.milestones` when a corner opens,
  a hand drops to one card, a round is won, or the match is won; clients toast anything newer
  than the highest `seq` they'd already seen (so a rejoin never replays a backlog). This is
  deliberately lightweight — it is not a second instance of Going, Going, GONE!'s spoken
  auctioneer, just short toast text.
- **Hints, rejections, AND milestones are all spoken aloud**, behind one per-device 🗣️
  toggle in the sound strip. `speak(text)` wraps `SpeechSynthesisUtterance` directly — no
  phrase banks, no voice-picking heuristic, no `bubble()`/mime fallback; that machinery
  exists in Going, Going, GONE! because its auctioneer speaks constantly, all evening, and
  earns the investment. Kings Corner's narrator speaks rarely (a handful of milestones a
  round, plus on-request hints), so the plain default voice and a single `speak()` call is
  the right amount of engine for how often it's actually used.
  - **The toggle's default is role-based, not a flat `true`**: `voiceOn()` resolves
    `voicePref === null ? !!(isViewer || isTvHost) : voicePref !== '0'` — off on a phone,
    on for the TV/viewer, exactly Going, Going, GONE!'s pattern, and for the same reason.
    Hints/rejections alone would have been fine defaulting on everywhere (they only ever
    fire on the one device that triggered them), but milestones broadcast to **every**
    connected device at once — a flat default-on would mean every phone at the table AND
    the TV all narrating "Alex won the round!" a beat apart. `voiceOn()` is a function
    (not a cached value) so it re-resolves correctly even though role isn't known yet at
    boot; `syncVoiceBtn()` re-syncs the 🗣️ button's `.off` class on every `render()`
    rather than once at boot, since the resolved default can change (home → hosting a TV).
  - **Milestone speech needs the iOS gesture-priming hint/rejection speech doesn't.**
    Hint/rejection lines run synchronously inside the tap that triggered them — every
    utterance IS the gesture, so nothing needs priming. Milestones arrive later, off a
    network broadcast, same as an auctioneer's lines — so `primeSpeech()` spends one
    silent utterance (`volume:0`) on the first tap anywhere (piggybacked on the same
    `pointerdown` listener that already primes `ac()` for music), exactly Going, Going,
    GONE!'s `primeSpeech()`, so the first real milestone isn't silently refused.
  - **Multiple milestones in one batch are spoken as ONE utterance**, not one `speak()`
    call per line — `speak()` cancels whatever's still being read before starting the
    next, so N calls in the same tick collapse to just the last line. This is the same
    lesson Going, Going, GONE! already learned for its own multi-line commentary.
  - Card names and pile ids get spoken-friendly forms (`cardSpoken`: "six of hearts";
    `pileSpoken`: "northwest corner") distinct from the toast's short glyph form, so the
    toast and the voice can each read naturally in their own medium — `addMilestone(text,
    speech)` carries both, generated together at the point a card is actually in scope.

## Verification

1. `npm run test:unit` — no top-level name collision with `common.js`/`p2p.js`/`ambient.js`
   (`common-names.test.js`), and the presence/rekey/claimSeat/heartbeat audits pass with no
   special-casing needed for this game (`presence.test.js`).
2. `npx playwright test tests/smoke.e2e.spec.js` — loads clean, the `royals` ambient scene
   builds, the stale-build guard holds, the QR is square.
3. `npx playwright test tests/kingscorner.e2e.spec.js` — lobby → deal → draw → play → open a
   corner with a King → win a round → podium, for both a TV-hosted and a phone-hosted room,
   plus assist highlight/hint/explain-rejection assertions and a forced stalemate.
4. `npx playwright test tests/shared.e2e.spec.js` — control strip, shared prefs, focus
   survival across re-renders, the self-playing `?mode=tvsimulation` demo, and the launcher
   card all still pass with this game added.
5. Manual two/three-phone play-through: draw-then-play-then-pass order holds, corners really
   are King-only, alternating-colour/descending is enforced both from the hand and pile-to-pile,
   turning the assistant off hides the highlight/hint but rejection toasts still fire, best-of
   -3/5 carries `roundsWon` across re-deals, and the podium totals what actually happened.
