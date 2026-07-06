# moonlightvillage.html — Implementation Plan

Werewolf/Mafia (the public-domain parlour game) rebuilt for the living room on the
**boggleparty/familytrivia** architecture: secret roles live on phones, and the TV replaces the
human moderator — an atmospheric narrator that runs the nights, the votes, and the reveals.
Single self-contained HTML file, PeerJS P2P (one host, N guests, optional viewers),
host-authoritative state.

---

## Why the phone+TV split is the whole game here

| Parlour werewolf problem | Moonlight Village fix |
|---|---|
| Needs a human moderator who can't play | **The TV narrates**: night scenes, dawn reveals, vote tallies |
| "Close your eyes" cheating | Roles and night actions are **only ever on your phone** |
| Dead players get bored and blab | Dead phones become 👻 **spectator mode** — they see everything, screen tells them to stay quiet |
| Kids peek | Role card is **hold-to-peek** (shows nothing until pressed) |

The TV never leaks a secret: it shows only public events (deaths, banishments, revealed roles of
the dead) and mood. Everything hidden — your role, wolf pack chat, seer visions — is phone-only.

---

## Networking (same pattern as boggleparty/familytrivia/pit)

- PeerJS 1.5.4, host peer ID `MOONVILL-XXXX` (4 chars, no I/O); QR join via `?room=XXXX`
- Phone-first hosting, or **TV-first** where the first phone in is 👑 Captain (settings, start,
  skip-to-vote, play-again via `ctl` messages); crown passes on disconnect
- `guestConns{}` / `viewerConns{}`; zombie-slot reconnect; viewer retry-once

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` / `{type:'join_viewer'}` | Enter lobby / TV mode |
| Guest→Host | `{type:'role_ready'}` | "I've seen my role" during the deal |
| Guest→Host | `{type:'night_action', pick}` | Wolf victim vote / seer peek / healer protect (host infers actor's role) |
| Guest→Host | `{type:'vote', pick}` | Day vote |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host: `set` / `start` / `skipday` / `again` |
| Host→Guest | `{type:'lobby'/'state', …}` | Personalised: my role, wolf pack, seer visions, alive flags, counts, narrator payloads |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', …}` | Public-only mirror for the TV |

---

## Roles & settings

- 4–12 players. Wolves by count: 4–6 → **1**, 7–9 → **2**, 10+ → **3**. Always 1 **Seer** 🔮.
  **Healer** 💊 optional (lobby setting, default on). Everyone else **Villager** 🌾.
- Discussion timer: 60 / 90 / 120 s (lobby setting).

## Game flow (one full game ≈ 10 minutes)

1. **Lobby** — QR + code; captain/host settings
2. **Deal** — phones show a hold-to-peek role card (wolves also see their packmates);
   tap "I've seen my role"; TV shows the ready count. All ready → night
3. **Night** — TV: stars, moon, typewriter narrator ("Night falls on Moonlight Village…");
   wolves vote a victim (majority, tie = earliest-cast vote), seer peeks one player and privately
   learns 🐺/🌾, healer shields anyone (self allowed). Auto-resolves when all actions are in
4. **Dawn** — sunrise scene: "💀 Ben was taken — they were a Villager" or "✨ everyone survived!"
   (healer save). Auto-advances after a beat
5. **Day** — discussion countdown on the TV; phones say "talk it out"; captain/host can skip
6. **Vote** — alive players vote on phones (not for themselves); TV shows only the count;
   majority is banished (tie = nobody), role revealed dramatically
7. Repeat night→day until **all wolves banished → Village wins** or
   **wolves ≥ remaining others → Wolves win**
8. **Game over** — TV finale: winning team, full role reveal grid, confetti; session stats row
   (games, wins as wolf, wins as village — tracked across "play again" by name)

Dead players: phone flips to 👻 spectator (sees all roles, told to keep quiet); they're skipped
in counts.

---

## Rendering & feel

- Phone (390×844) and TV (1920×1080, `vmin`, `body.viewer-mode`) layouts
- Night palette (deep indigo, CSS starfield, big moon) vs dawn palette (warm sunrise gradient);
  narrator lines typewritten on the TV; `prefers-reduced-motion` renders instantly
- Role colours: wolf red · seer violet · healer green · villager amber
- Synth sounds only: owl hoots at nightfall, wolf howl on a death, morning birds at dawn,
  a low bell for the vote, fanfare + confetti for the winning team
- No transform animations on clickable elements (tap reliability); state broadcasts patch
  counts/timers by element id so a phone mid-choice never re-renders

## Verification

`tests/moonlightvillage.e2e.spec.js` (screenshots `moon-*.png`), real PeerJS flows:
1. **TV-first**: 4 phones join (first is 👑), roles forced deterministically via `page.evaluate`
   on the host, hold-to-peek checked, full night (wolf kill + seer vision + self-protect healer),
   dawn death reveal, day skip, vote banishes the wolf → Village wins → play again → lobby
2. **Phone-first + TV viewer**: healer save path — "everyone survived" dawn
