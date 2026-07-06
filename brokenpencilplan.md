# brokenpencil.html — Implementation Plan

**Broken Pencil** — the telephone game in drawings (public-domain parlour lineage: *Eat Poop
You Cat*; same family as Gartic Phone / Telestrations, original name and words). Everyone
writes a silly prompt, the next player draws it, the next describes the drawing, and so on —
then the TV replays every mangled chain to the room. Architecture mirrors `familytrivia.html`
/ `pit.html`: single self-contained HTML file, PeerJS P2P (one host, N guests, optional
viewers), host-authoritative state.

---

## What it borrows / what's new

| Feature | Same as familytrivia/pit | New here |
|---|---|---|
| Networking | PeerJS `BRKPNCL-XXXX`, QR join, zombie reconnect, viewer retry | — |
| Hosting | Phone-first or TV-first with 👑 Captain (first phone in) | Captain also drives the reveal theatre beat by beat |
| Input | — | **Phone drawing canvas**: pointer events, 6 pens + eraser + undo + clear; strokes stored as compact vector polylines (logical 1000×750) so the TV can replay them stroke-by-stroke |
| Phases | lobby → … → podium | **work** (simultaneous write/draw/describe steps) → **reveal** (chain theatre) → **vote** (funniest beat) per chain |
| Secrecy | answers hidden until reveal | Whole drawings/descriptions stay secret until the theatre — nothing streams live |
| Reactions | — | 😂 **LOL button** during the reveal fires an emoji burst on the TV (rate-limited 1/2 s), credited to the beat's author |

---

## Game flow

1. **Lobby** — QR + code; settings (host/captain): pace Brisk / Relaxed (×1.5). 3–10 players
   (a hidden `shortCircuit` flag allows 2, used by the E2E tests).
2. **Write** (step 0, 45 s) — everyone types a starter prompt, or taps 🎲 for one of ~60
   embedded sillies ("a dragon doing the washing up").
3. **Draw / Describe** (steps 1…min(N,6)−1, 90 s / 45 s) — chains rotate: at step *s*, seat *i*
   works on chain *(i+s) mod N*, so you never meet the same chain twice. Draw what the text
   says; describe what the drawing shows. Phones auto-submit whatever is on the canvas/input
   when the timer dies (blank text → "…no words…"); the host fills placeholders 2.5 s later
   for anyone missing. TV shows a progress wall ("✏️ Jess is scribbling… ✅ Ben is done").
4. **Reveal theatre** (the whole point) — chain by chain: prompt appears, each drawing replays
   stroke-by-stroke, each description types out. Captain/host taps **Next ▶** per beat.
   Phones show "👀 Watch the TV" + the 😂 button.
5. **Vote** — after each chain, everyone votes for its funniest beat (not your own);
   most-voted beat's author **+100** (ties: all winners score). Result flashes on the TV.
6. **Podium** — scores, confetti, 😂 **Comedy Gold** award (most LOLs received).
   Play Again returns to the lobby.

### Message protocol (beyond the shared lobby/ctl/viewer_* pattern)

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'submit', step, text?/strokes?}` | Hand in the current step's work (early or on timeout) |
| Guest→Host | `{type:'lol'}` | 😂 during reveal (host rate-limits, credits beat author) |
| Guest→Host | `{type:'vote', beat}` | Funniest-beat vote for the current chain |
| Host→Guest | `{type:'work', step, kind, input, seconds, progress…}` | Your assignment (received text to draw / strokes to describe) — sent **only on step change** |
| Host→Guest | `{type:'progress', progress}` | Done-wall patch — never re-renders a phone mid-drawing |
| Host→Guest | `{type:'reveal'/'vote'/'voted'/'podium', …}` | Theatre position / vote options / result / final |
| Host→Viewer | `{type:'viewer_work'/'viewer_reveal'/'viewer_vote'/'viewer_voted'/'viewer_podium'/'viewer_lol', …}` | TV show (reveal carries the chain's beats incl. stroke lists) |

---

## Rendering notes

- **Never interrupt a drawing**: during `work`, submissions from others arrive as `progress`
  patches (`#w-progress`, TV wall) — the phone canvas re-renders only on step change
- Canvas: logical 1000×750 coords scaled to the element × devicePixelRatio; strokes
  `{c: penIndex|-1 eraser, p:[x,y,x,y,…]}`, points thinned to ≥4 logical units apart;
  undo pops a stroke, redraw is a full repaint (cheap at phone stroke counts)
- TV replay: rAF animation over ~2.2 s drawing the stroke list fraction-by-fraction;
  text beats use the familytrivia typewriter; `prefers-reduced-motion` renders instantly
- Chain history sits beside the stage as mini-canvas thumbnails re-rendered after each beat
- LOL burst: emoji divs float up the TV (CSS animation), spawned per rate-limited `lol`
- No transform animations on clickable controls (Playwright stability — pit lesson)

## Verification
`tests/brokenpencil.e2e.spec.js` (screenshots `pencil-*.png`): TV-first with 3 phones —
captain settings, full write→draw→describe round with real mouse-drawn strokes, reveal
theatre + 😂 + vote through the network, fast-forward to podium, Play Again; phone-first +
TV viewer in 2-player short-circuit mode. Static server on 8231; PeerJS broker required.
