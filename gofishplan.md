# gofish.html — plan

## Context

Go Fish, built "based on kingscorner and blackjack" per Neil's request, with the rules
pointed at bicyclecards.com/how-to-play/go-fish. Fetched that page directly rather than
relying on memory — its exact wording matters for a few edge cases (see "Rules source"
below). Confirmed with Neil up front: **the host can also play a hand**, Kings-Corner
style — unlike Blackjack, Go Fish has no ongoing "house" role once the deal is done
(whoever dealt has nothing special left to do), so forcing the host to sit out the way
Blackjack's dealer does would be an artificial restriction with no basis in the real game.

So structurally this is much closer to a **Kings Corner clone with a different card-game
engine**: private hands (unlike Blackjack's public-hands table), a host that can double as a
player, no timer, no betting. What Blackjack actually contributes is the corner-indexed card
CSS lineage (now on its third game) and the general "keep the model pure functions, keep
host logic thin" discipline — not its host/dealer split.

## Rules source (bicyclecards.com/how-to-play/go-fish, fetched directly)

- **Players & deck**: 2 or more, standard 52-card deck, no jokers.
- **Deal**: "If two or three people are playing, each player receives seven cards. If four
  or five people are playing, each receives five." Extended one seat further (the practical
  cap chosen below, 6): 5 cards.
- **Turn**: ask ONE opponent for a specific rank you currently hold at least one of ("Give me
  your kings"). If they have any, they hand over **all** of that rank, and the asker "is
  entitled to ask the same or another player" again. If not, they say "Go Fish" and the asker
  draws the top stock card.
- **Book**: the instant a player holds all four of a rank, they lay it face up immediately.
- **Empty hand mid-game**: "if a player is left without cards, they may (when it's their
  turn) draw from the stock and then ask for cards of that rank" — a forced single-card
  draw, then their only legal ask is that card's own rank.
- **Stock exhausted with an empty hand**: that player "is out of the game" (skipped from
  then on — not a game-ending condition by itself).
- **Game end**: "when all thirteen books have been won." **Winner**: most books.
- **Ambiguous in the fetched text, resolved here as a documented ruling** (flagged the way
  Kings Corner flags its own gap-fills): whether drawing the *matching* rank from the stock
  during a "Go Fish" also earns another turn. Every mainstream reference agrees it does —
  otherwise there's no reason to ever specify what happens when the drawn card matches.
  Implemented as: **draw matches the asked rank → reveal it, ask again; draw doesn't match →
  turn passes.** Also ruled here: forming a book is a **side effect checked after every hand
  change**, not an independent bonus turn — "and plays again" in Bicycle's text describes the
  common case (you formed the book *because* you just won an ask or matched a fish), not a
  book granting an extra turn on its own.
