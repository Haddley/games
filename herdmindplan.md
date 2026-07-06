# herdmind.html — Implementation Plan

**Herd Mind** — think like the family. A majority-answer party game (Herd Mentality-style
mechanic, original name and content): everyone secretly answers the same silly prompt, answers
cluster into herds on the TV, and the biggest herd scores. Give the only unique answer and you're
stuck with the 🐄 Pink Cow — you can't win while you hold it. Architecture mirrors
`familytrivia.html` / `pit.html`: single self-contained HTML file, PeerJS P2P (one host,
N guests, optional viewers), host-authoritative state.

---

## What's distinctive vs. the other party games in this repo

| Feature | Herd Mind |
|---|---|
| Core loop | Free-text answer in secret → answers **cluster into herds** on the TV → biggest herd +1 each |
| The trap | Sole unique answer takes the **🐄 Pink Cow** — blocks winning until someone else takes it |
| Judging | Host auto-groups (case/space/plural-insensitive); the **👑 Captain/host merges near-matches by tapping two herds** before confirming — captain mode as a real game role (the Shepherd) |
| Win | First to 5/8/12 points **without the cow** |
| Look | Meadow: deep-green pasture, cream cards, pink cow accents; farm-animal avatars |

## Networking (same pattern as boggleparty/familytrivia)

- PeerJS 1.5.4, host peer ID `HERDMIND-XXXX` (4 chars, no I/O); QR join `?room=XXXX`
- Phone-first hosting **or** TV-first with 👑 Captain (first *connected* player) driving `ctl`
- Zombie-slot reconnect; viewer retry-once; `viewer_*` message variants

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name, avatar}` | Enter lobby (farm-animal avatar) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'answer', text}` | Lock in a secret answer |
| Guest→Host | `{type:'ctl', action, …}` | Judge/captain driver: `set` / `start` / `close` / `merge{a,b}` / `confirm` / `next` / `again` |
| Host→Guest | `{type:'lobby'/'answer'/'grouping'/'reveal'/'podium', …}` | Phase screens (grouping carries the merge UI for the judge only) |
| Host→Viewer | `viewer_lobby/answer/grouping/reveal/podium` | TV show (never reveals who answered what until reveal) |

## Game flow

1. **Lobby** — QR + code; setting: target score 5/8/12
2. **Answer** — TV shows the prompt and a "🐑 N of M in the pen" counter; phones get a text box
   (24 chars) + Lock button; all locked (or judge taps *Close answers*) → grouping
3. **Grouping** — host normalizes (lowercase, trim, collapse spaces, strip trailing 's') and
   auto-groups; the judge's phone lists the herds — tap one, tap another to **merge**, then
   *Confirm* ; TV shows "🧑‍🌾 the shepherd is sorting the herds…"
4. **Reveal** — herds animate onto the TV biggest-first, the winning herd(s) glow; everyone in
   the biggest herd (size ≥ 2; ties both score) +1; if there is **exactly one** singleton answer,
   its player takes the 🐄 (moo + fly-to-rail animation); phones show a personal verdict
5. Someone reaches the target cow-free → **Podium** — confetti + awards: 🏆 *Herd Leader*
   (most majority rounds), 🐄 *Lone Cow* (most cow pickups)

## Content

~80 embedded original prompts, all answerable by a 7-year-old ("Name a food you eat with your
hands", "A sound the dog makes", "Something you lose down the sofa"). Prompts drawn without
repeats per game (reshuffles when exhausted).

## Rendering notes

- During **answer** the phone re-render is forbidden (text input in progress) — lock counts and
  rails patch by element id; the judge's merge screen re-renders per merge (no text input there)
- Herd reveal rows: count + label + member avatar chips, staggered pop-in, winner glow;
  cow banner slides in with a synth **moo** (frequency-glide sawtooth)
- No transform animations on clickable buttons (tap stability); `prefers-reduced-motion` honored
- Sounds: lock blip, herd chord, moo, win fanfare — WebAudio only, no assets

## Verification
`tests/herdmind.e2e.spec.js` (screenshots `herd-*.png`, real PeerJS):
1. TV-first: captain lobby, 3 players answer ("Pizza"/"pizza " group; "Broccoli" lone → cow),
   confirm, reveal + cow on rail; round 2 exercises **merge** ("cat"+"kitty"+"cat" → one herd of 3,
   cow stays put); fast-forward to target → podium + awards → play again
2. Phone-first + TV viewer: host phone is the judge, 2 players herd together, +1 each
