# E2E tests

Each spec plays a real multi-device game in one browser — host phone, player
phones, and a 1080p TV scoreboard as separate pages talking over PeerJS — and
screenshots every screen so you can eyeball the UI.

| Spec | Covers |
|---|---|
| `smoke.e2e.spec.js` | **every** game loads clean, builds its ambient scene, common.js is wired, the TV-lobby QR is square, a stale `common.js` can't blank a game, the connection badge + reconnect curtain |
| `<game>.e2e.spec.js` | that game's full flow, lobby → play → podium (letterstorm, familytrivia, fibbers, doodleparty, oddsheep, herdmind, categoryclash, bestguess, brokenpencil, moonlightvillage, goinggone, bingo, cornerthemarket, buzzin, lastlaugh, ticktacktoe) |
| `reconnect.e2e.spec.js` | a dropped phone rejoining its own seat, a browser refresh mid-round, the 👑 crown passing when the captain drops and returning when they rejoin |
| `relay.e2e.spec.js` | the connection path against the **real** TURN server: forced `iceTransportPolicy:'relay'` must light 📡 on both ends; a normal link reports 🏠/🌐; `?net=0` hides the badge |
| `shared.e2e.spec.js` | what common.js promises EVERY game: the control strip on all of them, day/night and your name carrying between games, `setHTML` keeping focus + caret, every `?mode=tvsimulation` attract mode playing itself cleanly, every launcher card resolving |
| `dice.e2e.spec.js` | the shared die on its own: every value lands on its face, throws vary in length, no scale pop, `settleDie` snaps mid-throw, `onTick`/`onLand` fire in order |
| `plumptrek.e2e.spec.js` | the board game end to end: Build card → a real phone roll → each Gimmick flavour (a movement card, a dare with its Done button, a kept card) → a rigged Finale → podium; plus the fork and the self-playing demo. Then the two big areas that grew afterwards: **the sprite pieces** (sheet loads at the size the CSS assumes, whole-frame animation, walking between squares, reactions, mood, the 30-piece picker and its collision rule, reduced motion) and **staying on board** (refresh mid-turn, a phone that never returns, the captain's tidy-up controls and their minimum-players guard) |

`unit/` alongside holds the fast, browser-free tests (`npm run test:unit`): the shared
files' pure helpers, and Plump Trek's board maths and deck integrity.

The peer-heavy specs allow **one retry** — several rooms opened back-to-back sometimes get
throttled by the public PeerJS broker and a join never lands. That's the external service;
don't add a retry to hide a real race.

The screenshot table below is Letter Storm's (the original suite); the other
specs follow the same naming.

## One-time setup

```sh
npm install
npx playwright install chromium
```

## Run

```sh
npm run test:e2e          # headless
npm run test:e2e:headed   # watch it play
```

Needs internet: the game uses the public PeerJS broker and fetches the
dictionary from GitHub.

## Output

Screenshots land in `screenshots/` (gitignored):

| File | Screen |
|---|---|
| 01-home | Home / join screen |
| 02–04 | Host, guest, and TV lobbies (big QR) |
| 05 | 3-2-1-GO round countdown |
| 06–07 | Phone board + TV game view (START GAME) |
| 08–09 | TV live feed (streak, lead change) + phone mid-round |
| 10 | TV final-10-seconds countdown |
| 11–13 | Phone + host + TV round results (END OF ROUND, reveal theater, join QR) |
| 14–16 | Phone + host + TV game over (END OF GAME, podium, hall of fame) |

## Notes

- The test sets rounds to 1 so round results double as final results.
- Words are submitted through the real guest→host network path; the host
  judges them against the dictionary (board adjacency is not enforced
  host-side, so the test can use fixed words on any rolled board).
- The round is fast-forwarded by setting the host's `H.timeLeft` — no
  90-second waits.

## The reconnect id-rekey tests

A player's identity is their peer id, and a refresh mints a new one. Three tests cover the
class of bug that follows (see `llmwiki/connection-and-reconnect.md`):

- `unit/plumptrek.test.js` → *"hostRekeyPlayer rewrites every place a player id is stored"* —
  greps the engine for fields assigned a player id and fails if the rekey doesn't mention
  one. This is the one that stops the bug coming back; it caught a missed field immediately.
- `tests/plumptrek.e2e.spec.js` → *"a refresh on your own turn…"* — the actual reported
  scenario: captain, own turn, page reloads, rejoins, must get the Roll button back and the
  game must move on.
- `tests/oddsheep.e2e.spec.js` → *"a refresh keeps your place in the clue order and your vote
  counted"* — the same defect in the other game that stores ids.

## The "keep everyone on board" tests

These are rare paths and they are exactly what people judge a party game on: if the room ever
sits waiting for a phone that isn't coming back, or somebody can't get back in, the evening
is over. All of them drive real rooms over real PeerJS.

| test | what would break without it |
|---|---|
| a refresh on your own turn | you never get the Roll button back; the room waits forever (this is the bug that was actually reported) |
| a phone that vanishes: quick back / gone for good | quick: the idle-roll safety net is gone for that turn. Gone: the room waits the full 70s **every lap**, because `conn.on('close')` never fired |
| the captain can continue without someone — but never below the minimum | a room drops itself to one player and ends |
| dropping the player whose turn it is | the room is left waiting on a player who no longer exists |
| back to the lobby reopens the room | the people who dropped out can't get back in |
| two players, one leaves | the only two controls offered would both end the game |
| a player tidied away who reconnects | they land on a dead screen with no way in |
