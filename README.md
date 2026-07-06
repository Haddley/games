# Games

Multiplayer browser games, served by GitHub Pages at **https://haddley.github.io/games/**

Each game is a single self-contained HTML file using [PeerJS](https://peerjs.com/) for
peer-to-peer networking: one player hosts (their browser holds the authoritative game state),
other players join with a 4-letter room code, and an optional viewer mode turns a TV or big
screen into a shared scoreboard.

| Game | File | Players |
|------|------|---------|
| 🎉 Boggle Party | [boggleparty.html](https://haddley.github.io/games/boggleparty.html) | 1–8 — swipe words, earn prank tokens, sabotage rivals; TV scoreboard + QR joining |
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
| 🔔 Pit! | [pit.html](https://haddley.github.io/games/pit.html) | 2–8 — shout-trade commodity bundles, corner the market, ring the bell |
| 🔤 Boggle | [boggle.html](https://haddley.github.io/games/boggle.html) | 2+ — classic rules, duplicates cancel |
| 🎲 Liar's Dice | [liarsdice.html](https://haddley.github.io/games/liarsdice.html) | 2+ — bid, bluff, call liar |
| ⭕ Tic Tac Toe | [ticktacktoe.html](https://haddley.github.io/games/ticktacktoe.html) | 2 |
| 🪂 Skydive | [skydive.html](https://haddley.github.io/games/skydive.html) | 1 |
| 🌆 Synthwave | [synthwave.html](https://haddley.github.io/games/synthwave.html) | 1 |

The `*plan.md` files are the implementation plans the games were built from.

This folder was moved out of the [haddley.github.io](https://github.com/Haddley/haddley.github.io)
repo (`public/games/`) into its own project repo; GitHub Pages publishes it from the `main`
branch root (`.nojekyll`, no build step) so the original `/games/...` URLs are unchanged.
