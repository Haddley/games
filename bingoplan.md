# bingo.html — Implementation Plan (Full House Bingo)

UK-style 90-ball bingo for the phone+TV platform: the TV is the caller — ball machine,
nickname calls, giant flashboard — and phones hold tap-to-daub tickets with a big BINGO!
button. Zero skill floor: a 5-year-old and a 95-year-old can play the same game.
Architecture mirrors `familytrivia.html` / `pit.html`: single self-contained HTML file,
PeerJS P2P (one host, N guests, optional viewers), host-authoritative state.

---

## What makes it ours

| Feature | Detail |
|---|---|
| Joining | QR on lobby + TV (`?room=XXXX` auto-fill), 4-letter code, peer ID `BINGO-XXXX` |
| Hosting | Phone-first, or **TV-first** with 👑 Captain (first phone in) driving start/pause via `ctl` |
| Tickets | Classic 9×3: each row 5 numbers + 4 blanks, columns hold decades (1–9 … 80–90), generated per player each game |
| Daubing | **Tap-to-daub — spotting the number is the game.** Per-player 🧒 auto-daub toggle (client-side, persisted) for little kids |
| Claims | BINGO! button pauses the caller; the **host verifies** — only daubed **and** called numbers count. False call = gentle "ooh, no!" + button locked for 3 balls |
| Prizes | LINE first (any full row), then FULL HOUSE; jumping straight to house claims both if line unclaimed. Session tally: line +1, house +3 |
| Caller | Auto-call every 4/6/9 s (setting), Pause/Resume for captain/host, ~30 traditional family-friendly nickname calls ("Two little ducks, 22!") with sensible fallbacks |
| Show | Ball-machine animation, giant ball with nickname, 90-number flashboard lighting up, last-5 strip, win klaxon + confetti, results screen with balls-taken stats |

---

## Networking (same pattern as familytrivia/pit)

- PeerJS 1.5.4, host peer ID `BINGO-XXXX`; `guestConns{}` / `viewerConns{}`; zombie-slot
  reconnect by name; viewer retry-once

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` | Enter lobby |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'bingo', daubs:[numbers]}` | Claim — host validates against ticket ∩ called |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host: `start` / `pause` / `resume` / `again` / `set` |
| Host→Guest | `{type:'lobby'/'state', …}` | State incl. `myTicket`, full `called` list (for auto-daub), `prizes`, `lastEvent`, lock status |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', …}` | TV flashboard state |

## Game flow

1. **Lobby** — QR + code; setting: call speed 4/6/9 s
2. **Eyes down** — tickets dealt, caller starts; TV: drumroll → ball pops with nickname,
   flashboard cell lights, last-5 strip updates. Phones: ticket + BINGO button + small
   last-balls strip (so nobody has to crane at the TV)
3. **Claim** — caller pauses ~4 s while the host rules: LINE / FULL HOUSE / false call
   (lock for 3 balls). TV plays the moment big either way
4. **Full house** → **Results** — who won what and in how many balls, session tally,
   🔁 New game (captain/host) deals fresh tickets and keeps the tally

## Rendering notes

- The caller ticks but **never interrupts a mid-tap daub**: the game screen renders once
  per game; per-ball updates patch by id (ball zone, flashboard cell, strips, BINGO button
  cooldown, prize/event banners)
- Ticket generation: column counts 1–3 summing 15, greedy row assignment (retry loop on the
  rare infeasible draw), numbers sorted within columns — a proper classic ticket
- No transform animations on clickables (Playwright stability + fewer mis-taps)
- Sounds are WebAudio synth: drum tick, ball pop, win klaxon, false-call buzz

## Verification
`tests/bingo.e2e.spec.js` — real PeerJS flows, screenshots `bingo-*.png`:
1. TV-first: captain lobby → eyes down → forced deterministic call order (evaluate on host)
   → tap-daub a row → BINGO → LINE on TV; false call locks the other phone's button;
   full house → results + tally; New game deals fresh tickets
2. Phone-first + TV viewer: flashboard lights match forced calls; auto-daub toggle marks a
   called number by itself
