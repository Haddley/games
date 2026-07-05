# Plan: Call My Bluff — `public/games/bluff.html`

## Context
Build a multiplayer browser implementation of Call My Bluff, playable on smartphones via a shared URL. Architecture must match `pit.html` exactly: single self-contained HTML file, PeerJS P2P networking (one host, N guests, optional viewers), same dark/day design system (JetBrains Mono + Orbitron, CSS custom properties, `body.day` toggle).

**Rules (BBC TV game show format):**
- 2 teams; each round one team bluffs, the other guesses
- Bluffing team sees an obscure word + its real definition; two members each write one fake definition
- All three definitions (1 real + 2 fakes) are presented to the guessing team in shuffled order (A / B / C)
- Guessing team discusses internally, then submits a single team vote (majority, or captain decides)
- **Correct guess** → guessing team scores 1 point
- **Wrong guess** → bluffing team scores 1 point
- Teams swap roles each round; play for a fixed number of rounds (default 10); highest score wins

---

## Critical files
| File | Role |
|------|------|
| `public/games/pit.html` | Source pattern for all architecture |
| `public/games/bluff.html` | **New file to create** |

---

## Architecture (mirror pit.html exactly)

### Networking
- PeerJS 1.5.4 (`https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js`)
- Host peer ID = 4-char uppercase room code (no I or O), same generator as other games
- `guestConns {}` — host → guest connections keyed by peer ID
- `viewerConns {}` — host → viewer connections
- Viewer sends `{type:'join_viewer'}` on connect; host replies with `{type:'viewer_state', vd}`
- Host broadcasts `{type:'state', display}` (personalised per player) after every state change
- Lobby sync: `{type:'lobby', players, teams, roomCode, settings}`

### Host state `H`
```js
{
  players: [{id, name, team}],      // team: 0 or 1
  phase: 'lobby'|'writing'|'presenting'|'guessing'|'reveal'|'gameover',
  bluffingTeam: 0,                  // index of team currently bluffing
  round: 1,
  maxRounds: 10,
  scores: [0, 0],                   // scores[0] = team 0, scores[1] = team 1
  currentWord: {word, definition},  // chosen from word bank
  usedWords: [],                    // prevent repeats
  definitions: [                    // shuffled A/B/C shown to guessing team
    {label:'A', text, authorId, isReal},
    {label:'B', text, authorId, isReal},
    {label:'C', text, authorId, isReal},
  ],
  fakesDue: [playerId, playerId],   // two bluffing-team members who must submit a fake
  fakesReceived: {},                // {playerId: text}
  teamVotes: {},                    // {playerId: 'A'|'B'|'C'} — guessing team only
  chosenDefinition: null,           // final team choice ('A'|'B'|'C')
  winner: null,                     // 0 or 1
}
```

### Player display `D` (sent per-player from host)
```js
{
  phase,
  myTeam,           // 0 or 1
  bluffingTeam,
  isBluffing,       // myTeam === bluffingTeam
  isGuessing,       // opposite
  isFakeDue,        // this player must submit a fake this round
  currentWord,      // only sent to bluffing team in 'writing' phase
  definitions,      // A/B/C texts — sent to guessing team in 'presenting'/'guessing', all in 'reveal'
  myVote,           // this player's current vote (guessing phase)
  voteCount,        // how many guessing-team members have voted
  votesNeeded,
  chosenDefinition, // reveal phase
  scores,
  round, maxRounds,
  players: [{name, team, hasSubmitted}],
  roomCode, winner,
}
```

### Viewer display `vD`
```js
{
  phase, scores, round, maxRounds,
  bluffingTeam,
  currentWord,      // shown in presenting/reveal phases
  definitions,      // shown in presenting/reveal (all labels)
  chosenDefinition, // reveal phase
  players: [{name, team}],
  winner,
}
```

---

## Word Bank
Built-in array of ~60 obscure English words, each with a verified real definition. Stored as a `const WORDS` array at the top of the script. Examples:

```js
const WORDS = [
  { word: 'QUEACH',      definition: 'A dense thicket of shrubs or bushes' },
  { word: 'JIRBLE',      definition: 'To pour out with an unsteady hand' },
  { word: 'ABLEWHACKET', definition: 'A card game in which the loser is struck on the palm' },
  { word: 'ZURF',        definition: 'A holder for a hot coffee cup' },
  { word: 'MOREPORK',    definition: 'A small owl native to New Zealand and Australia' },
  { word: 'JARGOON',     definition: 'A pale or smoky variety of zircon' },
  { word: 'SNOLLYGOSTER', definition: 'A shrewd, unprincipled person, especially a politician' },
  { word: 'YARBOROUGH',  definition: 'A hand of cards containing no card above a nine' },
  { word: 'ULTRACREPIDARIAN', definition: 'One who gives opinions beyond their area of expertise' },
  // … ~50 more entries
];
```

