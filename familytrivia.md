# familytrivia.html — Implementation Plan

Karen's idea, in the spirit of the **Mr & Mrs Game**: a family trivia night where everyone reads a
short story together on the TV, then races to answer a multiple-choice question about it on their
phones. Points reward being right — and reward being right *when almost everyone else was wrong*.
Architecture mirrors `boggleparty.html`: single self-contained HTML file, PeerJS P2P
(one host, N guests, optional viewers), host-authoritative state.

---

## What's different from boggleparty.html

| Feature | boggleparty.html | familytrivia.html |
|---|---|---|
| Core loop | Race to swipe words on a board | **Read a short story → answer a multiple-choice question** |
| Input | Swipe-to-trace | **Tap one of up to 6 big answer buttons** (locked in secretly) |
| Scoring | Word length + unique ×2 | **Correct = base points × rarity** — fewer correct players = bigger payout |
| Hosting | Phone hosts, TV joins as viewer | **Two ways to start**: a phone hosts and the TV joins, *or* the TV creates the room and the first phone to join becomes 👑 **Captain** |
| Content | ENABLE dictionary | **Embedded story packs** (JSON in the file) + paste-your-own custom pack |
| Sabotage | Prank tokens | — (family-friendly; tension comes from secret answers + reveal) |
| Players | 1–8 | **2–12** (grandma's phone counts) |
| Look | Neon party | **Cozy storybook**: warm paper/ink theme, page-turn transitions, confetti reveals |

---

## Networking (same pattern as boggleparty.html)

- PeerJS 1.5.4, host peer ID `FAMTRIV-XXXX` (4 chars, no I/O)
- `guestConns{}` / `viewerConns{}` on host; `hostConn` on guest/viewer
- Reconnect zombie-slot reuse; viewer retry-once logic; QR join (`?room=XXXX` auto-fill)

### Two hosting modes (same protocol, different seat for the host peer)

1. **Phone-first** — a player taps *Host Game*; their phone is the PeerJS host **and** a player.
   The TV opens the page, taps *TV Mode*, scans/enters the code → joins as viewer.
2. **TV-first** — the TV taps *Open on TV*; the TV is the PeerJS host but **not a player**.
   It immediately shows a giant QR + room code. The **first phone to join is crowned Captain**:
   their lobby shows the settings panel and Start/Next buttons, sent as `captain_cmd` messages
   which the TV-host applies. If the Captain disconnects, the crown passes to the next player.

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name, avatar}` | Enter lobby (pick an emoji avatar) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'answer', qid, choice, ms}` | Secret answer lock-in (`ms` = time taken, for tiebreaks) |
| Guest→Host | `{type:'captain_cmd', cmd, …}` | TV-first mode only: `settings` / `start` / `next` / `skip_story` |
| Host→Guest | `{type:'lobby', players, settings, captainId}` | Lobby sync (crown shown on captain) |
| Host→Guest | `{type:'story', title, text, seconds}` | Story phase — phones show "👀 Eyes on the TV!" |
| Host→Guest | `{type:'question', qid, prompt, choices[], seconds}` | Up to **6** choices, labelled A–F with fixed colours |
| Host→Guest | `{type:'locked', qid, choice}` | Ack — button greys out, "Locked in!" |
| Host→Guest | `{type:'reveal', qid, correct, myPts, breakdown, tally[]}` | Personal verdict + rarity breakdown |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_story'/'viewer_question'/'viewer_reveal'/'viewer_podium', …}` | TV drives the shared show; question view shows a live "N of M locked in" counter, never *who chose what* |

---

## Game flow

1. **Lobby** — QR + room code on TV; settings (host or Captain): pack, questions per game 5/10/15,
   story timer auto/manual, answer timer 15/20/30 s
2. **Story phase** — TV shows the story with a gentle typewriter/read-along effect and a progress
   bar; phones just say "👀 Eyes on the TV!". Auto-advance when the bar fills, or Captain taps Next
3. **Question phase** — TV shows the question + up to 6 colour-coded answers and a countdown ring;
   phones show the question text **and** the same 6 big buttons (the question stays on the phone
   through the reveal too). Answers are **secret** — the TV only shows the locked-in
   counter ticking up. Phase ends when everyone locks in or the timer hits zero
