# Plan: Pit Card Game — `public/games/pit.html`

## Context
Build a multiplayer browser implementation of the Hasbro card game Pit, playable on smartphones via a shared URL. Architecture must match `liarsdice.html` exactly: single self-contained HTML file, PeerJS P2P networking (one host, N guests, optional viewers), same dark design system.

**Key rules (from official PDF):**
- 3–7 players; suits in play = player count (3 suits for 3 players … 7 for 7)
- 9 cards per player per suit; with Bull/Bear: deck += 2, some players get 10
- Trading: simultaneous, players shout "N! N! N!" and swap equal-count bundles (same suit, 1–4 cards; Bear may be mixed in)
- Corner = 9 of one suit in hand → ring bell → score points
- Bull Corner = 8 of suit + Bull; Double Bull = 9 of suit + Bull (double points)
- Bear penalty: -20 pts to holder when corner called (+additional -20 if also holding Bull)
- Win = first to reach target score (default 500)
- Point values: Wheat 100, Barley 85, Corn 75, Rye 70, Oats 60, Hay 50, Flax 40

---

## Critical files
| File | Role |
|------|------|
| `public/games/liarsdice.html` | Source pattern for all architecture |
| `public/games/pit.html` | **New file to create** |

---

## Architecture (mirror liarsdice.html exactly)

### Networking
- PeerJS 1.5.4 (same CDN)
- Host peer ID = 6-char room code (no i/l/o chars)
- `guestConns {}` — host→guest connections
- `viewerConns {}` — host→viewer connections
- Viewer sends `{type:'join_viewer'}` on connect
- Host broadcasts `{type:'state', display}` to each guest (personalised)
- Host broadcasts `{type:'viewer_state', vd}` to viewers
- Lobby: `{type:'lobby', players, roomCode, settings}`

### Host state `H`
```js
{
  players: [{id, name, hand:[], offer:null, score:0}],
  phase: 'lobby'|'trading'|'corner'|'gameover',
  activeCommodities: [],   // subset chosen by player count
  useBullBear: false,
  winScore: 500,
  lastCorner: null,        // {playerName, commodity, points, type}
  winner: null,
  tradeCount: 0,
  tradeEvents: [],         // last 5 [{nameA,nameB,count}]
}
```

### Player display `D` (sent per-player from host)
```js
{
  hand: [],          // sorted by commodity order
  offer: null,       // {count, cards} if pending
  score: 0,
  canCorner: bool,
  cornerCommodity, cornerPoints, cornerType,
  phase, isHostPlayer,
  players: [{name, score, cardCount, offerCount, isYou}],
  lastCorner, winner, activeCommodities,
  useBullBear, winScore, tradeCount, roomCode,
}
```

### Viewer display `vD`
```js
{
  phase, players: [{name, score, cardCount, offerCount}],
  lastCorner, winner, tradeCount, tradeEvents, roomCode,
}
```

---

## Commodities
```js
const COMMODITIES = [
  {name:'Wheat',  pts:100, bg:'#b45309', fg:'#fef3c7'},
  {name:'Barley', pts:85,  bg:'#1d4ed8', fg:'#dbeafe'},
  {name:'Corn',   pts:75,  bg:'#ca8a04', fg:'#fef9c3'},
  {name:'Rye',    pts:70,  bg:'#7e22ce', fg:'#f3e8ff'},
  {name:'Oats',   pts:60,  bg:'#15803d', fg:'#dcfce7'},
  {name:'Hay',    pts:50,  bg:'#4d7c0f', fg:'#ecfccb'},
  {name:'Flax',   pts:40,  bg:'#155e75', fg:'#cffafe'},
];
// Specials
// Bull: {bg:'#991b1b', fg:'#fee2e2'}
// Bear: {bg:'#374151', fg:'#f3f4f6'}

// Suits by player count
// COMM_BY_COUNT = {3:['Wheat','Corn','Oats'], 4:[...+'Rye'],
//   5:[...+'Hay'], 6:[...+'Barley'], 7:[...+'Flax']}
```

---

## Game Logic

### Deal
- Build deck: activeCommodities × 9 cards + optionally Bull + Bear
- Shuffle (Fisher-Yates)
- Deal round-robin; some players may get 10 cards with Bull/Bear

### Trade flow (host)
1. Player selects 1–4 cards (same suit; Bear may mix) → sends `{type:'offer', cards:[]}`
2. `hostOffer(fromId, cards)` validates cards are in hand and same suit
3. Stores `player.offer = {count, cards}`
4. Checks `H.players` for any other player with `offer.count === cards.length`
5. **Match found → `executeTrade(playerA, playerB)`**:
   - Remove A's offered cards from A's hand, add B's offered cards
   - Remove B's offered cards from B's hand, add A's offered cards
   - Clear both offers; `H.tradeCount++`; record `tradeEvent`
   - `hostBroadcast(false)`
