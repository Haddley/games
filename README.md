# Games

Multiplayer browser games, served by GitHub Pages at **https://haddley.github.io/games/**

Each game is a single self-contained HTML file using [PeerJS](https://peerjs.com/) for
peer-to-peer networking: one player hosts (their browser holds the authoritative game state),
other players join with a 4-letter room code, and an optional viewer mode turns a TV or big
screen into a shared scoreboard.

| Game | File | Players |
|------|------|---------|
| 🎉 Boggle Party | [boggleparty.html](https://haddley.github.io/games/boggleparty.html) | 1–8 — swipe words, earn prank tokens, sabotage rivals; TV scoreboard + QR joining |
| 🔤 Boggle | [boggle.html](https://haddley.github.io/games/boggle.html) | 2+ — classic rules, duplicates cancel |
| 🎲 Liar's Dice | [liarsdice.html](https://haddley.github.io/games/liarsdice.html) | 2+ — bid, bluff, call liar |
| 🌽 Pit | [pit.html](https://haddley.github.io/games/pit.html) | 3+ — frantic commodity trading |
| ⭕ Tic Tac Toe | [ticktacktoe.html](https://haddley.github.io/games/ticktacktoe.html) | 2 |
| 🪂 Skydive | [skydive.html](https://haddley.github.io/games/skydive.html) | 1 |
| 🌆 Synthwave | [synthwave.html](https://haddley.github.io/games/synthwave.html) | 1 |

The `*plan.md` files are the implementation plans the games were built from.

This folder was moved out of the [haddley.github.io](https://github.com/Haddley/haddley.github.io)
repo (`public/games/`) into its own project repo; GitHub Pages publishes it from the `main`
branch root (`.nojekyll`, no build step) so the original `/games/...` URLs are unchanged.
