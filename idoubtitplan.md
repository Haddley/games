# idoubtit.html — rules & protocol reference

## Context

"I Doubt It" (a.k.a. Cheat, or BS), built on Kings Corner and Go Fish's precedent for
peer-vs-peer card games in this repo. Rules fetched directly from
pagat.com/beating/cheat.html rather than relying on memory, since the exact wording of the
challenge/pickup rule and the win condition matter. Neil's own instruction up front:
**default to no restriction on the rank claimed** (pagat's own "Chinese version... no rank
restrictions" variant), with the classic forced-ascending-sequence rule available as a
**captain-configurable lobby toggle**, off by default.

## Rules source (pagat.com/beating/cheat.html, fetched directly)

- **Players & deck**: "2 to 10" (this repo caps it at 8 — the practical phone/TV ceiling
  Blackjack and Go Fish already settled on). Standard 52-card deck.
- **Deal**: "All the cards are dealt out to the players; some may have more than others, but
  not by much" — round-robin the whole deck, no stock left over.
- **A turn**: "discard one or more cards face down on the pile, and call out their rank...
  you do not in fact have to play the rank you are calling" — bluffing is the whole
  mechanic, not an edge case.
- **The classic rule** (captain-configurable here, OFF by default): "the first player must
  discard Aces, the second player Twos, the third Threes, and so on... after Tens come
  Jacks, then Queens, then Kings, then back to Aces" — the declared rank is dictated by turn
  position, cycling continuously, not chosen freely.
- **Default here**: pagat's own noted variant — "a Chinese version has no rank restrictions,
  only claiming equal ranks" — each player freely declares whatever rank they like, every
  turn, independent of any sequence or of what was claimed before.
- **Challenging**: "any player who suspects the discarded cards do not match the rank called
  can challenge by calling 'Cheat!', 'Bullshit!' or 'I doubt it!'"
- **Resolution**: "if the cards match the declared rank, the challenger must pick up the
  whole discard pile; if they don't match, the person who played them must pick up the whole
  discard pile." **Whole pile**, not just the challenged play — an unchallenged pile keeps
  accumulating turn after turn until somebody finally calls a challenge on some later play.
- **Winning**: "the first player to get rid of all their cards and survive any challenge
  resulting from their final play wins" — going out isn't safe until the (possible)
  challenge on that exact play resolves in the player's favour.

## Reused from Kings Corner / Go Fish, near-verbatim

- **Card model**: `makeCard`, `makeDeck`, `suitColor`, `shuffled`, `rankShort`, `cardLabel`,
  `cardSpoken`, `SUIT_SYM`/`SUIT_WORDS`/`RANK_WORDS`, `esc` — the same inline copy every card
  game in this repo keeps.
- **Card CSS**: the corner-indexed card face lineage, `.id-card` this time.
- **Connection scaffold**: `hostPeer`/`joinPeer`/`p2pCurtain`/`p2pWatchRelay`, `clientId`/
  `rememberRoom`/`savedRoom`/`claimSeat`/`notePresence`/`startHeartbeat`/`presentPlayers`/
  `warnIfStale`/`showStaleBuild`, `capPlayer()`/`capSync()`, mid-round-joiner-as-spectator,
  the host-can-also-play split (`isHost && !isTvHost` acts on local state directly — same
  reasoning as Go Fish: no ongoing house role once the deal is done), the
  `?mode=tvsimulation|playersimulation&players=N` self-playing demo scaffold.
- **`ambient.js`** (not `audio.js`) — same lightweight profile as the other card games.

## What's new here

- **The pile is real, host-only truth; clients only ever see its length and the current
  claim.** `H.pile` accumulates actual `Card` objects across every unchallenged turn — never
  serialized to a client. `H.lastPlay = { playerId, claimedRank, cards }` holds only the
  MOST RECENT play's real cards (for challenge truth-checking); a client's own `state`
  message carries just `{ playerName, count, claimedRank, deadline }` for it. Same
  "withheld on the host" principle as Blackjack's hole card and Go Fish's opponent hands.
- **A real clock, new to this trio of card games.** Kings Corner and Go Fish are both
  untimed; this one can't be, since "does anyone want to challenge" is a race against other
  players noticing and tapping in time. `CHALLENGE_WINDOW_MS` (6000ms) opens the instant
  `hostPlay` broadcasts; `resolvePlay(challengerId)` runs either from that timeout firing
  (`challengerId = null`, unchallenged) or from the first `challenge` message the host
  receives — whichever happens first. A second trigger arriving after `H.lastPlay` is
  already cleared is a no-op (`resolvePlay`'s very first line), the honest way to referee
  "who called it first" over a network with real latency.
- **Multi-card free-form selection.** A player selects **any 1+ cards** from their hand
  (checkbox-style multi-select via `idToggleCard`, not one-at-a-time) and declares ONE rank
  for the whole group — the true ranks need not match each other, let alone the claim.
- **Validate fully before mutating anything.** `hostPlay` checks phase, turn, duplicate ids,
  rank range, sequence-mode compliance, and hand membership — all before touching `p.hand` —
  so a malformed or adversarial message can never leave a hand half-changed. The duplicate-id
  check in particular exists because two passes over the same ids (validate, then remove)
  would otherwise silently corrupt the array on the second occurrence.
- **Win check is a by-product of `resolvePlay`, not a separate step.** The instant a play
  empties a hand, nothing is declared yet — `resolvePlay` checks that player's
  `hand.length` AFTER any pickup has been applied: still 0 → never made to pick the pile
  back up → they've won. Caught bluffing → the pile lands back in their hand → no win, game
  continues.
- **New ambient scene theme**: `bluff` in `common.js`'s `SCENE_THEMES` — smoky purple
  backroom-card-game palette, walk cast `🃏 🤫 😏 👀 🎭`. (`masks` already exists and would
  fit thematically, but it's already used by `fibbers.html` and `lastlaugh.html`.)

## What is deliberately NOT here

- **No player-selectable "who to accuse"** — a challenge is just "I doubt the play that's
  currently pending."
- **No variant beyond the one asked for.** Pagat also mentions descending-sequence and
  higher-or-lower variants; only the free-rank default and the classic ascending sequence
  are implemented.
- **No full first/second/third ranking beyond the winner** — the game ends the instant
  someone goes out and survives; the podium ranks everyone else by cards **remaining**
  (fewer is better) via the same `rankByScore` every other game's podium uses.

## Networking

Host-authoritative PeerJS, room peer id `IDOUBT-XXXX`. `MIN_PLAYERS = 2`, `MAX_PLAYERS = 8`.

**No `hostRekeyPlayer` needed**: `H.turnIdx` is an index into `H.players[]`; `H.lastPlay` and
challenges are keyed off `H.players[H.turnIdx].id`/the sender's own id at the moment they
act, never stored across a reconnect boundary. A rejoin is `zombie.id = conn.peer`.

## Message protocol

| Sender | Message | Notes |
|---|---|---|
| Guest→Host | `{type:'join', cid, build, name}` | `claimSeat` + `warnIfStale` |
| Guest→Host | `{type:'join_viewer'}` | TV/spectator |
| Guest→Host | `{type:'hb'}` | heartbeat |
| Guest→Host | `{type:'ctl', action, value}` | captain-only: `sequenceMode` (bool, lobby only), `start` (lobby→playing, deals hands), `again` (match_over→lobby) |
| Guest→Host | `{type:'play', cardIds, claimedRank}` | own turn only; in sequence mode `claimedRank` is host-validated against the required rank regardless of what the client sends |
| Guest→Host | `{type:'challenge'}` | any active player except the one who just played; a stale challenge (after `H.lastPlay` already resolved) is a silent no-op |
| Host→Guest | `{type:'lobby', players, roomCode, tvHost, captain, sequenceMode}` | |
| Host→Guest | `{type:'state', ...}` | one shape for playing/match_over |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', ...}` | mirrors guest state minus `myHand`/`isMyTurn`/`canChallenge` |

`state` sent to each player (`buildDisplay`):
```js
{
  type: 'state', phase, roomCode, isCaptain,
  myHand,                                    // full Card objects — yours only
  isMyTurn, turnPlayerName,
  sequenceMode, requiredRank,                 // requiredRank is null outside sequence mode
  pileCount,                                  // never the actual cards
  pendingPlay: { playerName, count, claimedRank, deadline } | null,
  canChallenge,
  players: [{ id, name, handCount, spectating, isTurn }],
  milestones, winnerName,
}
```

## Game flow

1. **Lobby** — QR + room code, captain-only `sequenceMode` toggle and Start, disabled below
   `MIN_PLAYERS`.
2. **Deal** — full 52-card deck shuffled and dealt round-robin, no stock. `H.seqRankIdx = 0`
   (Aces first) if sequence mode is on.
3. **Playing** — current player selects 1+ cards and a claimed rank (fixed and shown, not
   chosen, in sequence mode) and sends one `play`. The host opens `CHALLENGE_WINDOW_MS`; any
   other active player may send one `challenge`. Whichever resolves first runs `resolvePlay`,
   which moves the pile to a loser (or leaves it stacked, unchallenged), checks for a win,
   and otherwise calls `advanceTurn` (which also steps `seqRankIdx` when sequence mode is
   on).
4. **Match over** — the instant a play goes both empty-handed and unchallenged-or-vindicated:
   podium via `rankByScore` on cards remaining (ascending); captain-only "Play again"
   reshuffles and re-deals to the same room.

## Rendering notes

- Your own hand: face-up `.id-card`s, tap to multi-select for the current play.
- Rank picker: 13 chips, always all enabled in free mode (bluffing means claiming anything is
  legal, unlike Go Fish's "only ranks you actually hold"); replaced by a plain "you must
  claim: Sevens" label with no picker when sequence mode is on.
- Pending-play banner: "Ann plays 3, claims Sevens" plus a live countdown to the challenge
  deadline and, if it's not your own play, an "I DOUBT IT!" button.
- The countdown is the one exception to full re-render in this trio: `syncCountdown` arms a
  local `setInterval` that patches `#id-countdown`'s text directly (not a full `render()`
  loop) while a `pendingPlay` is present, cleared the moment a new `state` arrives — purely
  cosmetic, since the host's own timer is what actually resolves the window.
- Pile: a capped visual card-back stack with a count badge — never reveals identities.
- Milestones (`addMilestone`/`toastMilestones`/`speak`, same pattern as the other card
  games): a play, a challenge and its result, someone going out, the match winner.

## Verification

1. `npm run test:unit` — `idoubtit.test.js` (13 tests: rejecting an unowned card, rejecting
   duplicate ids without corrupting the hand, a legitimate play, sequence-mode enforcement,
   all four `resolvePlay` outcomes crossed with "was this their last card," a stale/duplicate
   resolution being a no-op, self-challenge refusal, and the Ace→King→Ace sequence wrap)
   passes; `common-names.test.js` and `presence.test.js` pass with no special-casing needed.
2. `npx playwright test tests/smoke.e2e.spec.js` — loads clean, `bluff` scene builds.
3. `npx playwright test tests/idoubtit.e2e.spec.js` — TV-hosted: the sequence-mode toggle
   reaching the host both ways, an unchallenged play, a challenge that catches a bluff, one
   that backfires on the challenger, a forced win, podium, plus a wire-payload check that a
   non-turn player's own `state` never contains another player's real card ids. Phone-hosted:
   the host is a real seated player.
4. `npx playwright test tests/shared.e2e.spec.js` — control strip, shared prefs, focus
   survival, the self-playing demo, and the launcher card all pass with the new game added.