4. **Reveal** — TV flips the cards: wrong answers fade, the correct one glows; an animated bar
   chart shows how the family split; point payouts fly onto the leaderboard with the rarity
   label (see below); phones show their personal verdict + points breakdown
5. Repeat for N questions → **Game over** — podium + confetti; "Sharpest Ear" (most Lone Wolfs)
   and "Crowd Surfer" (most all-correct answers) fun awards

### Scoring — the Rarity Payout

Being right pays; being right **when the crowd was wrong** pays big. With `N` answering players
and `C` of them correct:

```
points = round₁₀( 100 × N / C )   capped at 500        wrong or no answer = 0
```

| Situation (N = 8) | C | Payout each | TV label |
|---|---|---|---|
| Everyone nailed it | 8 | 100 | 🐑 **With the Flock** |
| Half the family | 4 | 200 | ⚖️ **Split Decision** |
| A sharp few | 2 | 400 | 🕵️ **Inner Circle** |
| Just you | 1 | 500 (cap) | 🐺 **LONE WOLF!** — special fanfare + phone haptic |

- **Streak bonus**: 3+ correct in a row = +50 per extra answer in the streak (🔥 shown by name on TV)
- **Tiebreaks** use total answer time (`ms` summed) — faster wins; no speed points, so kids who
  read slowly aren't punished, but ties resolve fairly

### Content — story packs

- Each question = `{title, story (40–80 words), prompt, choices[2–6], answer, pack}`
- **The Family Chronicles** — 101 ready-made stories about Karen, Neil, Jess, Ben, Archie and
  Ollie live in `familytrivia-pack.json`; embed this pack into the HTML file at build time
  (it doubles as the reference example of the question format)
- Further **embedded packs** (~20 questions each): *Fairy-Tale Fibs* (classic tales
  with one detail changed), *Kitchen Chaos* (silly domestic mini-stories), *Time Travellers*
  (history vignettes), *Animal Antics*
- **Custom pack**: lobby "✍️ Our Family" option — paste JSON or fill a simple form
  (great for Mr & Mrs–style questions about the family itself); stored in `localStorage`
- Questions drawn without repeats per game; choices shuffled by the host each time

---

## Rendering notes

- One HTML file, no build step; PeerJS + `qrcode-generator` from CDN (same versions as boggleparty)
- Answer buttons: fixed palette A red / B blue / C gold / D green / E purple / F teal, identical
  on TV and phone so "the gold one!" works across the room; ≤4 choices render 2×2, 5–6 render 2×3
- Story phase on TV: large serif type on a paper card, typewriter reveal at reading speed
  (~180 wpm) driving the progress bar; `prefers-reduced-motion` renders it instantly
- Countdown patches the DOM per tick (ring + locked-in counter) instead of re-rendering,
  so a phone mid-tap is never interrupted
- Reveal bar chart animates with CSS transitions; Lone Wolf triggers confetti burst
  (canvas, reused from boggleparty podium) + `navigator.vibrate` on the winning phone
- Phone layout thumb-first: answers fill the lower two-thirds; TV layout: story/question centre
  stage, leaderboard rail on the right, locked-in counter + timer bar along the bottom

## Verification

1. `npm run dev` → open `/games/familytrivia.html` in 4+ tabs (host phone, 2 guests, TV viewer)
2. **Phone-first**: host on a phone-sized viewport, TV joins by code — lobby, QR, settings sync
3. **TV-first**: create on TV tab, join two phones — first phone shows 👑 settings/Start;
   kill the captain tab mid-lobby — crown passes to the next player
4. Play a round: story shows on TV while phones show "Eyes on the TV"; answer on all phones —
   verify secrecy (TV shows only the counter), reveal chart, and rarity payouts
   (engineer one Lone Wolf and one all-correct to check 500-cap and 100 floor)
5. Streak: answer 3+ in a row correctly on one phone — verify 🔥 bonus on TV and phone breakdown
6. Custom pack: paste a 3-question JSON in the lobby, play it through; reload — pack persists
7. Scan the lobby QR with a real phone on the same origin — join card pre-filled
8. Add Playwright screenshots to the existing suite (lobby TV, story, question phone, reveal, podium)
