# blackjack.html — rules & protocol reference

## Context

Blackjack, built "using kingscorner as a model" per Neil's request. Kings Corner
(`kingscorner.html`) is the newest, cleanest example of the repo's host-authoritative P2P
card-game pattern — but it's peer-vs-peer (everyone plays everyone), and Blackjack is
fundamentally player(s)-vs-house. The two games share a card model and a lot of UI/CSS, but
the host role, turn logic, and win condition are all different. Confirmed with Neil up front
(all recommended options taken): the **host/TV is the dealer and never holds a hand**,
betting uses a **virtual chip stack wagered per hand**, and rules go to
**hit/stand/double-down** (no split/insurance/surrender).

## Reused from Kings Corner, near-verbatim

- **Card model**: `makeCard`, `makeDeck`, `suitColor`, `shuffled`, `rankShort`, `cardLabel`,
  `cardSpoken`, `SUIT_SYM`/`SUIT_WORDS`/`RANK_WORDS`, `esc`. Blackjack reshuffles a single
  fresh 52-card deck every hand (no persistent shoe/discard, so no card-counting concern —
  same simplicity trade-off Kings Corner makes per-round).
- **Card CSS**: the corner-indexed card face (`.bj-card`, renamed from Kings Corner's
  `.kc-card`) so a sliver of an overlapping card is still legible.
  **Chip CSS is reused directly**: Kings Corner's `.chips`/`.chip`/`.chip.you` classes
  (originally just lobby "who's in" pills) are visually exactly a poker chip row — reused
  as the bet-amount picker (10/25/50/100/Max) via a new `.bj-chipbtn` variant.
- **Connection scaffold**: `hostPeer`/`joinPeer`/`p2pCurtain`/`p2pWatchRelay` (`p2p.js`),
  `clientId`/`rememberRoom`/`savedRoom`/`claimSeat`/`notePresence`/`startHeartbeat`/
  `presentPlayers`/`warnIfStale`/`showStaleBuild` (`common.js`), the `capPlayer()`/
  `capSync()` captain pattern, the mid-round-joiner-as-spectator pattern, the
  `?mode=tvsimulation|playersimulation&players=N` self-playing demo scaffold (stub
  `guestConns` entries with a no-op `send()`, bots driven by a `setTimeout` loop calling the
  same host functions real input would).
- **`ambient.js`** (not `audio.js`) — same lightweight profile as Kings Corner: a quiet pad
  plus a handful of `tone()` stingers. No step-sequenced music.
- **No timer anywhere, same as Kings Corner.** Blackjack is turn-based like Kings Corner, not
  a live countdown like Going, Going, GONE!'s auctioneer — a player's hit/stand decision and
  a bet amount are both no-clock waits.

## What's new (not in Kings Corner)

- **Dealer-only host.** `H.dealer` is a hand belonging to nobody's `id` — the hosting device
  (whether opened via "Deal on this phone" or "Deal on the big screen") always renders the
  dealer's table, never a player's own cards. This is closer to Going, Going, GONE!'s
  auctioneer (host never holds a paddle) than to Kings Corner's `isTvHost`-doubles-as-a-seat
  split. **The host is never also a guest here**, so — unlike Kings Corner — there is no
  local-shortcut branch for player actions; every bet/hit/stand/double always round-trips
  over the wire, and a phone-hosted table genuinely needs a *second* phone to actually play
  (a solo human vs. the house needs two devices: one dealer, one player). Since the host
  never has player-specific UI, `render()` collapses hosting (phone OR TV) onto the exact
  same `'viewer'` path — no separate `lobby_h`/`playing_h` render functions the way Kings
  Corner needs for its dual host role.
