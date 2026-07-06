# fibbers.html — Implementation Plan

**Fibbers!** — bluff trivia in the *Fictionary* tradition (the public-domain parlour game behind
Balderdash/Fibbage): the TV asks a question with a bizarre true answer; everyone secretly types a
convincing lie on their phone; then the whole family votes on the answer wall — truth among the
lies. You score for finding the truth AND for every player your lie fools.
Architecture mirrors `familytrivia.html` / `pit.html`: single self-contained HTML file, PeerJS P2P
(one host, N guests, optional viewers), host-authoritative state.

---

## What's different from familytrivia.html

| Feature | familytrivia.html | fibbers.html |
|---|---|---|
| Content | Story + fixed multiple choice | **Question + write-in lies** — the players ARE the content |
| Answer wall | Up to 6 fixed choices | **N lies + 1 truth**, shuffled, lettered cards (up to 13) |
| Scoring | Rarity payout | **+100 find the truth · +60 per player fooled · +50 lie-matches-truth bonus** |
| Reveal | Bar chart | **Reveal theatre** — TV flips cards one by one, least-voted first, truth last; fooled avatars land on each lie |
| Input risk | Tap buttons | **Text input mid-phase** — viewer count updates go to TV only; a phone never re-renders while typing |
| Look | Cozy storybook | **Liar's lounge**: deep plum, brass gold, neon pink; lies rendered as typed index cards |

---

## Networking (same pattern as familytrivia.html)

- PeerJS 1.5.4, host peer ID `FIBBERS-XXXX` (4 chars, no I/O)
- `guestConns{}` / `viewerConns{}` on host; `hostConn` on guest/viewer
- Phone-first hosting **or TV-first** (first phone in = 👑 Captain via `ctl` messages)
- Reconnect zombie-slot reuse; viewer retry-once; QR join (`?room=XXXX` auto-fill)

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name, avatar}` | Enter lobby (emoji avatar picker) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'lie', qid, text}` | Submit a lie (replaces nothing — one accepted lie per round) |
| Guest→Host | `{type:'vote', qid, key}` | Vote for an answer card (own card rejected) |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host driver: `set` / `start` / `next` / `again` |
| Host→Guest | `{type:'lobby', …}` | Lobby sync |
| Host→Guest | `{type:'lie_phase', qid, q, seconds}` | Show question + lie input |
| Host→Guest | `{type:'lie_ack', status}` | `'truth'` → found-the-truth bonus, write another; `'ok'` → locked in |
| Host→Guest | `{type:'vote_phase', qid, cards, myKey, seconds}` | Answer wall (myKey = your own card, disabled) |
| Host→Guest | `{type:'vote_ack', key}` | Vote locked |
| Host→Guest | `{type:'reveal', …}` | Personal verdict + full cards + standings |
| Host→Guest | `{type:'podium', standings, awards}` | Final |
| Host→Viewer | `viewer_lobby/viewer_lie/viewer_vote/viewer_reveal/viewer_podium` | TV show (live submitted/voted counters) |

---

## Game flow

1. **Lobby** — QR + code; settings (host/👑 Captain): questions per game 5/8/10
2. **LIE phase (45 s)** — TV: the question big + "N of M lies in"; phones: question + text box.
   Host normalises submissions: matches the truth → **+50 bonus**, phone told to write a real lie
   (a second truth-match just locks them in with no lie); duplicate lies **merge into one card**
   with all authors splitting future fools. Early-end when everyone is locked in
3. **VOTE phase (30 s)** — TV: the shuffled answer wall, lettered index cards; phones: the same
   cards as buttons, your own card disabled ("your lie"). Early-end when all votes are in
4. **Reveal theatre** — TV flips cards least-voted first: author avatars on the card, fooled
   avatars fly on, points fly to the rail; the truth flips last with the truth-finders.
   Phones show a personal breakdown instantly. Captain/host taps Next
5. After N questions → **Podium** + confetti + awards: **Silver Tongue** (most fools),
   **Truth Hound** (most truths found)

### Scoring
+100 vote the truth · +60 per player fooled (split across merged-lie authors, rounded to 10s) ·
+50 your lie matched the truth

### Content
~45 embedded questions `{q, a}` — weird-but-true facts (odd laws, animal facts, word origins),
answers 2–6 words so lies blend in.

---

## Rendering notes

- **Never interrupt typing**: during the lie phase, per-lie progress goes only to viewers; a
  phone re-renders only on phase change or its own `lie_ack`. Countdown bars patch by id
- Lie cards styled as typed index cards (mono font, cream paper) on the plum/brass lounge theme;
  answer wall auto-fits up to 13 cards on TV, stacked scrollable list on phones
- Reveal theatre runs client-side on the TV from one `viewer_reveal` payload (2.6 s per card,
  instant under `prefers-reduced-motion`); captain can hit Next at any time
- QR via `qrcode-generator`; WebAudio synth stings (lock-in click, card flip, truth fanfare);
  `navigator.vibrate` when your lie fools someone
- No transform animations on clickable elements (tap/click stability)

## Verification
1. Static server on :8231 → open `/fibbers.html` in 4+ tabs (TV-host, captain, guest, phone-host)
2. TV-first: captain settings/start; truth-match bonus path (+50, second input); duplicate-lie merge
3. Vote: own card rejected/disabled; truth vote +100; fools +60 each
4. Reveal theatre order (least votes → truth last); podium + awards; play again
5. Playwright suite `tests/fibbers.e2e.spec.js` (screenshots `fibbers-*.png`) covers TV-first and
   phone-first modes end to end
