# boggleparty.html — Implementation Plan

Inspired by Netflix **Boggle Party**: phones are controllers, a TV (viewer mode) is the shared
scoreboard, 1–8 players race to swipe words, and players sabotage each other with pranks.
Architecture mirrors `boggle.html` / `pit.html`: single self-contained HTML file, PeerJS P2P
(one host, N guests, optional viewers), host-authoritative state.

---

## What's different from boggle.html

| Feature | boggle.html | boggleparty.html |
|---|---|---|
| Input | Tap-to-chain + Submit button | **Swipe-to-trace** with glowing trail (tap mode still works) |
| Scoring | At end of round (words collected then judged) | **Live** — every word validated by host instantly, points fly |
| Duplicates | Cancel each other (classic rules) | Score base points; **unique words earn a ×2 bonus** at round end |
| Sabotage | — | **Pranks**: 🦑 Ink Splat, 🌀 Dizzy, 🧊 Freeze — earn a token every 3 words |
| Joining | Type room code | **QR code** on host lobby + TV screen (`?room=XXXX` auto-fill) |
| Board | 4×4 | 4×4 or **5×5 (Big Boggle)** lobby option |
| Players | 2+ | **1–8** (solo allowed, Netflix daily-puzzle style) |
| Look | Amber/red dark theme | **Neon party**: animated aurora background, floating letters, 3D dice tiles, particle bursts, fireworks |

---

## Networking (same pattern as boggle.html)

- PeerJS 1.5.4, host peer ID `BGPARTY-XXXX` (4 chars, no I/O)
- `guestConns{}` / `viewerConns{}` on host; `hostConn` on guest/viewer
- Reconnect zombie-slot reuse; viewer retry-once logic

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` | Enter lobby |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'word', word}` | Live word submission |
| Guest→Host | `{type:'prank', kind, target}` | Spend a prank token |
| Host→Guest | `{type:'lobby', …}` | Lobby sync |
| Host→Guest | `{type:'state', …}` | Per-player game state (1 s tick + on change; includes `myTokens`, `myMeter`) |
| Host→Guest | `{type:'word_result', word, ok, pts, reason, tokens, meter}` | Instant verdict |
| Host→Guest | `{type:'pranked', kind, from}` | Victim plays the prank effect |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', …}` | TV state (includes live `feed` events) |

---

## Game flow

1. **Lobby** — host sees QR + room code; settings: board 4×4/5×5, timer 60/90/120 s, rounds 1/3/5
2. **Countdown** — 3-2-1-GO overlay client-side; host starts the timer 3 s after broadcast
3. **Playing** — swipe words; host validates against ENABLE dictionary (fetched at host time);
   valid → points pop + particle burst; every 3rd valid word → prank token
4. **Results** — host doubles points for words only one player found (unique ×2), leaderboard,
   per-player word reveal with UNIQUE badges
5. Repeat for N rounds → **Game over** — podium + canvas fireworks

### Scoring
3 letters = 100 · 4 = 150 · 5 = 250 · 6 = 400 · 7 = 600 · 8+ = 1000 · unique word = ×2 (end of round)

### Pranks (visual sabotage, 4–6 s, relayed via host)
- **🦑 Ink Splat** — black blobs splatter over the victim's board and slowly fade
- **🌀 Dizzy** — victim's board wobbles and spins (input still works — good luck)
- **🧊 Freeze** — frost overlay, tiles locked for 4 s

---

## Rendering notes

- Swipe uses pointer events + `document.elementFromPoint` with a centre-distance threshold
  (0.4 × tile size) so diagonals don't clip corners; touching the previous tile rewinds the path
- Trail drawn on an SVG overlay (gradient stroke + gaussian-blur glow) positioned over the grid
- Per-second timer ticks **patch** the DOM (timer ring, score strip) instead of re-rendering,
  so a swipe in progress is never interrupted
- QR generated with `qrcode-generator` (CDN) rendered as themed inline SVG;
  page reads `?room=XXXX` on load to pre-fill the join card
- TV layout: giant board left, animated leaderboard bars right, live activity feed +
  timer bar bottom; results/podium overlays with fireworks

## Verification
1. `npm run dev` → open `/games/boggleparty.html` in 3+ tabs (host, guest, viewer)
2. Swipe + tap words on phone-sized viewport; verify instant verdicts and score popups
3. Earn a prank token (3 valid words) and hit an opponent — verify effect + feed on TV
4. Finish a round — verify unique ×2 bonuses; finish game — podium + fireworks
5. Scan the lobby QR with a phone on the same origin — join card pre-filled