6. No match → `hostBroadcast(false)` (show pending offer to all)

### Corner claim (manual — player taps button)
- `hostCorner(fromId)` runs `checkCorner(player)`
- `checkCorner`: scan hand for 9 of any suit → standard; 8+Bull → bull; 9+Bull → double_bull
- `announceCorner(player, corner)`:
  - Add points to player
  - Apply Bear/Bull+Bear penalties to other holders
  - Set `H.phase = 'corner'`, `H.lastCorner`
  - Check if `player.score >= H.winScore` → set winner, phase='gameover'
  - Clear all offers
  - `hostBroadcast(false)`
- `canCorner` flag computed in `buildDisplay()` so UI shows pulsing button

### Next round (host player only)
- Re-deal; reset `offer`, `tradeCount`, `tradeEvents`; phase = 'trading'
- `hostBroadcast(true)` (new round)

---

## UI Screens

| Screen | Who sees it |
|--------|-------------|
| `home` | Everyone on load |
| `creating` / `connecting` | Spinner while PeerJS connects |
| `lobby_h` | Host player |
| `lobby_g` | Guest players |
| `game` | All players (trading + corner sub-states) |
| `gameover` | All players |
| `viewer` | Viewer devices |

### Lobby host settings
- Bull/Bear toggle (same as `fWild` in liarsdice)
- Win score selector: 300 / 500 / 750 pts

### Game screen (trading phase)
```
[Scores bar — all players horizontal]
[Trading Floor — active offer pills: "Alice: 3!" "You: 3!" ...]
[Your Hand — 3-column card grid, tap to select]
[Selection info: "3 × WHEAT selected"]
[OFFER 3 CARDS button  |  CANCEL OFFER button]
[CORNER! button — pulsing green, shown only when canCorner]
```

### Corner phase overlay
```
🔔 CORNER!
ALICE corners WHEAT
+100 pts  (total: 275)
[Scores updated]
[Next Round button — host only]
```

### Card design (inline-styled commodity cards)
```
┌─────────────┐
│      W      │  ← large first letter
│   WHEAT     │  ← commodity name
│   100 pts   │  ← point value
└─────────────┘
colored bg + white/light fg, 3-column grid in hand
tap = select (highlights white border), same-suit only
```

---

## Viewer (TV) Layout

Header: title + room code + fullscreen button (same as liarsdice)

**Lobby state:** Room code large center, player list chips

**Trading state:**
- Top: player row (name, score, card count, offer indicator)
- Center: "TRADING FLOOR" — offer pills per player + trade count
- Bottom bar: recent trade events feed

**Corner overlay:** Full-screen "CORNER! — [Name] corners [COMMODITY] — +N pts"
with score leaderboard animation

**Gameover overlay:** Winner + final rankings (same style as liarsdice)

---

## CSS additions (on top of liarsdice design system)
- `.hand-grid` — 3-col grid for cards
- `.card-item` + `.selected` + `.offered` — commodity card states
- `.trading-floor` + `.offer-pill` + `.offer-pill.mine`
- `.scoreboard` + `.score-row` + `.score-bar`
- `.btn-corner` — pulsing green corner button
- `.corner-banner` — corner phase announcement
- All viewer CSS reused/adapted from liarsdice patterns

## Audio
- Web Audio API bell sound when corner is claimed (synthesised, no asset files needed)

---

## Message Protocol Summary
| Sender | Message | Purpose |
|--------|---------|---------|
| Guest→Host | `{type:'join', name}` | Enter lobby |
| Guest→Host | `{type:'join_viewer'}` | Viewer mode |
| Guest→Host | `{type:'offer', cards:[]}` | Submit/replace offer |
| Guest→Host | `{type:'cancel_offer'}` | Cancel pending offer |
| Guest→Host | `{type:'corner'}` | Claim corner |
| Guest→Host | `{type:'next_round'}` | Start next round |
| Guest→Host | `{type:'restart'}` | Return to lobby |
| Host→Guest | `{type:'lobby', ...}` | Lobby sync |
| Host→Guest | `{type:'state', display}` | Per-player game state |
| Host→Viewer | `{type:'viewer_lobby', ...}` | Lobby for viewer |
| Host→Viewer | `{type:'viewer_state', vd}` | Viewer game state |

---

## Verification
1. `npm run dev` → open `/games/pit.html` in browser
2. Open 3+ browser tabs, create game in one, join with others using room code
3. Verify: cards dealt correctly per player count, trading matches by count, corner detection accurate, scores update, Bull/Bear penalties apply, viewer mode fills screen correctly on a wide window, fullscreen works
4. Test edge cases: player with Bear when corner called; Double Bull corner; player count 3 vs 7
