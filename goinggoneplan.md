# goinggone.html — Implementation Plan

**Going, Going, GONE!** — the auction house. Quirky lots hit the block, everyone bids live from
their phone with a secret budget, the TV runs the theatre (gavel countdown, SOLD! banners), and
nobody knows what anything is worth until the valuation finale. Overpaying for a haunted toaster
is the whole point. Architecture mirrors `familytrivia.html` / `pit.html`: single self-contained
HTML file, PeerJS P2P (one host, N guests, optional viewers), host-authoritative state.

---

## The pitch

| Beat | What happens |
|---|---|
| Lot presented | TV shows emoji + name + one-liner (“A goose that lays slightly-golden eggs”) — **value hidden** |
| Live bidding | Phones tap +10 / +50 / +100; every bid resets a **5-second gavel countdown** on the TV |
| GONE! | Gavel bangs — winner pays, lot lands on their shelf. No bids at all → lot is **passed** |
| The Valuation | After the last lot, the TV reveals every true value one by one — cha-ching or sad trombone |
| Podium | Net worth = coins left + shelf value. Awards: 🦅 Eagle Eye, 🫠 Mug of the Match, 🪙 Scrooge |

- 2–10 players · everyone starts with **1,000 coins** · lots per game 6 / 8 / 10
- ~40 embedded original lots: treasures (300–600), duds (10–80), and 6 **Mystery Boxes**
  (hint only — “it rattles when you shake it” — value 0–700 revealed at the finale)
- You can’t outbid yourself; you can’t bid past your coins; first bid received wins a tie

---

## Networking (same pattern as familytrivia/pit)

- PeerJS 1.5.4, host peer ID `GAVEL-XXXX` (4 chars, no I/O); QR join (`?room=XXXX` auto-fill)
- Phone-first hosting **or TV-first** (first phone in = 👑 Captain: settings, start, play-again)
- `guestConns{}` / `viewerConns{}` on host; zombie-slot reconnect; viewer retry-once

### Message protocol

| Sender | Message | Purpose |
|---|---|---|
| Guest→Host | `{type:'join', name}` | Enter lobby (colour auto-assigned) |
| Guest→Host | `{type:'join_viewer'}` | TV mode |
| Guest→Host | `{type:'bid', raise}` | Raise by 10/50/100 (host validates coins, leader, phase) |
| Guest→Host | `{type:'ctl', action, …}` | Captain/host driver: `set` / `start` / `again` |
| Host→Guest | `{type:'lobby', …}` | Lobby sync |
| Host→Guest | `{type:'state', …}` | Phase + lot + live bid (`price`, `leader`, `endsIn`), my coins/shelf, reveals |
| Host→Viewer | `{type:'viewer_lobby'/'viewer_state', …}` | TV theatre state |

Host phases: `lobby → (lot_intro → bidding → sold)×N → valuation → podium`.
Timers are host-side only: 3.5 s lot intro, 5 s gavel (reset on every bid), 3.2 s SOLD banner,
2.6 s per valuation reveal. Clients get `endsIn` ms and run a purely visual local countdown.

---

## Rendering notes

- **Bidding is fast — patch, never re-render**: on each `state` during `bidding`, patch by id
  (`#v-price`, `#gavel-bar`, leader banner, raise-button disabled states, coins). Full render
  only on phase/lot change. No transform animations on the raise buttons (tap stability).
- Phone bidding: huge current price, “🏆 You’re winning this lot!” banner when leading
  (buttons swap to a “you lead” note — you can’t outbid yourself), raise buttons disabled
  when they’d exceed your coins, your shelf of won lots along the bottom.
- TV bidding: spotlight lot card (emoji, name, desc, LOT N of M), price in huge type, leader
  in their colour, gavel bar draining — “going… going…” label under 2.5 s; rail of players
  (coins + shelf count). SOLD/PASSED interstitial banners with the gavel 🔨.
- Valuation theatre: reveal cards flip one per 2.6 s (profit green + cha-ching, loss red +
  sad trombone), running net-worth leaderboard re-sorts on the right; then podium + confetti.
- WebAudio synth only: bid blip, gavel knock (triple on GONE!), cash register, trombone slide.
- `prefers-reduced-motion` honoured (no confetti/animations).

## Verification
1. Static server on 8231 → open `/goinggone.html` in 4 tabs (TV-host, 2 phones, spare)
2. TV-first: first phone is 👑 Captain (settings + start); phone-first + “Open TV screen” viewer
3. Real bids through the network: leader flips, price climbs, self-outbid blocked, gavel resets
4. SOLD → winner pays and shelf updates; no-bid lot → PASSED
5. Valuation math: net worth = coins + revealed values; awards correct; play-again → lobby
6. Playwright suite `tests/goinggone.e2e.spec.js` (screenshots `gavel-*.png`) covers both modes
