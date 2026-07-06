# pit.html — Implementation Plan (Party do-over)

The Hasbro trading-pit classic rebuilt on the **boggleparty** architecture: phones are
controllers, a TV (viewer mode) is the shared trading floor, players shout-trade card bundles
in real time and race to ring the bell on a cornered market. Single self-contained HTML file,
PeerJS P2P (one host, N guests, optional viewers), host-authoritative state.

---

## What's different from the old pit.html

| Feature | old pit.html (liarsdice pattern) | new pit.html (boggleparty pattern) |
|---|---|---|
| Joining | Type a 6-char room code | **QR code** on lobby + TV (`?room=XXXX` auto-fill), 4-letter code, peer ID `PITPARTY-XXXX` |
| Hosting | Phone hosts only | Phone-first **or TV-first** — the TV creates the room and the first phone in becomes 👑 **Captain** (settings, start, next round) |
| Reconnect | None | Zombie-slot reuse by name; viewer retry-once |
| TV | Plain scoreboard | **Trading-floor show**: live offer pills, trade feed, scrolling commodity ticker tape, bell overlay on corners, podium + confetti |
| Players | 3–7 | **2–8** (2-player allowed for testing/duos; suits scale with player count) |
| Look | Liar's-dice dark theme | **Stock-exchange neon**: dark board, LED ticker, gold bell, commodity-coloured cards |
| Feedback | Silent | Synth sounds (opening bell, trade chime, corner bell, bear buzz) + phone haptics |

Core Pit rules are unchanged from the old implementation (they were right).

---

## Game rules (kept)

- Suits in play = player count (clamped 2–8); 9 cards per suit, dealt evenly → 9 cards each
- Commodities: Wheat 100 · Coffee 90 · Barley 85 · Corn 75 · Rye 70 · Oats 60 · Hay 50 · Flax 40
- **Trading**: offer a bundle of 1–4 cards of ONE commodity (Bull/Bear may be mixed in);
  the host instantly matches any two players whose bundle **counts** are equal and swaps them blind
- **Corner** = 9 of one suit in hand → ring the bell → score the suit's points
- **Bull/Bear option**: deck += Bull + Bear (two players get 10 cards).
  8 of a suit + Bull = Bull Corner (full points); 9 + Bull = **Double Bull** (×2 points).
  When a corner is rung, every *other* player caught holding Bull or Bear loses 20 per card
- Rounds repeat until someone reaches the win score (300 / 500 / 750) → podium

---

## Networking (same pattern as boggleparty)

- PeerJS 1.5.4, host peer ID `PITPARTY-XXXX` (4 chars, no I/O)
- `guestConns{}` / `viewerConns{}` on host; `hostConn` on guest/viewer
- Reconnect zombie-slot reuse; viewer retry-once logic

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` | Enter lobby (player colour auto-assigned) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'offer', cards:[names]}` | Shout a bundle (replaces any pending offer) |
| Guest→Host | `{type:'cancel_offer'}` | Stop shouting |
| Guest→Host | `{type:'corner'}` | Ring the bell (host re-validates) |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host driver: `set` / `start` / `next` / `again` |
| Host→Guest | `{type:'lobby', …}` | Lobby sync (players, settings, captain) |
| Host→Guest | `{type:'state', …}` | Personalised: my hand, my offer, `canCorner`, players summary, feed |
| Host→Guest | `{type:'traded', with, count}` | Both parties: chime + haptic + hand flash |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', …}` | TV state incl. live `feed` |

---

## Game flow

1. **Lobby** — QR + room code; settings (host or 👑 Captain): Bull/Bear on/off, win score 300/500/750
2. **Opening bell** — 3-2-1 countdown overlay, bell rings, cards dealt, phase `trading`
3. **Trading** — tap cards of one commodity (plus Bull/Bear) → big **“📢 SHOUT 3!”** button;
   host matches equal counts instantly and swaps blind; TV shows offer pills, trade feed,
   ticker tape; no timer — Pit is pure frenzy
4. **Corner** — `canCorner` computed host-side per state change → pulsing **🔔 CORNER!** button;
   on ring: bell overlay on TV + phones, points awarded, Bull/Bear penalties listed,
   leaderboard update; host/captain taps **Next round** (re-deal) unless…
5. **Game over** — first to the win score → podium + confetti + fun stats
   (most trades, biggest single swap, corners rung)

### Scoring
Corner = commodity points (Double Bull ×2) · Bear/Bull caught in another's corner = −20 each ·
scores persist across rounds until the win target

---

## Rendering notes

- **Never interrupt a selection**: during `trading`, `state` messages **patch** the DOM
  (scores strip, offer pills, feed, corner button) instead of re-rendering; the hand grid
  re-renders only when my cards actually changed (trade), which also clears the selection
- Hand: cards sorted by commodity, 3-col grid of coloured cards (big letter, name, pts);
  tap toggles selection — only one commodity selectable at a time, Bull/Bear always mixable,
  max 4 cards
- TV trading floor: player cards with live offer pills (“3!”), centre trade feed
  (“Ann ⇄ Bob — 3 cards”), scrolling ticker tape of the active commodities along the bottom,
  trade counter; corner rings a full-screen bell overlay
- QR via `qrcode-generator` (CDN) themed inline SVG; `?room=XXXX` pre-fills the join card
- Sounds are Web Audio synth only (no assets): opening bell, trade chime, corner bell
  (detuned partials with long decay), bear penalty buzz; `navigator.vibrate` on trades/corners

## Verification
1. `python3 -m http.server 8231` → open `/pit.html` in 4+ tabs (host, 2 guests, TV)
2. Phone-first and TV-first (captain gets settings/start; crown passes if captain leaves)
3. Trade through the real network path: two phones shout equal counts → blind swap, feed on TV
4. Force hands via `page.evaluate` on the host: 9-of-a-suit corner, Bull corner, Double Bull,
   Bear penalty — verify points and overlays
5. Win score reached → podium + stats; Play again returns everyone to the lobby
6. Playwright suite `tests/pit.e2e.spec.js` covers the above with a screenshot tour (`pit-*.png`)
