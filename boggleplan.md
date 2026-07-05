# boggle.html — Implementation Plan

Based on pit.html patterns. Single self-contained HTML file using PeerJS for P2P networking.

---

## Step 1: HTML Shell + Design System
Copy the CSS framework from pit.html verbatim: CSS variables, fonts (Orbitron + JetBrains Mono), `.card`, `.btn`, `.btn-p/.btn-d/.btn-g`, `.fg input`, `.room-code`, `.chip`, `.status`, `.err`, spinner, confetti, viewer-mode body class. Add PeerJS CDN script tag.

---

## Step 2: Home Screen
Three buttons: **Host Game**, **Join Game**, **Watch (Viewer)**. Name input field shown for Host and Join. Toggle for number of rounds (3, 5, 10). Same layout as pit.html's home card.

---

## Step 3: PeerJS Connection Layer
Exact same pattern as pit.html:
- **Host**: `new Peer('BOGGLE-XXXX')` where XXXX is a random 4-char code
- **Guest/Viewer**: connect to `'BOGGLE-' + enteredCode`
- Track `myPeer`, `hostConn` (guest/viewer side), `guestConns{}` and `viewerConns{}` (host side)
- Message envelope: `{type, payload}` — same structure as pit.html

---

## Step 4: Lobby Screens
- **Host lobby** (`lobby_h`): shows room code, QR-linkable URL, player list with ready dots, "Start Game" button (disabled until ≥2 players), round settings
- **Guest lobby** (`lobby_g`): shows room code, waiting message, player list driven by host broadcasts
- **Viewer lobby**: fullscreen dark screen showing large room code and "Waiting for players…"

---

## Step 5: Board Generation (Host Only)
Define the standard 16 Boggle dice faces as a constant array of 6-letter strings. On game start, host shuffles dice order and rolls each die randomly. `Qu` is stored as `'Qu'` and displayed as one tile. Board is a flat 16-element array broadcast to all.

```js
const DICE = [
  'AAEEGN','ELRTTY','AOOTTW','ABBJOO',
  'EHRTVW','CIMOTU','DISTTY','EIOSST',
  'DELRVY','ACHOPS','HIMNQU','EEINSU',
  'EEGHNW','AFFKPS','HLNNRZ','DEILRX'
];
```

---