Words are chosen randomly without replacement each game (`H.usedWords` tracks used indices).

---

## Game Logic

### Team assignment (lobby)
- Host assigns each player to team 0 or 1 via toggle buttons in `lobby_h`
- Minimum 2 players per team (4 total); recommended 3 per team (6 total)
- Host starts the game only when both teams have ≥ 2 players

### Round start
1. Host picks a random unused word from `WORDS` → `H.currentWord`
2. Assign `H.fakesDue`: pick 2 players from bluffing team (round-robin across rounds)
3. `H.phase = 'writing'`; broadcast state
4. Bluffing-team players see the word + real definition and a text input to enter their fake

### Writing phase
- Only players in `H.fakesDue` can submit; others see "Waiting for your teammates to write definitions…"
- Guest → Host: `{type:'fake', text}` — host stores in `H.fakesReceived`
- When both fakes received:
  - Build `H.definitions`: 3 entries `[{text, isReal, authorId}]`, one `isReal:true`
  - Shuffle them; assign labels A / B / C
  - `H.phase = 'presenting'`; broadcast state

### Presenting phase
- Bluffing team see definitions labelled A / B / C to read aloud
- Guessing team see the same A / B / C list but **not** which is real
- Host (or host player) taps "Start Voting" → `H.phase = 'guessing'`; broadcast

### Guessing phase
- Each guessing-team player privately submits a vote: A, B, or C
- Guest → Host: `{type:'vote', choice:'B'}`; stored in `H.teamVotes`
- Vote count shown ("3 / 3 voted") without revealing individual choices
- When all guessing-team players voted: host auto-advances OR host taps "Reveal"

### Reveal
- `H.phase = 'reveal'`; all players see full definitions with `isReal` flag shown
- Determine team choice:
  - Majority vote wins; ties broken by team captain (first player in team array)
  - `H.chosenDefinition` = winning label
- Score:
  - If chosen definition `isReal` → guessing team +1 (`H.scores[guessingTeam]++`)
  - Else → bluffing team +1 (`H.scores[bluffingTeam]++`)
- Host (or any player) taps "Next Round" → `{type:'next_round'}`

### Next round
1. `H.round++`; swap `H.bluffingTeam` (0→1→0)
2. Clear `definitions`, `fakesReceived`, `teamVotes`, `chosenDefinition`
3. If `H.round > H.maxRounds`: `H.phase = 'gameover'`; determine `H.winner` (higher score; tie = draw)
4. Else: pick next word, `H.phase = 'writing'`; broadcast

---

## UI Screens

| Screen | Who sees it |
|--------|-------------|
| `home` | Everyone on load |
| `creating` / `connecting` | Spinner while PeerJS connects |
| `lobby_h` | Host player — team assignment + settings |
| `lobby_g` | Guest players — shows teams, wait for host |
| `writing` | Bluffing team members in `fakesDue` get input; others wait |
| `presenting` | All players see A/B/C definitions; host shows "Start Voting" button |
| `guessing` | Guessing-team members see vote buttons A/B/C; bluffing team waits |
| `reveal` | All players — correct definition highlighted, score delta, updated totals |
| `gameover` | All players — final scores, winner |
| `viewer` | Read-only full-screen view |

### Home screen
Same layout as pit.html: name input, Create Game / Join Game / Join as Viewer cards.

### Lobby (host)
```
[Team 0]          [Team 1]
Alice  ⇄           Bob   ⇄
Carol  ⇄           Dave  ⇄

Settings:
Rounds: [5] [10] [15]

[▶ Start Game]  (disabled until ≥2 per team)
```
`⇄` button moves a player to the other team.

### Writing screen (bluffing-team fake writers)
```
Round 3 / 10  —  YOUR TEAM IS BLUFFING

WORD: JIRBLE

Real definition (shown to you only):
"To pour out with an unsteady hand"

Write a convincing fake definition:
[___________________________________]
[Submit Fake]
```
Other bluffing-team members see: "Waiting for teammates to write…" + names with ✓ as they submit.
Guessing team sees: "Round 3 — The other team is writing their bluffs…"