- **Chip economy**: `p.chips`, `START_CHIPS = 500`, `MIN_BET = 10`. Bet is deducted at
  placement (so a mid-round drop doesn't lose the accounting; re-betting first refunds
  whatever was already staked), credited back on resolve. Going broke (`chips < MIN_BET`)
  marks a player `spectating: true` until "Play again" resets everyone's chips — the same
  spectating flag Kings Corner uses for mid-round joiners, reused for the opposite case (a
  player leaving the active table without leaving the room). `MIN_PLAYERS = 1` (not Kings
  Corner's 2) — a single human playing against the house is a complete, valid game.
  `MAX_PLAYERS = 7`, a real blackjack table's seat count.
- **Hand value / bust / blackjack logic** (`handValue`, `isBlackjack`, `dealerShouldHit`,
  `resolveHand`): soft-ace totals, bust detection, natural-21 detection, dealer's fixed
  stand-on-17 rule (S17 — stands on soft 17 too, the simplest common house rule), payout
  resolution. All pure functions, unit-tested in `unit/blackjack.test.js` exactly like Kings
  Corner's `canDropOnPile`/`legalHandMoves`.
- **Host-side hidden information**: `dealerView()` sends only `H.dealer.cards.slice(0, 1)`
  while the hole card is hidden — the actual second card is never put into the object that
  gets serialized to guests, the same "withheld on the host, not hidden client-side"
  principle Going, Going, GONE! uses for purses and mystery lots. Player hands are NOT
  private (real blackjack tables are all face-up except the dealer's hole card) — no
  per-player masking needed there, same as Kings Corner's fully public piles.
- **New ambient scene theme**: `casino` in `common.js`'s `SCENE_THEMES` (small object-literal
  addition, not a new top-level name). Walk cast `🎰 🂡 💰 🎲 🥂`, props `♠️ ♥️ ♦️ ♣️`.
- **No natural "win the match" condition.** Unlike Kings Corner's best-of-1/3/5, Blackjack is
  open-ended like a real casino night — the captain can end the session any time
  ("End session", available from the lobby, betting, and round-over screens — matching
  exactly the phases `hostEndSession` allows), which triggers a podium via the shared
  `rankByScore` on `p.chips` (richest wins).

## What is deliberately NOT here

- **No split, no insurance, no surrender, no multi-deck shoe.** A single fresh-shuffled deck
  per hand also means card-counting is a non-issue.
- **No table-set bet limits.** Each player bets between `MIN_BET` and their own chip stack;
  no captain-configured min/max beyond that.
- **No rebuy economy.** Hitting under `MIN_BET` chips means spectating until "Play again"
  resets the table.
- **No player-vs-player interaction of any kind.** Every hand is independent against the
  dealer; turn order among players (`H.players[]` order = join order) is cosmetic pacing,
  not competition for a shared resource the way Kings Corner's stock is.

## Networking

Host-authoritative PeerJS, room peer id `BLKJK-XXXX`.

**No `hostRekeyPlayer` needed**, same reasoning as Kings Corner: `H.turnIdx` is an index into
`H.players[]`, not a stored id, and the dealer belongs to nobody's id. Hands live on
`player.hand` directly. `zombie.id = conn.peer` on rejoin is the whole fix.

## Message protocol

| Sender | Message | Notes |
|---|---|---|
| Guest→Host | `{type:'join', cid, build, name}` | `claimSeat` + `warnIfStale` |
| Guest→Host | `{type:'join_viewer'}` | TV/spectator |
| Guest→Host | `{type:'hb'}` | heartbeat |
| Guest→Host | `{type:'ctl', action}` | captain-only: `start` (lobby→betting), `deal` (betting→playing, deals everyone who has bet), `next_hand` (round_over→betting), `again` (session_over→lobby, resets chips), `end_session` (→session_over, from lobby/betting/round_over) |
| Guest→Host | `{type:'bet', amount}` | own hand only, during `betting`; clamps to `[MIN_BET, own chips]`, `0` cancels |
| Guest→Host | `{type:'hit'}` | own turn only |
| Guest→Host | `{type:'stand'}` | own turn only |
| Guest→Host | `{type:'double'}` | own turn, first-decision-only (`hand.length===2`), requires `chips >= bet` |
| Host→Guest | `{type:'lobby', players, roomCode, tvHost, captain}` | |
| Host→Guest | `{type:'state', ...}` | one shape for betting/playing/dealer/round_over/session_over |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', ...}` | mirrors guest state — hands are already public, so nothing extra to strip |

`state` sent to each player (`buildDisplay`):
```js
{
  type: 'state', phase, roomCode, isCaptain,
  dealer: { cards, holeHidden, total, isBust, isBlackjack },  // hole card literally absent from `cards` until reveal
  players: [{ id, name, chips, bet, hand, total, soft, isBust, isBlackjack, standing, doubled, spectating, isTurn, lastOutcome, lastDelta }],
  turnPlayerName, isMyTurn, myChips, myBet, canDouble,
  milestones,
}
```

## Game flow

1. **Lobby** — QR + room code (via the shared `tvLobby()` component, same one every
   TV-hosted game uses), captain-only "Open the table".
2. **Betting** — every active (non-spectating, `chips >= MIN_BET`) player picks a bet by
   tapping chip buttons (each tap adds to the running total); captain's **Deal** is enabled
   once ≥1 bet is in and deals only whoever has actually bet — nobody stalls the table
   waiting on a bet from a player who's away.
3. **Dealing** — classic one-card-round-robin-twice order: each bettor gets a card, then the
   dealer, twice around. Naturals (2-card 21) auto-stand.
4. **Player turns** — `H.players[]` order (join order), skipping spectators/non-bettors/
   already-resolved hands: hit / stand / double until stand, bust, or a forced auto-stand at
   21.
5. **Dealer plays** — only if at least one player didn't bust (an all-bust table skips the
   reveal-and-hit sequence — the "dullest outcome is the fastest" taste call this repo
   already makes for Going, Going, GONE!'s passed-in lots). Reveals the hole card, hits to a
   hard-or-soft 17, each card broadcast with a short delay (`dealerStep`, 900ms) for a bit of
   TV drama.
6. **Resolve** (`hostResolve`) — bust = lose, blackjack beats a non-blackjack dealer 3:2,
   dealer bust or higher total = win 1:1, tie = push. Anyone left under `MIN_BET` chips is
   marked spectating.
7. **Round over** — hands and deltas shown; captain's "Next hand" returns to betting.
8. **Session over** — captain's "End session" (available any time from lobby/betting/
   round_over) → podium via `rankByScore` on `p.chips`.

