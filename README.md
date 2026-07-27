# Games

Multiplayer browser games, served by GitHub Pages at **https://haddley.github.io/games/**

Each game is a single self-contained HTML file using [PeerJS](https://peerjs.com/) for
peer-to-peer networking: one player hosts (their browser holds the authoritative game state),
other players join with a 4-letter room code, and an optional viewer mode turns a TV or big
screen into a shared scoreboard.

| Game | File | Players |
|------|------|---------|
| 🎉 Letter Storm | [letterstorm.html](https://haddley.github.io/games/letterstorm.html) | 1–8 — swipe words, earn prank tokens, sabotage rivals; TV scoreboard + QR joining |
| 📖 Family Trivia | [familytrivia.html](https://haddley.github.io/games/familytrivia.html) | 2–12 — a story on the TV, secret answers on phones; rarest correct answer pays most |
| 🤥 Fibbers! | [fibbers.html](https://haddley.github.io/games/fibbers.html) | 2–12 — write a lie, vote for the truth, fool the family |
| 🎨 Doodle Party | [doodleparty.html](https://haddley.github.io/games/doodleparty.html) | 2–12 — sketch on your phone, it appears live on the TV, race to guess |
| 🐑 The Odd Sheep | [oddsheep.html](https://haddley.github.io/games/oddsheep.html) | 3–12 — everyone knows the word except one faker; clues, votes, comebacks |
| 🐮 Herd Mind | [herdmind.html](https://haddley.github.io/games/herdmind.html) | 2–12 — match the majority; the lone answer takes the Pink Cow |
| ⚡ Category Clash | [categoryclash.html](https://haddley.github.io/games/categoryclash.html) | 2–12 — one letter, eight categories, duplicates cancel |
| 🎯 Best Guess | [bestguess.html](https://haddley.github.io/games/bestguess.html) | 2–12 — guess a number, then bet on the family's best guess |
| ✏️ Broken Pencil | [brokenpencil.html](https://haddley.github.io/games/brokenpencil.html) | 3–10 — write → draw → describe telephone chains, replayed on the TV |
| 🌙 Moonlight Village | [moonlightvillage.html](https://haddley.github.io/games/moonlightvillage.html) | 4–12 — werewolf with the TV as narrator and secret roles on phones |
| 🔨 Going, Going, GONE! | [goinggone.html](https://haddley.github.io/games/goinggone.html) | 2–10 — live auction of ridiculous lots with hidden values |
| 🎫 Full House Bingo | [bingo.html](https://haddley.github.io/games/bingo.html) | 2–12 — the TV calls, you daub; line and full house |
| 🔔 Corner the Market | [cornerthemarket.html](https://haddley.github.io/games/cornerthemarket.html) | 2–8 — shout-trade commodity bundles, corner the market, ring the bell |
| 🎲 Liar's Dice | [liarsdice.html](https://haddley.github.io/games/liarsdice.html) | 2+ — bid, bluff, call liar |
| ⭕ Tic Tac Toe | [ticktacktoe.html](https://haddley.github.io/games/ticktacktoe.html) | 2–8 — knockout tournament on the TV, or head-to-head on two phones |
| 🐇 Plump Trek | [plumptrek.html](https://haddley.github.io/games/plumptrek.html) | 2–12 — roll-and-move chaos; pick one of 30 trekkers, Gimmick cards, a Build rule, and a Finale that decides how you win |
| ✊ Rock Paper Scissors | [rockpaperscissors.html](https://haddley.github.io/games/rockpaperscissors.html) | 2–12 — the captain picks: battle royale (everyone throws at once) or a knockout bracket (two at a time, first to two) |

## Connections

No servers, no accounts: phones talk straight to the screen over WebRTC (PeerJS makes
the introductions, a Metered STUN/TURN server helps on awkward networks). Every game
shows how *your* device is actually talking to the others, in the top-right controls.
Tap the icon for the same explanation on the phone.

**🏠 Same wifi — the best case.** Both devices are on the same local network. Game
data goes phone → router → other device and never touches the internet. Lowest
possible latency, and nothing can go wrong upstream.

**🌐 Direct, different networks — excellent.** You're on separate networks (home and
a phone on 4G, say), but the two routers were successfully "hole-punched". A STUN
server was used *only* to discover each device's public address; once that was known,
the devices connected **directly** to each other. No game data passes through anyone's
server. This is what cross-network play normally gets.

**📡 Relay in use — works, but the worst case.** No direct path was possible, usually
because one end is behind a strict firewall, a symmetric NAT, or a mobile carrier's
network. The game falls back to a TURN relay: every packet travels to a cloud server
and back down to the other player. Perfectly playable, but with noticeably more delay
— and it's the only mode that costs bandwidth on a metered relay quota, so it's a last
resort. If one player is stuck on 📡 and it feels laggy, enabling UPnP or port
forwarding on *their* router can sometimes get them to 🌐; on mobile data or
carrier-grade NAT there's nothing to be done locally, and the relay is doing its job.

**⏳ Still settling — temporary.** You're connected, but ICE hasn't finished racing the
possible routes yet. It's testing local, direct and relayed paths at once, and the icon
becomes 🏠, 🌐 or 📡 within a few seconds as soon as the fastest one wins.

Best → worst: **🏠 → 🌐 → ⏳ (transient) → 📡**. `?net=0` on any game URL hides the
badge; `?net=1` brings it back.

### When something drops

If a phone sleeps or the wifi blinks, it puts itself back into the same seat with its
score intact — a "Reconnecting…" screen shows while it does — and a browser refresh
walks straight back into the room. If the 👑 captain's phone goes away, the crown moves
to the next player so nobody's stuck, and returns when they rejoin. The one thing that
can't be recovered is the **host/TV** tab reloading: that browser holds the game.

The `*plan.md` files are the implementation plans the games were built from.

This folder was moved out of the [haddley.github.io](https://github.com/Haddley/haddley.github.io)
repo (`public/games/`) into its own project repo; GitHub Pages publishes it from the `main`
branch root (`.nojekyll`, no build step) so the original `/games/...` URLs are unchanged.

## Licence

The games are licensed under the **[Business Source License 1.1](LICENSE)**: you may copy,
modify and redistribute them, and make production use for **non-commercial, educational,
personal, research and evaluation** purposes. Commercial use needs a separate licence —
neil@haddley.com. On **2030-07-26** the licence converts to **Apache 2.0**.

Two things that licence does *not* cover:

- **`sprites/`** — the Plump Trek player pieces are derived from [Kenney](https://kenney.nl)
  asset packs released under **CC0 1.0** (public domain). They stay public domain: take them
  and use them for anything. See [`sprites/LICENSE`](sprites/LICENSE) and
  [`sprites/CREDITS.md`](sprites/CREDITS.md) for provenance, the upstream licence texts, and
  a script that rebuilds both sheets from the original packs byte-for-byte.
- **CDN dependencies**, which aren't redistributed here: PeerJS (MIT), qrcode-generator
  (MIT), Google Fonts, and the Metered TURN relay.

Several games' *rules* are inspired by commercial games, credited on the launcher page.
Nothing is affiliated with or endorsed by their publishers, and no actual content — card
text, word lists, question banks — is copied; only mechanics.
