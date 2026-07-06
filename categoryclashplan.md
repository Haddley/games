# categoryclash.html — Implementation Plan

**Category Clash** — the letter race. The public-domain parlour game *Guggenheim* (the ancestor of
Scattergories), rebuilt on the **boggleparty/familytrivia** architecture: a letter and 8 categories
on the TV, everyone races to type answers on their phones, then the TV judges category by category —
duplicates CLASH and score nothing, unique answers score. Single self-contained HTML file,
PeerJS P2P (one host, N guests, optional viewers), host-authoritative state.

---

## What makes it ours

| Feature | Notes |
|---|---|
| Joining | QR on lobby + TV (`?room=XXXX` auto-fill), 4-letter code, peer ID `CATCLASH-XXXX` |
| Hosting | Phone-first **or TV-first** — first phone in becomes 👑 **Captain** (settings, start, judging gavel) |
| Judging | The classic Scattergories argument, digitized: captain/host gets a per-answer 👎 veto toggle during the reveal |
| Scoring | Unique valid answer **+10** · every-word-starts-with-the-letter bonus (min 2 words) **+5** · duplicates **CLASH!** and score 0 |
| Look | Quiz-show indigo: electric-yellow letter tiles, cyan categories, pink CLASH zaps |
| Players | 2–12 |

---

## Networking (same pattern as boggleparty)

- PeerJS 1.5.4, host peer ID `CATCLASH-XXXX` (4 chars, no I/O)
- `guestConns{}` / `viewerConns{}` on host; `hostConn` on guest/viewer
- Reconnect zombie-slot reuse; viewer retry-once logic

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` | Enter lobby (colour auto-assigned) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'answers', round, answers[8]}` | Debounced autosave sync while typing |
| Guest→Host | `{type:'done', round, answers[8]}` | Final flush + early-finish flag |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host driver: `set` / `start` / `veto` / `nextcat` / `again` |
| Host→Guest | `{type:'lobby', …}` | Lobby sync (players, settings, captain) |
| Host→Guest | `{type:'race', round, letter, categories, seconds}` | Race phase (client renders inputs ONCE; timer ticks patch by id) |
| Host→Guest | `{type:'judge', catIndex, category, entries, players, …}` | Judging state, re-sent on every veto toggle |
| Host→Guest | `{type:'podium', standings, awards}` | Game over |
| Host→Viewer | `viewer_lobby / viewer_race / viewer_judge / viewer_podium` | TV variants; race progress (answers filled per player — never the words) patches live |

---

## Game flow

1. **Lobby** — QR + room code; settings (host or 👑 Captain): rounds 2/3/5, timer 60/90/120 s
2. **RACE** — TV shows the giant letter, the 8 categories, a countdown bar, and per-player
   progress chips ("5/8 ✓") — never the words. Phones show 8 labelled text boxes; answers
   autosave (debounced ~500 ms) so a dead battery loses nothing; **DONE** finishes early —
   all done → judging starts immediately
3. **JUDGING** — category by category on the TV: all answers flip face-up;
   host validates starts-with-letter (case/accent-insensitive, leading "the " ignored);
   duplicates strike through with a **CLASH!** zap; unique valid answers +10; alliteration +5;
   captain/host can 👎 veto any answer (toggle, recomputes clashes live), then **Next category**;
   the leaderboard rail pops with each commit
4. Repeat for N rounds (letters never repeat) → **Podium** — confetti + awards:
   🖋️ **Wordsmith** (most unique answers), 💥 **Clash Magnet** (most duplicates)

### Content
~60 embedded family-friendly categories; each round draws 8 unseen ones + a letter from
A–Y excluding Q/X/Z.

---

## Rendering notes

- **Never blow away the inputs**: the race screen renders once per round; per-second timer
  ticks patch `#race-timebar` / `#race-timenum` only; other players' progress is TV-only,
  so a phone mid-word is never interrupted
- Judging is fully re-rendered per veto/next (no text entry in that phase)
- QR via `qrcode-generator` themed SVG; `?room=XXXX` pre-fills the join card
- Web Audio synth only: race whoosh, CLASH zap, score ding, podium fanfare;
  no transform animations on clickable elements
- `prefers-reduced-motion` disables all animation

## Verification
`tests/categoryclash.e2e.spec.js` (Playwright, screenshots `catclash-*.png`):
1. TV-first: captain lobby → force letter B via `page.evaluate` on the host → real typed
   answers over PeerJS: a CLASH (Bear vs Bear), an alliteration bonus (Big Bear +15),
   a wrong-letter answer (Cat), a veto toggle on/off, DONE early-finish → judge → round 2 →
   `endRace()` fast-forward → podium + awards → play again
2. Phone-first: host phone + TV viewer + guest, race renders on viewer, one judged category