## Rendering notes

- `render()`: `if (isHost || isViewer) ui = 'viewer';` — the one-line simplification that lets
  a phone-hosted "table" and a TV-hosted "table" share literally the same render path, since
  neither ever needs player-specific controls.
- Dealer's hand rendered via `dealerRowHTML` (shared by phone and TV), hole card as a face-
  down `.bj-card.back` until reveal.
- Each seat shows a running total badge (`totalBadge`) — `soft N` / plain total / `BUST` /
  `BLACKJACK` — computed by the same `handValue()`/`isBlackjack()` used for the dealer, no
  duplicated logic between "my hand" and "their hand".
- Full `setHTML`-based re-render on every message (no host-driven timer tick to protect with
  DOM-patch-by-id) — the dealer's card-by-card reveal just re-renders on each `broadcast()`
  call from `dealerStep`.

## Verification

1. `npm run test:unit` — `blackjack.test.js` (16 tests: hand value incl. multi-ace soft
   totals, blackjack detection, dealer S17 rule, full payout table) passes; `common-names.test.js`
   and `presence.test.js` pass with no special-casing needed for this game.
2. `npx playwright test tests/smoke.e2e.spec.js` — loads clean, `casino` scene builds.
3. `npx playwright test tests/blackjack.e2e.spec.js` — TV-hosted: bet → deal → stand/hit/bust
   → dealer reveal → next hand → end session → podium, plus an explicit assertion that the
   dealer's hole card is a 1-card array (not just hidden by rendering) on a non-turn player's
   own wire payload. Phone-hosted: solo player vs. the house, double-down doubles the bet,
   deals exactly one more card, forces a stand, and the final chip delta is cross-checked
   against the real `resolveHand()` function run in-browser (not reimplemented in the test).
4. `npx playwright test tests/shared.e2e.spec.js` — control strip, shared prefs, focus
   survival, the self-playing demo, and the launcher card all pass with blackjack added.
