# doodleparty.html — Implementation Plan

Draw on your phone, guess on the TV. One player sketches a secret word on their phone and the
drawing appears stroke-by-stroke on the big screen; everyone else races to type the guess first.
Generic draw-and-guess parlour mechanic (skribbl.io / Pictionary lineage), original name.
Architecture mirrors `familytrivia.html` / `pit.html`: single self-contained HTML file,
PeerJS P2P (one host, N guests, optional viewers), host-authoritative state.

---

## What makes it fit the platform

| Feature | doodleparty.html |
|---|---|
| Joining | **QR code** on lobby + TV (`?room=XXXX` auto-fill), peer ID `DOODLE-XXXX` |
| Hosting | Phone-first, or **TV-first** — first phone in becomes 👑 **Captain** (settings, next-turn) |
| Secret info | The word lives on the drawer's phone; the TV shows only the masked word + live canvas |
| TV | Big progressive canvas, masked word with timed letter hints, countdown bar, guess feed, score rail |
| Players | **2–12** (2 allowed for testing; 3+ recommended) |
| Look | Crayon party: dark indigo board, white paper canvas, rainbow accents |
| Feedback | Synth sounds (ding on correct, tick on hints) + haptics; confetti podium |

---

## Networking (same pattern as boggleparty)

- PeerJS 1.5.4, host peer ID `DOODLE-XXXX`; zombie-slot reconnect; viewer retry-once
- Strokes are **normalized 0–1 coordinates** so phone, host and TV canvases can differ in size

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` / `{type:'join_viewer'}` | Enter lobby / TV mode |
| Drawer→Host | `{type:'pick', word}` | Choose one of 3 secret words |
| Drawer→Host | `{type:'stroke', sid, color, size, pts:[[x,y]…], done}` | Streamed every ~120 ms while drawing |
| Drawer→Host | `{type:'undo'}` / `{type:'clear'}` | Canvas edits (host pops canonical strokes) |
| Guesser→Host | `{type:'guess', text}` | Guess attempt |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host driver: `set`/`start`/`next`/`again` |
| Host→Guest | `{type:'lobby'…}` / `{type:'pick', choices}` / `{type:'wait_pick'}` | Lobby / word choice / waiting card |
| Host→Guest | `{type:'draw_start', role, word?, masked, seconds, strokes}` | Turn start (drawer gets the word, guessers the mask; strokes for rejoiners) |
| Host→All | `{type:'stroke'/'undo'/'clear'}` | Canvas relay (guessers + viewers mirror) |
| Host→All | `{type:'hint', masked}` | Letter reveals at 50% / 75% time |
| Host→All | `{type:'feedev', ev, guessedCount, guessTotal}` | Live guess feed (correct = hidden text) |
| Host→Guesser | `{type:'guess_result', correct?, close?}` | Private verdict / “so close!” nudge |
| Host→Guest | `{type:'turn_end', word, results, standings, isLast}` | Reveal + scores (auto-advances in 6 s) |
| Host→Viewer | `viewer_lobby / viewer_pick / viewer_draw / viewer_turnend / viewer_podium` | TV show |

---

## Game flow

1. **Lobby** — QR + code; settings (host or 👑 Captain): cycles 1/2/3, draw time 60/90 s
2. **Pick** — drawer's phone shows 3 unused words (2 easy + 1 medium); 15 s auto-pick;
   TV: “🎨 Karen is choosing a word…”
3. **Draw** — drawer's phone becomes a full-screen canvas (6 colours, eraser, undo, clear);
   strokes stream through the host to the TV and to guessers' mini-preview; guessers type;
   near-misses get a private “so close!”; correct guesses hide the word in the feed
4. **Turn end** — everyone guessed or time up → TV reveals the word + turn scores;
   captain/host taps next (or auto after 6 s)
5. Every player draws once per cycle → **Podium** + confetti + awards:
   🖌️ **Picasso** (most drawer points), 🐕 **Bloodhound** (fastest average correct guess)

### Scoring
Guessers by order of correct guess: 100 / 80 / 60 / 50 / 40 … + time bonus (up to +20).
Drawer: +30 per correct guesser, capped at +150 per turn.

---

## Rendering notes

- The canvas is **imperative** — during the draw phase, incoming messages patch the DOM
  (feed, masked word, guessed counter, timer) and paint segments onto the existing `<canvas>`;
  the screen never re-renders mid-stroke or mid-typing
- Stroke streaming: drawer batches pointer points every ~120 ms under a stroke id (`sid`);
  receivers append segments to the matching stroke; undo/clear trigger a full redraw from the
  canonical stroke list (host keeps it; `draw_start` carries it for late joiners)
- Masked word recomputed host-side only — the plain word never reaches guessers or the TV
  until `turn_end`
- QR via `qrcode-generator` themed SVG; `?room=XXXX` pre-fills the join card
- Sounds are WebAudio synth only; `prefers-reduced-motion` disables confetti/animations

## Verification
1. Static server on :8231 → open `/doodleparty.html` in 4+ tabs (host, guests, TV)
2. TV-first (captain settings + start) and phone-first (TV joins by code) both work
3. Draw on a phone-sized viewport — strokes appear on the TV; undo/clear mirror everywhere
4. Wrong guess shows in the feed; near-miss nudges privately; correct guess scores by order,
   ends the turn early when everyone has it
5. Full cycle → podium + awards; Play again returns to the lobby
6. Playwright suite `tests/doodleparty.e2e.spec.js` covers both modes with a `doodle-*` screenshot tour
