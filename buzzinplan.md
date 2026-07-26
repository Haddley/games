# Buzzin' 🐝 — game plan

An original "say what you see" emoji **rebus buzz-in** party game. The TV shows an
animated emoji picture-puzzle for a phrase; the whole room races to **BUZZ IN** on
their phones. The first to buzz types a guess (auto-checked). Correct scores +1 and
reveals the phrase; wrong locks that player out and reopens the puzzle to everyone
else. Original mascot: **Buzz the bee** 🐝, a googly-eyed golden cartoon bee who
stars in some puzzles (a bee = "be"/"bee"/"B") and reacts to answers (idle hover,
happy bounce on correct, wobble on wrong).

The buzz-in mechanic is inspired by TV picture-phrase shows, but the name, mascot,
puzzles and code are all original. (No use of any trademarked show name or character.)

## What's different from fibbers (the structural template)

Buzzin' clones fibbers.html's P2P skeleton exactly — host-authoritative `H` state,
`guestConns`/`viewerConns`, `hostPeer`/`joinPeer` (never a bare `new Peer`),
`rankByScore` podium with tie classes, `tvLobby({...})`, `data-save-name` +
`savedName()`/`saveName()`, `#sound-togs`, `const REDUCED`, `const CONFETTI_COLS`,
the inline audio engine (`ac()`/`TRACKS`/`playMusicStep()`/`setMusic()`/stingers) and
the `?mode=tvsimulation` self-driving demo. Rebrand: title "Buzzin'", favicon 🐝,
`PFX = 'BUZZIN-'`, guarded `mountScene('carnival')`, a honey/gold accent palette and a
`body.day` light theme.

The **gameplay** is wholly different:

| | Fibbers | Buzzin' |
|---|---|---|
| Core loop | write a lie → vote → reveal | show rebus → **race to buzz** → answer → reveal |
| Phases | `lobby·lie·vote·reveal·podium` | `lobby·puzzle·answer·reveal·podium` |
| Input | everyone writes + votes | only the **first buzzer** types a guess |
| Contention | none (all submit) | **host-authoritative buzz lock** (first buzz wins) |
| Scoring | rarity/fool payout | **+1** per correct answer |
| Content | trivia Q/A | 36 emoji **rebus** puzzles |

## Message protocol

Player → host: `join{name,avatar}` · `buzz` · `guess{pid,text}` · `ctl{action}`
(captain only: `start`/`again`/`set{pCount,target}`).

Host → player (per-player where noted):
- `lobby` — room, players, settings, tvHost/captain.
- `puzzle_phase{pid,num,total,rebus,hint,star, lockedOut}` — **per-player** `lockedOut`
  flag: locked-out players see "you're out this round", everyone else sees the BUZZ button.
- `answer_phase{pid,rebus,hint, answering:{name,avatar}, mine, seconds}` — **per-player**
  `mine`: the buzzer gets a typed-guess input + a ~10 s countdown; everyone else sees
  "X is answering…".
- `reveal{pid,display,answer,rebus, solved, by, me:{won,delta,out}, standings, isLast}`.
- `podium{standings, awards}`.

Host → viewer (TV): `viewer_lobby` · `viewer_puzzle{…,outNames,players}` ·
`viewer_answer{…,answering,players}` · `viewer_reveal{…,display,solved,by,players}` ·
`viewer_podium`. Rail rows carry `out`/`buzzing` flags for the score list.

### The buzz lock (the make-or-break)

Buzzing is **host-authoritative**. `hostBuzz(player)` accepts the *first* `buzz` only
while `phase==='puzzle'` and `buzzedBy===null` and the player is **not** locked out;
it sets `buzzedBy`, flips to `answer`, starts a `ANSWER_SECS` timeout, and broadcasts
`answer_phase`. Any later buzz (arriving while someone answers, or from a locked-out
player) is ignored. On a **wrong** guess or **answer timeout**, `hostWrong()` adds the
player to `lockedOut`, clears `buzzedBy`, and — if not everyone is locked out — flips
back to `puzzle` and rebroadcasts (buzzing reopens to the rest). If **all** connected
players are locked out, the answer is revealed with no score. A **correct** guess
(`fuzzyMatch`) awards +1 and reveals. If the answering player disconnects mid-answer,
the lock is released without penalty.

## Game flow

`lobby` → per puzzle: `puzzle` (TV animates the rebus; non-locked phones show BUZZ) →
first buzz → `answer` (buzzer types, ~10 s) → host checks → **correct**: +1, reveal the
phrase, Buzz celebrates + confetti, brief `reveal`, auto-advance; **wrong/timeout**:
lock that player out, reopen to the rest (or reveal if all out). After **N puzzles**
(setting: 8/12/16) **or** the first player to **targetScore** (setting: off/5/8),
`showPodium()` ranks with `rankByScore` (joint places for ties).

`reveal` auto-advances after `REVEAL_MS` (3.8 s) to the next puzzle or the podium — a
game-show pace with no "next" tap needed.

## Scoring

Correct answer = **+1** (kept deliberately simple). Award on the podium: 🐝 **Top
Buzzer** = most puzzles solved.

## Fuzzy answer match

`normA()` lowercases, strips punctuation, collapses spaces, and drops a leading
"the/a/an". A guess matches if, against the answer **or** any `accept[]` variant, it is
equal or within **Levenshtein distance ≤ 1** (typo tolerance).

## Content / rebus format

```js
{ answer:'piece of cake', display:'PIECE OF CAKE', rebus:['🧩','+','🍰'],
  hint:'…dead easy', star:false, accept:[] }
```

`rebus` is an ordered array of emoji + operator tokens: `'+'` = and, `'→'` = leads-to,
`'🚫'` = not/no (rendered as faded connectors). `star:true` = Buzz the bee 🐝 features
in the puzzle. **36 puzzles** ship (family-friendly common phrases/idioms), 7 starring
Buzz (spelling bee, beeline, believe = bee+leaf, bee in your bonnet, honeybee, queen
bee, be happy). Each TV token pops in staggered then gently floats/wobbles (killed
under `prefers-reduced-motion`); Buzz reacts per phase.

## Verification

- **Parse**: `new Function` over the inline script — clean. No bare `new Peer(`;
  `mountScene` guarded.
- **Smoke** (`tests/smoke.e2e.spec.js`, `buzzin` added to the games list): loads clean,
  builds the ambient scene, tvLobby QR square, 0 console errors.
- **Functional e2e** (`tests/buzzin.e2e.spec.js`): TV creates room → 3 phones join →
  captain starts → rebus shows on TV, all phones can buzz → A buzzes first (B/C have no
  guess input, see "Ava is answering") → A answers wrong (A locked out, buzzing reopens)
  → B buzzes → B answers the correct phrase (read from `H.cur.answer`) → B scored +1,
  phrase revealed → drive to podium (rankByScore). 0 page errors. A second test captures
  a gallery of 6 different rebus puzzles on the TV so each can be verified to read.
- **Screenshots**: `screenshots/buzzin-*.png` (TV buzz-open, answering, reveal, podium,
  6 gallery puzzles; phone buzz + type-answer).