- **Termination is guaranteed by card conservation**: 52 cards, 13 possible books. A table
  where every player holds 0 cards and the stock is empty necessarily means all 52 cards are
  already in books (13 of them) — so "everyone stuck with nothing" and "game not yet over"
  can never both be true. No artificial stall-breaker needed, unlike Kings Corner's
  stalemate rule (which exists because Kings Corner's board really can lock solid).

## Reused from Kings Corner / Blackjack, near-verbatim

- **Card model**: `makeCard`, `makeDeck`, `suitColor`, `shuffled`, `rankShort`, `cardLabel`,
  `cardSpoken`, `SUIT_SYM`/`SUIT_WORDS`/`RANK_WORDS`, `esc` — the same inline copy both
  existing card games already keep.
- **Card CSS**: the corner-indexed card face lineage, renamed `.gf-card` this time.
- **Connection scaffold**: `hostPeer`/`joinPeer`/`p2pCurtain`/`p2pWatchRelay`, `clientId`/
  `rememberRoom`/`savedRoom`/`claimSeat`/`notePresence`/`startHeartbeat`/`presentPlayers`/
  `warnIfStale`/`showStaleBuild`, `capPlayer()`/`capSync()`, mid-round-joiner-as-spectator,
  and — restored from Kings Corner this time, not Blackjack — the **host-can-also-play**
  split (`isHost && !isTvHost` acts on local state directly instead of round-tripping
  through its own PeerJS connection).
- **`ambient.js`** (not `audio.js`) — same lightweight profile as both existing card games.
- **No timer anywhere.** Turn-based like Kings Corner.
- **`?mode=tvsimulation|playersimulation&players=N`** self-playing demo scaffold, bots
  choosing a random rank from their own hand and a random opponent.

## What's new (not in either existing game)

- **Hidden hands, public counts.** Unlike Blackjack's all-face-up table, your own hand is
  private and every other player is shown only as a name + card-back count — `buildDisplay`
  never puts another player's actual cards into the payload at all, only `handCount`, the
  same "withheld on the host" principle both existing card games use for their own hidden
  information.
- **One host function resolves a whole ask, including the auto-draw.** `hostAsk(fromId,
  targetId, rank)` validates it's the asker's turn and that `rank` is actually in their hand,
  then does the FULL resolution in one call: transfer-all-of-rank on a hit, or draw-and-check
  on a miss — there is no separate player-facing "draw" message, because in Go Fish drawing
  on a miss isn't a choice. `layBooks(player)` runs after every hand change; `checkMatchOver`
  runs immediately after any book lays down, before deciding whether the current asker's turn
  continues.
- **The forced empty-hand draw happens host-side, inside `advanceTurn`, before the turn is
  even handed to that player** — it lands on the next non-spectating player in `H.players[]`
  order, drawing their one card first if their hand is empty and the stock isn't, and skips
  entirely anyone left with an empty hand AND an empty stock ("out of the game").
- **No "who probably has it" hint, on purpose.** The turn assistant only ever highlights
  which ranks you're allowed to ask for (the ones in your own hand) and who's still an active
  opponent — it never suggests a target. Memory and deduction about who probably holds what
  is the entire game; a "smart hint" here would be the equivalent of Going, Going, GONE!
  leaking the auctioneer's reserve.
- **New ambient scene theme**: `pond` in `common.js`'s `SCENE_THEMES` — walk cast
  `🎣 🐟 🐠 🎏 🪣`, aquatic blue palette, distinct from Kings Corner's felt-green `royals` and
  Blackjack's red/black `casino`.
- **Win condition**: all 13 books claimed → `match_over` immediately (can end mid-sequence,
  the instant the 13th book lays down). Podium via the shared `rankByScore` on `books.length`.

## Bugfix: the mid-turn softlock (`refillIfEmpty`)

Neil hit a real stuck room in testing: a player's turn began, they emptied their own hand by
laying down their last book mid-ask (a "go again" hit or a matched-fish draw that happened to
complete their final book), and the turn never moved on — the UI has nothing to offer an
empty-handed player (no rank is tappable), and `hostAsk`'s two "go again" branches called
`broadcast()` directly with no empty-hand check, because that check only ever lived in
`advanceTurn`'s handoff-to-a-new-player path. A player could hold the turn with zero cards and
no legal move: total softlock.

Fixed by extracting the shared helper `refillIfEmpty(p)` (auto-draws one stock card into an
empty hand, returns whether the player has a card to act with) and calling it from **three**
places that can each leave a hand empty: `advanceTurn`'s existing handoff logic, and both of
`hostAsk`'s go-again branches (a hit that completes the asker's last book; a fished card that
completes it). Each go-again branch now does `refillIfEmpty(asker) ? broadcast() :
advanceTurn(H.turnIdx)` — auto-draw and keep going if the stock can supply one, otherwise fall
through to the normal handoff (which itself skips the player entirely if the stock is also dry,
the pre-existing "out of the game" rule). Covered by `unit/gofish.test.js`: a hit that empties
the hand with stock available (auto-draws, same turn continues), the same with an empty stock
(turn passes cleanly instead of softlocking), and the matched-fish equivalent.

## New player help (`helpMode`)

A captain-configurable table setting — 🎓 **New player help** — toggled in the lobby (own
screen always live; a guest's copy is shown but `disabled` unless they're captain), carried in
both `lobbyMsg()` and `buildDisplay()` as `helpMode`, and set via `hostCtl(fromId, 'helpMode',
value)` / `guestCtl('helpMode', value)`. It's a **table preference, not a per-match rule** — it
deliberately survives "Play again" (unlike e.g. a round count), because the table's mix of
experienced/new players doesn't change just because a match ended.

Two things key off it:
- **Milestone commentary** (spoken and shown) gets a fuller, more explanatory version when on —
  e.g. a hit still says who fished what, but a miss spells out "says 'Go Fish!' — so-and-so
  draws a card from the stock" rather than just "Go Fish!", and a completed book explains what
  just happened ("all four in one hand!") instead of a bare exclamation.
- **In-game hints** in `renderPlaying()` (`turnHint`, `askForHint`) directly address the
  question Neil actually asked when testing — why only ranks already in hand are askable —
  spelling out "You can only ask for a rank you already have — that's the rule" rather than the
  terse default hint.

Off by default would have been the "no behaviour change" choice, but the whole point is to help
someone who doesn't yet know the rule, so it defaults **on**; an experienced table's captain
switches it off once.

## What is deliberately NOT here

