# oddsheep.html — Implementation Plan

**The Odd Sheep** — the hidden-faker parlour game (Chameleon/Spyfall lineage, original name and
content): everyone secretly knows which word on the board is *the* word — except one player, the
Odd Sheep, who must bluff a clue and blend in. Architecture mirrors `familytrivia.html` /
`pit.html`: single self-contained HTML file, PeerJS P2P (one host, N guests, optional viewers),
host-authoritative state.

---

## What makes it fit the platform

| Feature | oddsheep.html |
|---|---|
| Hidden information | Phones show the secret word privately — or "🐑 YOU ARE THE ODD SHEEP" |
| Shared stage | TV shows the 4×4 word grid, live clue wall, vote tally, reveal theatre |
| Hosting | Phone-first, or TV-first with 👑 Captain (first phone in) driving via `ctl` |
| Joining | QR (`?room=XXXX`), 4-letter code, peer ID `ODDSHEEP-XXXX`, zombie-slot reconnect |
| Players | **3–12** (3 allowed for testing; lobby copy recommends 4+) |
| Look | Night-meadow: dark green, wool-paper cards, lantern amber; friendly rounded type |

---

## Game rules

- Settings: rounds **3/5/7**, clue timer **30/45 s** (per turn), discussion **60/90 s**
- ~25 embedded category grids, each a theme + 16 family-friendly words
- Round flow:
  1. **DEAL** — TV shows the 4×4 grid; each phone privately shows the secret word — except the
     sheep's, which says "🐑 blend in!". Captain/host taps *Start clues* when everyone's ready
  2. **CLUES** — in host-enforced turn order each player types **one word** (host rejects grid
     words, duplicate clues, multi-word entries); clues land on the TV wall as they arrive;
     per-turn timer auto-passes ("…") if it expires
  3. **DISCUSS** — TV countdown; argue out loud; captain/host can jump straight to the vote
  4. **VOTE** — phones vote for a player (not yourself); TV shows who's locked in
  5. **REVEAL** — sheep escapes (top vote isn't them, or tie): **sheep +150**.
     Caught: sheep gets one guess at the secret word from the grid —
     right: **sheep +100**; wrong: **everyone else +100**. TV plays the reveal theatre
- Correct votes for the sheep increment a hidden **Sheepdog** counter (award at the end)
- Podium after N rounds + awards: 🎭 *Master of Disguise* (most escapes), 🐕 *Sheepdog* (most
  correct votes)

---

## Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name, avatar}` / `{type:'join_viewer'}` | Lobby / TV |
| Guest→Host | `{type:'clue', word}` | My turn's clue (host validates) |
| Guest→Host | `{type:'vote', target}` | Vote by player name |
| Guest→Host | `{type:'guess', idx}` | Caught sheep's word guess |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host: `set/start/clues/vote_now/next/again` |
| Host→Guest | `lobby` / `deal` / `clues` / `clue_reject` / `discuss` / `vote_state` / `guess_state` / `reveal` / `podium` | Phase-shaped, personalised (`mySecret`, `amSheep`, `myTurn`, `myVote`) |
| Host→Viewer | `viewer_*` twins of the above | TV drives the shared show; never leaks who the sheep is before the reveal |

## Rendering notes

- Clue input never re-renders mid-typing: `clues` updates **patch** the wall/turn/timer by id
- Test hooks: host state + `dealBroadcast()` / `cluesBroadcast()` are globals so Playwright can
  rig category, secret word, sheep and turn order deterministically via `page.evaluate`
- No transform animations on clickable elements (Playwright stability; glow pulses only)
- Sounds: WebAudio synth (deal chime, clue tick, vote drum, caught sting, escape fanfare);
  confetti podium; `prefers-reduced-motion` respected

## Verification
`tests/oddsheep.e2e.spec.js` — real PeerJS flows: TV-first with captain (rigged round: clue
rejection, full vote, caught sheep guessing wrong, podium, play again) and phone-first + TV
viewer (deal + first clue on the wall). Screenshots `sheep-*.png`.
