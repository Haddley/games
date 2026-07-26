# The Last Laugh — companion plan

😂 A judge-picks-the-funniest-card party game. A rotating **judge** shows a
prompt; every other player plays a card (or two) from their dealt hand; the
judge crowns the funniest and that card's author scores. First to the target
score wins. Two swappable decks (Family / Grown-ups), two prompt styles.

Peer-id prefix `LASTLAF-<CODE>`. Ambient scene `mountScene('masks')`. Built by
cloning `fibbers.html` (same host-authoritative P2P protocol, shared
`common.js`/`fx.js`/`audio.js`/`p2p.js` core, TV-host + captain lobby).

## What's different from fibbers

fibbers is bluff-trivia: everyone writes one lie, the *whole group votes* for
the truth, objective scoring. The Last Laugh keeps the round skeleton but swaps
five things:

1. **Rotating single judge.** `H.judgeIndex` rotates +1 each round;
   `H.judge = H.players[H.judgeIndex % H.players.length]`. Only the judge picks;
   the judge doesn't play a card that round.
2. **Dealt hands.** Each player has `hand[]` of `HAND_SIZE` (7). `H.drawPile` is
   a shuffled copy of the deck's `responses`; `drawCard()` pops it (reshuffling
   the full response list when empty); `dealTo(p)` tops a hand back up to 7 after
   every play and at round start (also for late joiners).
3. **Submit → judge pick** (replaces lie → group vote). Phase `submit`: every
   non-judge plays exactly `n` card(s). Phase `judge`: the shuffled anonymous
   wall is built and **only the judge** picks (gated `player.id === H.judge.id`);
   one pick ends the round.
4. **Simplified scoring.** The picked card's author gets `+1`. No partial credit,
   no truth bonus. First to `H.settings.targetScore` (default 5) → podium.
5. **Two prompt styles + two decks** (see below) with a lobby picker.

## Decks & content

`getDecks()` → `[FAMILY_DECK, GROWNUPS_DECK]`, each `{id, name, emoji, prompts,
responses}`. **All original content** (not Cards Against Humanity / Apples to
Apples, which are trademarked).

- **family** 👪 — wholesome, all-ages. 40 prompts (20 `adj` + 20 `blank`, incl.
  6 double-blanks) + 80 noun-phrase responses.
- **grownups** 🍷 — cheeky adult humour (innuendo, fart/bodily, awkward-family).
  40 prompts (20 `adj` + 20 `blank`, incl. 6 double-blanks) + 80 responses.
  **Hard rule: never hateful, discriminatory, slurs, sexually explicit, or
  targeting real/named people.** Cheeky, not cruel.

**Prompt types** (both appear in both decks):
- `{t:'adj', text}` — TV shows *"Which is most **{text}**?"*; play **1**
  noun-phrase; the wall shows the played noun-phrase.
- `{t:'blank', text, n:1|2}` — a sentence with one/two `____`; play **n**
  noun-phrase(s) in order; the reveal substitutes them via `fillBlank()` (fixes
  the opening capital + trailing full stop).

**The shared-pool trick:** every response is a **noun-phrase** ("a screaming
toddler", never a bare adjective), and blank prompts put `____` at the end /
standalone, so one response pool reads naturally as both *"most ridiculous: a
screaming toddler"* and *"My secret superpower is a screaming toddler."*

## Settings (lobby)

`H.settings = {deckId:'family', style:'both', targetScore:5}`. Rendered by
`settingsSegsHTML()` as three segmented rows (Deck / Prompt style / First to),
driven by the host `hostSet(patch)` or captain `guestCtl('set', patch)` `expr`
callback. Validated in `applySettings()` (used by both `hostSet` and
`hostCtl`'s `set`). `style` filters the chosen deck's prompt pool at round
selection: `deck.prompts.filter(p => style==='both' || p.t===style)`. Echoed to
guests and the `tvLobby({settings})` summary via `settingsSummary()`.

## Message protocol

Host → clients (per-player where hands differ):
- `lobby` / `viewer_lobby` — players, settings, captain.
- `submit_phase` (per player) — `{round, prompt, n, hand, isJudge, judge,
  submitted, playerCount, seconds, ...capt}`; the judge gets an empty hand +
  `isJudge:true`.
- `viewer_submit` — prompt, judge, submitted/playerCount counts, rail.
- `play_ack` — `{hand}` (the replenished hand).
- `judge_phase` (per player) — `{round, prompt, cards:[{key,display}], isJudge,
  myKey, judge, seconds}`; non-judges see the wall read-only, only the judge can
  pick.
- `viewer_judge` — prompt, judge, cards, rail.
- `reveal` (per player) — `{prompt, cards:[{key,display,won,author}], winner,
  winCard, my:{won,delta,isJudge}, standings, isLast, ...capt}`.
- `viewer_reveal` — same + rail.
- `podium` / `viewer_podium` — standings, awards.

Clients → host: `join` / `join_viewer`, `play {round, cards}` (array of the
chosen card texts, length must equal `n`), `pick {round, key}` (judge only),
`ctl {action}` (captain-only: `start`/`next`/`again`/`set`). `round` guards
against stale submissions like fibbers' `qid`.

## Game flow

`hostStartGame` → pick deck, `H.drawPile = shuffle(responses)`, build+shuffle
prompt pool, random starting `judgeIndex`, deal every player a hand → `nextRound`.

`nextRound`: `round+1`; advance/​wrap the prompt pool; set `H.judge`; reset
`_played`, top up hands; phase `submit`; broadcast; `SUBMIT_SECS` timer
(`forceEndSubmit` auto-plays random cards for stragglers).

`hostPlay`: validate not-judge / not-already-played / `cards.length === n` /
every card is really in the hand; remove them, `dealTo`, ack; `maybeEndSubmit`
(all non-judges played → `startJudge`).

`startJudge`: build `H.cards` from each play (`{authorId, texts, display}`),
shuffle, key; phase `judge`; `JUDGE_SECS` timer (`autoPick` picks at random if
the judge stalls / disconnects).

`hostPick` → `finishPick(key)`: author `+1` / `wins+1` / `lastDelta=1`; phase
`reveal`; build `lastRevealFor`. `afterReveal` (captain taps next): if anyone hit
the target → `showPodium`, else rotate `judgeIndex` and `nextRound`.

`showPodium`: `standings()` sorted by score; award **😂 The Last Laugh** to the
top scorer (their laugh count); `rankByScore` gives joint places for ties.

## Scoring

Picked card's author `+1` per round. Score == rounds won. First to
`targetScore` (3 / 5 / 7, default 5) wins. Podium via `rankByScore` (joint
places for equal scores).

## Verification

- Parse: `new Function` over the inline script — OK (~82k chars). No bare
  `new Peer(`; `mountScene('masks')` guarded.
- Smoke: `npx playwright test tests/smoke.e2e.spec.js` — 19/19 pass (lastlaugh
  added to the games list: loads clean, scene builds, tvLobby QR square, 0
  console errors).
- Functional e2e: `tests/lastlaugh.e2e.spec.js` — TV + 3 phones over real
  PeerJS. Asserts one judge + two 7-card hands, real submit-UI plays (adj n=1
  and double-blank n=2), judge-only pick gate, picked author `+1`, judge
  rotation, and a rendered podium; 0 page errors. Screenshots
  `screenshots/lastlaugh-*.png`.
- Simulation: `?mode=tvsimulation` / `?mode=playersimulation` (&players=N) —
  self-driving demo with bot players (target 3, loops).