- **No multi-round match.** Go Fish is naturally one complete deal-to-13-books game — there's
  no real equivalent of Kings Corner's best-of-1/3/5.
- **No variant rules** (house rules for asking a rank you don't hold, wild jokers, team
  play). Standard Bicycle rules plus the one documented ruling above, nothing else invented.
- **No assist for WHO to ask**, as covered above — the one place this repo deliberately
  withholds a hint it could easily give, because giving it breaks the game.

## Networking

Host-authoritative PeerJS, room peer id `GOFISH-XXXX`. `MIN_PLAYERS = 2`, `MAX_PLAYERS = 6`.
`HAND_SIZE(n) = n <= 3 ? 7 : 5`.

**No `hostRekeyPlayer` needed**: `H.turnIdx` is an index into `H.players[]`, hands live on
`player.hand` directly, books live on `player.books` (an array of ranks). Nothing here is
id-keyed, so a rejoin is just `zombie.id = conn.peer`.

## Message protocol

| Sender | Message | Notes |
|---|---|---|
| Guest→Host | `{type:'join', cid, build, name}` | `claimSeat` + `warnIfStale` |
| Guest→Host | `{type:'join_viewer'}` | TV/spectator |
| Guest→Host | `{type:'hb'}` | heartbeat |
| Guest→Host | `{type:'ctl', action}` | captain-only: `start` (lobby→playing, deals hands), `again` (match_over→lobby) |
| Guest→Host | `{type:'ask', targetId, rank}` | own turn only; `rank` must be in the asker's own hand |
| Host→Guest | `{type:'lobby', players, roomCode, tvHost, captain}` | |
| Host→Guest | `{type:'state', ...}` | one shape for playing/match_over |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', ...}` | mirrors guest state minus `myHand` |

`state` sent to each player (`buildDisplay`):
```js
{
  type: 'state', phase, roomCode, isCaptain,
  myHand,                                    // full Card objects — yours only
  isMyTurn, turnPlayerName,
  players: [{ id, name, handCount, books, spectating, isTurn }],  // OTHER hands: count only
  stockCount, milestones, matchWinnerName,
}
```

## Game flow

1. **Lobby** — QR + room code, captain-only Start, disabled below `MIN_PLAYERS`.
2. **Deal** — `HAND_SIZE(activePlayers.length)` cards round-robin from a fresh shuffle;
   remainder becomes the stock. `layBooks()` runs once up front (rare, but a book can be
   dealt straight off the top).
3. **Playing** — current player picks an opponent and a rank from their own hand, sends one
   `ask`. `hostAsk` resolves it fully: hit → transfer + lay books + ask again; miss →
   auto-draw + lay books + (matched → ask again; didn't → `advanceTurn`).
4. **Match over** — the instant `H.booksClaimed === 13`: podium via `rankByScore` on
   `books.length`; captain-only "Play again" reshuffles and re-deals to the same room.

## Rendering notes

- Your own hand: face-up `.gf-card`s, sorted by rank so any near-complete book is visually
  obvious at a glance.
- Ask UI: tap a rank chip (only ranks in your own hand are selectable) then tap an opponent
  chip (name + card count, never their cards) to send the ask immediately.
- Opponents: name + card-back count only (capped visual stack, same taste call as Kings
  Corner's stock pile).
- Laid-down books: a compact per-player strip of rank badges, public to everyone including
  the TV.
- Milestones: a successful ask, a "Go Fish!" miss, a completed book, the match winner.
  **"Go Fish!" is what the RESPONDER says when they have none** — the milestone text gets
  this the right way round.
- Full `setHTML`-based re-render on every message — no host-driven timer tick to protect.

## Verification

1. `npm run test:unit` — `gofish.test.js` (16 tests: book detection incl. multi-book,
   ask-resolution hit/miss/match-on-fish, the empty-hand/empty-stock edge case, match-over on
   the 13th book, plus the `refillIfEmpty` softlock regression tests covering both `hostAsk`
   go-again paths) passes; `common-names.test.js` and `presence.test.js` pass with no
   special-casing needed.
2. `npx playwright test tests/smoke.e2e.spec.js` — loads clean, `pond` scene builds.
3. `npx playwright test tests/gofish.e2e.spec.js` — TV-hosted: a forced hit, a forced miss, a
   forced 13th book ending the match, plus an explicit wire-payload check that another
   player's `hand` array is never present. Phone-hosted: the host is a real seated player,
   and an empty-handed player's turn opens already holding their one auto-drawn card with
   only that rank selectable in the UI.
4. `npx playwright test tests/shared.e2e.spec.js` — control strip, shared prefs, focus
   survival, the self-playing demo, and the launcher card all pass with Go Fish added.