### Presenting screen
```
Round 3 / 10  —  GUESS THE REAL DEFINITION OF:

JIRBLE

A  "To pour in a circular motion until frothy"
B  "To pour out with an unsteady hand"
C  "To filter liquid through a mesh of grass or reeds"

[Start Voting]   ← host-only button
```

### Guessing screen
```
Round 3 / 10  —  VOTE FOR THE REAL DEFINITION

JIRBLE

[  A  ]  [  B  ]  [  C  ]

2 / 3 voted
```
Bluffing team see: "Guessing team is voting… (2/3)"

### Reveal screen
```
Round 3 / 10

JIRBLE — "To pour out with an unsteady hand"

A  "To pour in a circular motion…"        ← fake (Carol)
B  ✓ "To pour out with an unsteady hand"  ← REAL
C  "To filter liquid through…"            ← fake (Alice)

Team 1 chose: C  →  WRONG  →  Team 0 scores! +1

Scores:  Team 0: 2   Team 1: 1

[Next Round]   ← any player
```

### Gameover screen
```
🏆 TEAM 0 WINS

Team 0: 6 pts
Team 1: 4 pts

[Play Again]   ← returns to lobby
```

---

## Viewer Layout (TV / big screen)

Header: "CALL MY BLUFF" title (gradient) + room code + fullscreen button

**Lobby:** Team lists side by side with player chips
**Writing:** Word hidden; "Team 0 is writing their bluffs…" + spinner
**Presenting/Guessing:** Word + A/B/C definitions visible; vote progress bar
**Reveal:** Correct definition highlighted; score animation; team scores update
**Gameover:** Winner banner + final scores

---

## CSS (on top of pit.html design system)

All base variables (`--bg`, `--surface`, `--s2`, `--border`, `--text`, `--muted`, `--accent`, `--ag`, `--danger`, `--dg`, `--success`) and utility classes (`.btn`, `.btn-p`, `.btn-g`, `.btn-d`, `.btn-full`, `.fg`, `.card`, `.hdr`, `.err`, `.spin`, `.chips`, `.chip`) are reused verbatim from pit.html.

New additions:
- `.teams-grid` — two-column layout for team assignment in lobby
- `.word-display` — large Orbitron word heading in writing/presenting screens
- `.real-def` — dimmed italic display of real definition (bluffing team only)
- `.def-card` — bordered definition option (A/B/C); `.def-card.chosen`, `.def-card.correct`, `.def-card.wrong`
- `.vote-btn` — large tap-target vote button; `.vote-btn.selected`
- `.vote-bar` — progress indicator ("2 / 3 voted")
- `.score-row` — two-team score display in reveal + gameover
- `.reveal-badge` — ✓ / ✗ icon overlay on def-card after reveal
- `.round-label` — "Round N / M" small caps header

---

## Message Protocol Summary

| Sender | Message | Purpose |
|--------|---------|---------|
| Guest→Host | `{type:'join', name}` | Enter lobby |
| Guest→Host | `{type:'join_viewer'}` | Viewer mode |
| Guest→Host | `{type:'fake', text}` | Submit fake definition (writing phase) |
| Guest→Host | `{type:'vote', choice}` | Vote A/B/C (guessing phase) |
| Guest→Host | `{type:'start_voting'}` | Host player advances presenting→guessing |
| Guest→Host | `{type:'next_round'}` | Any player advances reveal→next round |
| Guest→Host | `{type:'restart'}` | Return to lobby after gameover |
| Guest→Host | `{type:'move_player', id, team}` | Host reassigns player to team |
| Host→Guest | `{type:'lobby', ...}` | Lobby sync |
| Host→Guest | `{type:'state', display}` | Per-player game state |
| Host→Viewer | `{type:'viewer_lobby', ...}` | Lobby for viewer |
| Host→Viewer | `{type:'viewer_state', vd}` | Viewer game state |

---

## Settings (lobby, host only)
| Setting | Options | Default |
|---------|---------|---------|
| Rounds | 6 / 10 / 14 | 10 |

---

## Verification
1. `npm run dev` → open `/games/bluff.html` in browser
2. Open 4+ tabs: 2 per team; create in one, join with room code in others
3. Verify: word dealt to bluffing team only during writing; both fakes required before presenting; all three definitions shuffled correctly; voting hidden from bluffing team; scoring accurate; roles swap each round; gameover triggers at correct round count
4. Test edge: tie vote (captain's vote is tiebreaker); all wrong votes (bluffing team point); viewer sees correct phase at each step; round limit reached mid-game
