# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Multiplayer browser games served by GitHub Pages at https://haddley.github.io/games/ — published straight from the `main` branch root (`.nojekyll`). **There is no build, lint, or bundle step.** Each game is one self-contained HTML file with all CSS/JS inline; the only external dependencies are CDN scripts (PeerJS 1.5.4, qrcode-generator 1.4.4) and Google Fonts.

`index.html` is the launcher grid — add a card there when adding a game. Each game has a companion plan (`bogglepartyplan.md`, `familytrivia.md`, …) written before the game was built; keep these as the reference for game rules and protocol design.

## Commands

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:e2e                                 # all E2E tests (headless)
npm run test:e2e:headed                          # watch the games play
npx playwright test tests/familytrivia.e2e.spec.js   # one game's suite
python3 -m http.server 8231                      # manual dev server (Playwright starts its own)
```

Tests need internet (public PeerJS broker; boggleparty also fetches the ENABLE dictionary from GitHub). They run with **1 worker, no parallelism** — the games are stateful P2P and each test drives several pages (host phone, guest phones, TV) in one browser. Screenshots land in `screenshots/` (gitignored) — the tests are as much a screenshot tour for eyeballing the UI as they are assertions.

## Architecture: how every multiplayer game works

The P2P pattern is identical across `boggle.html`, `pit.html`, `boggleparty.html`, `familytrivia.html` — read one to understand all (boggleparty and familytrivia are the most complete):

- **Host-authoritative state.** Whichever browser creates the room registers a PeerJS peer ID of `<GAME-PREFIX>-<4-letter code>` (e.g. `BGPARTY-KWXZ`, `FAMTRIV-ABCD`) and holds the single source of truth in a global `H` object. Guests hold no game logic; they send inputs and render whatever message last arrived.
- **Two client roles**, decided by the first message on a connection: `{type:'join', name}` → player (tracked in `guestConns{}`), `{type:'join_viewer'}` → TV/scoreboard (tracked in `viewerConns{}`). Viewers get their own `viewer_*` message variants with spectator-shaped payloads.
- **TV-host mode**: the big screen itself can create the room. It runs the authoritative host logic but renders the viewer UI (`isTvHost`), and the **first player to join becomes captain** — their phone drives settings/start/next via `{type:'ctl', action}` messages that the host only accepts from `H.players[0]`.
- **Rendering** is string-built `innerHTML` from a `render()` switch on a global `ui` state string. High-frequency updates (timer ticks, counters) **patch DOM nodes by id** instead of re-rendering, so in-progress touch interaction is never interrupted.
- **Reconnects**: a rejoining player with a known name whose old connection is dead takes over the "zombie" slot (`zombie.id = conn.peer`); viewers retry connecting once before giving up.
- **QR joining**: host/TV lobbies render a QR of `?room=XXXX`; the page pre-fills the join form from that query param on load.

## Family Trivia specifics

`familytrivia-pack.json` (101 questions, "The Family Chronicles") is the **source** for the `FAMILY_PACK` constant embedded inside `familytrivia.html`. If you edit the JSON, re-embed it — replace the value of `const FAMILY_PACK = {...};` in the HTML with the JSON file's content (one line, e.g. via a small node script). Scoring is the Rarity Payout: `min(500, round₁₀(100 × answering/correct))`, plus a streak bonus of `50 × (streak − 2)` from 3 in a row.

## Conventions

- Room codes are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I/O, to avoid 1/0 confusion).
- Test tricks for speed: shrink the host timer or `H.qIndex`/`H.timeLeft` via `page.evaluate` rather than waiting out rounds; top-level `let` globals (`roomCode`, `H`) are reachable from `evaluate`.
- Keep games playable at both phone (390×844) and TV (1920×1080) viewports; TV layouts use `vmin` units under a `body.viewer-mode` class.
