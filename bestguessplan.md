# bestguess.html — Implementation Plan

**Best Guess** — trivia for people who don't know trivia. A numeric question goes up on the TV,
everyone secretly guesses on their phone, the guesses line up as a betting board, and then the
family **bets on whose guess is closest** — grandma can win by betting on Jess's answer without
knowing a single fact. Estimate-betting mechanic (Wits &amp; Wagers lineage — mechanic is generic,
name and all 50 questions are our own). Single self-contained HTML file, PeerJS P2P
(one host, N guests, optional viewers), host-authoritative — same architecture as
`familytrivia.html` / `pit.html`.

---

## What it borrows from the house pattern

| Piece | Same as |
|---|---|
| PeerJS host `BESTGUESS-XXXX`, QR join (`?room=`), zombie-slot reconnect, viewer retry-once | boggleparty |
| Phone-first hosting **or** TV-first with 👑 Captain (first phone in) driving `ctl` messages | familytrivia |
| `viewer_*` message variants, patch-by-id during input (keypad/bets never interrupted) | familytrivia/pit |
| Emoji avatars, confetti podium, WebAudio synth sounds, `prefers-reduced-motion` | familytrivia |

Theme: **midnight game-show** — deep indigo board, teal question glass, gold betting chips.

---

## Game flow

1. **Lobby** — QR + code; settings (host or 👑 Captain): questions per game 5/7/10
2. **GUESS** — TV shows the question (+ unit) and a locked-in counter; phones show a big
   number pad (integer, backspace, clear, **Lock it in**). Phase ends when everyone has locked;
   host/captain gets a "Close guessing" fallback for stragglers (they simply have no slot)
3. **THE BOARD** — host sorts the unique guesses smallest→largest into betting slots
   (equal guesses merge, showing every author's avatar); a leftmost house slot
   **"ALL TOO HIGH 📉"** pays if every guess is over the answer
4. **BET** — every player gets **2 chips** to place from their phone (stack both on one slot or
   split; your own guess is allowed); chips land on the TV board live; "Clear my chips" undo;
   host/captain "Close betting" fallback
5. **PAYOUT** — winning slot = closest guess **not over** the answer (else the house slot):
   TV reveals the true answer with a sweep, the winning slot glows —
   **slot authors +100 · each chip on it +50** (author betting own slot stacks both);
   🎯 badge for an exact guess; leaderboard deltas fly; captain/host next
6. Repeat → **Podium** — confetti + awards: **🔮 Oracle** (most winning guesses),
   **💰 Smart Money** (most winning chips)

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name, avatar}` / `{type:'join_viewer'}` | Enter / TV |
| Guest→Host | `{type:'guess', qid, value}` | Lock in a guess (int ≥ 0) |
| Guest→Host | `{type:'bet', qid, slot}` / `{type:'clear_bets', qid}` | Place a chip / take chips back |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host: `set`/`start`/`close_guess`/`close_bets`/`next`/`again` |
| Host→Guest | `{type:'lobby'/'guess'/'board'/'payout'/'podium', …}` | Personalised phase snapshots (`myGuess`, `myBets`, `my` payout breakdown) |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_guess'/'viewer_board'/'viewer_payout'/'viewer_podium', …}` | TV drives the show |

### Content
~50 original numeric questions embedded (`{q, a, unit}`): bones in the body, Eiffel Tower height,
year of the first text message, Burj Khalifa, blue-whale weight, chessboard squares… all
family-friendly, verifiable, and fun to argue about.

---

## Rendering notes

- Phones keep keypad entry and chip placement in **local state**; host updates patch counters
  and chip stacks by element id so mid-input players are never re-rendered
- TV board: horizontal slot cards (house slot styled bearish red), author avatars on top,
  bet chips stack under each slot as they land; payout sweeps a gold highlight to the winner
- The winning-slot rule lives in one pure function `winningSlot(slots, answer)` so tests can
  assert the edge cases (exact hit, all-too-high, merged slots) directly

## Verification
1. Static server on 8231 → 4+ tabs (TV-host, captain, guest, plus phone-first + viewer variant)
2. `tests/bestguess.e2e.spec.js`: TV-first — captain settings, forced known question via
   `page.evaluate`, keypad guesses through the real network path, chips on slots, payout maths
   asserted (+100 author, +50/chip), podium + play-again; phone-first — host phone + TV viewer
   + guest one full round. Screenshot tour `guess-*.png`