## Step 6: Board CSS — Player View
4×4 CSS grid on the player's phone:
- Each cell is a square tile with letter centred (Orbitron font, large)
- States: `default` | `selected` (accent border + glow) | `in-path` (dimmed but visible) | `disabled` (grey, can't chain to)
- `Qu` tile uses smaller font-size to fit
- Grid sized to fill phone width: `grid-template-columns: repeat(4, 1fr)`, square cells via `aspect-ratio: 1`

---

## Step 7: Board Interaction — Tap-to-Chain
On the player's phone:
- Tap a tile to start a word path
- Subsequent taps must be on an adjacent tile (8 directions) not already in path
- Current word built letter by letter shown above the grid
- **Backspace** removes last letter (releases last tile)
- **Submit** button adds word to list if ≥3 letters and path is valid
- Adjacency check: tiles i and j are adjacent if `|row(i)-row(j)| ≤ 1 && |col(i)-col(j)| ≤ 1 && i !== j`
- Path highlighted with numbered indicators on tiles
- Submitted words appear in a scrollable list below the grid; duplicates silently rejected

---

## Step 8: Host-Authoritative Timer
- Host tracks `timeLeft` (180 seconds), decrements with `setInterval`
- Broadcasts updated state every second (piggybacks on state object)
- Clients display timer from received state — no client-side countdown drift
- Last 10 seconds: timer pulses red
- When `timeLeft === 0`: host transitions phase to `'scoring'`, broadcasts

---

## Step 9: Word Collection
- When phase changes to `'scoring'`, each guest sends `{type:'words', payload: ['cat','dog',…]}`
- Host already holds its own word list
- Host waits for all guests to respond (with 3-second timeout for slow connections)
- Once all lists received, host runs scoring

---

## Step 10: Scoring Logic (Host)
```
1. Flatten all words to lowercase
2. Count how many players found each word → remove any found by 2+ players
3. Validate remaining words: adjacency already guaranteed client-side; optionally check dictionary
4. Score each remaining word per player:
   3-4 letters = 1pt, 5 = 2pt, 6 = 3pt, 7 = 5pt, 8+ = 11pt
5. Add to cumulative player scores
6. Broadcast full results: per-player { words: [{word, pts, dupe}], roundScore, totalScore }
```

---

## Step 11: Dictionary Validation
Two options — choose based on file size tolerance:

**Option A (recommended):** Fetch a prebuilt word list from a public URL at game start. Store as a `Set` in memory. Validate words against it during scoring. A 50k-word English list is ~300KB uncompressed.

**Option B (no network):** Embed a compressed minimal word list (common 3–8 letter words) as a base64 string in the HTML. Smaller but less complete.

Validation only happens at scoring time on the host. Invalid words score 0 and are shown crossed out in results.

---

## Step 12: Results Screen
After scoring:
- **Player view**: their own word list with each word colour-coded (green=scored, grey=duplicate, red=invalid), round score, total score
- All players see a leaderboard card with rank, name, round score, total score
- "Next Round" button (host only) or "New Game" if rounds exhausted

---

## Step 13: Viewer Mode — TV Layout
Full viewport, landscape-optimised:
```
┌─────────────────────────────────────────────┐
│  BOGGLE          ROOM: ABCD       [⛶]       │  ← header
├──────────────────┬──────────────────────────┤
│                  │  Player 1  ████ 12 words  │
│   4×4  BOARD     │  Player 2  ███  8 words   │  ← sidebar
│   (very large)   │  Player 3  █    3 words   │
│                  │                           │
├──────────────────┴──────────────────────────┤
│  ⏱  02:14   [live activity feed]            │  ← footer
└─────────────────────────────────────────────┘
```
- Board tiles shown large but not interactive
- Word counts shown (not the actual words — preserves competition)
- Timer countdown prominent
- During scoring/results: overlay showing final word lists and scores with animations

---

## Step 14: Multi-Round Flow
- `H.roundsTarget` (3/5/10 set in lobby)
- `H.currentRound` increments each round
- `H.players[].totalScore` accumulates
- After final round: phase → `'gameover'`, winner announced, confetti, same trophy animation as pit.html

---

## Step 15: Host State Object (H) and Broadcast (D)
```js
H = {
  players: [{id, name, words:[], roundScore:0, totalScore:0}],
  phase: 'lobby',      // lobby|playing|scoring|results|gameover
  board: [],           // 16 letters, flat array
  timeLeft: 180,
  roundsTarget: 5,
  currentRound: 0,
  roundResults: null,  // set after scoring
  winner: null,
}
```
Host strips `words` from other players before broadcasting to guests (they only see their own words + others' word counts).

---

## Suggested Build Order

| # | Step | Description |
|---|------|-------------|
| 1 | HTML Shell + CSS | Foundation — design system, layout, fonts |
| 2 | Home Screen | Role selection UI |
| 3 | PeerJS Connection | Networking before game logic |
| 4 | Lobby Screens | Validates P2P before adding game logic |
| 5 | Board Generation | Dice constants, shuffle, roll |
| 6 | Board CSS | 4×4 grid, tile states |
| 7 | Tap-to-Chain | Most complex UI piece |
| 8 | Timer | Host-authoritative countdown |
| 9 | Word Collection | End-of-round gathering |
| 10 | Scoring Logic | Dedup + points |
| 11 | Dictionary | Optional enhancement |
| 12 | Results Screen | Round recap UI |
| 13 | Viewer TV Layout | Depends on stable state |
| 14 | Multi-round + Game Over | Polish |
