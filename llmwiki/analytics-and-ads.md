# Analytics and Ads

GA4 is live and wired into `common.js` (see CLAUDE.md's "Google Analytics (GA4) and Ads"
section for the code-level facts — property ID, where `trackEvent`/`gameSlug` live, exactly
which events `p2p.js` and `index.html` fire and why). This page is the operational/setup
side: what's been done in the GA4 **UI** (not the repo), what's still open, and the Ads setup
steps for whoever picks this back up.

## ⏳ Open item: mark `room_created` / `room_joined` as GA4 Key Events

**Not done yet, as of 2026-08-13.** Both events are confirmed firing correctly in production
(verified via a real host+join round-trip on the live site, and visible with real counts in a
GA4 Explore "Event count by Event name" report), but they had not yet appeared in
**Admin → Events → Recent events** — GA4's admin event-name list lags real reporting data by
up to ~24–48h even though the underlying hits are already being counted.

**Before setting up Google Ads, come back and:**
1. GA4 → **Admin → Events → Recent events** tab (not "Key events" — that tab only lists
   events already starred) → find `room_created` and `room_joined` → click the star to mark
   each as a Key Event. If they're still not listed, check the "Key events" tab for a
   **"New key event"** manual-add option that may let you type the event name directly
   without waiting for it to surface in Recent events.
2. Confirm both show up under **Admin → Events → Key events** with real event counts.
3. *Then* proceed to the Google Ads setup below — Ads conversion import (step 3 there) reads
   from GA4 Key Events specifically, so it will show nothing to import until this is done.

## `bmc_click`, and why it isn't GA4's `purchase`

The Buy Me a Coffee footer link, its QR image, and an actual phone scan of that QR each fire
`bmc_click` separately (`{ source: 'link' | 'qr' | 'qr_scan' }`), added 2026-08-13. GA4's
Admin → Events page ships a default suggested `purchase` Key Event on every property —
that's the row that showed "No stream data detected" before this repo ever wired up any
commerce tracking; nothing here ever created or fired it, and nothing should. Reusing it for
the coffee link was considered and rejected: GA4's `purchase` implies a completed transaction
with `currency`/`value`/`transaction_id`, and a static site with no callback from Buy Me a
Coffee can only ever see the *click*, never whether someone actually paid. Firing `purchase`
for a click-through would make the GA4 dashboard show
what looks like real revenue data that isn't. `bmc_click` is the honest version: a measure of
intent, not payment. The real number lives on the Buy Me a Coffee dashboard, not here.

**Why the scan gets its own redirect page (`bmc.html`).** A camera app reads a QR code's
encoded URL and opens it directly — it never loads the page the image sits on, so no
`onclick` on the `<a>` around it can ever fire for a scan, only for someone tapping the
rendered image on their own screen. Fixing that meant giving the QR its own destination:
the SVG's *encoded payload* is `https://haddley.github.io/games/bmc.html`, a tiny page that
fires `trackEvent('bmc_click', {source:'qr_scan'})` and then `location.replace(...)`s on to
Buy Me a Coffee (`.replace`, not `.href` — so the redirect never leaves an entry in the
phone's history; hitting "back" after landing on Buy Me a Coffee goes to wherever the scan
came from, not back into this page). The on-page `<a>` itself is untouched — its `href` still
points straight at Buy Me a Coffee, so clicking the image on a screen stays exactly as fast as
before (already tracked via its own `onclick`, `source:'qr'`); only an actual camera scan
detours through `bmc.html`. Generated with `qrencode` (`brew install qrencode`) and verified
with a `zbar` round-trip decode of the rendered SVG before shipping, same discipline as the
QR's first version.

`bmc.html` deliberately fails none of the repo's shared-file audits despite being a `.html`
file that isn't a game: `unit/presence.test.js`'s and `unit/common-names.test.js`'s checks are
all content-filtered (they only act on files containing `guestConns`, `connectedPlayers`,
`type: 'join'`, etc.), so a minimal page with none of that is simply skipped by every one of
them except the cache-busting check — which it must still pass, so it loads `common.js` with
the same `?v=` token as every other page.

## Google Ads (AdWords) — not set up yet

Deliberately not pursued so far: this is a free, non-commercial site (BUSL 1.1, no purchase
funnel beyond a voluntary Buy Me a Coffee link), so paid clicks have nothing to recoup spend
against. Cheaper alternatives discussed first: direct link-sharing (the whole game is built
around "scan a QR / send a room code"), posting in family-game or board-game communities, and
basic SEO (title/meta description, an OG image for link previews) — all zero-cost.

If it does go ahead, the agreed setup is:

1. **Create the Ads account** at ads.google.com, same Google account as the GA4 property.
   Use **Expert mode**, not the guided "Smart" setup.
2. **Link Ads to GA4**: GA4 → Admin → Product Links → Google Ads Links → Link.
3. **Import `room_created`/`room_joined` as Ads conversions** (only possible once the Key
   Event item above is done): Ads → Tools & Settings → Conversions → Summary →
   + New conversion action → Import → Google Analytics 4 properties.
4. **Campaign**: Search only (uncheck Display Network + Search partners), objective
   "Website traffic" or no-goal Expert setup, budget **$5–10/day** to start, "Maximize
   clicks" with a capped max CPC (e.g. $0.50) or manual CPC.
5. **Targeting**: actual target country/region, not global; no device exclusions (expect
   mobile to dominate given the QR-join flow).
6. **Keywords** (phrase match): `free multiplayer party games online`,
   `games to play with family over video call`, `no download multiplayer games phone`,
   `online party games for family game night`.
   **Negatives**: `download`, `apk`, `jobs`, `buy`, `casino real money` (the card games —
   Blackjack, Go Fish, I Doubt It — otherwise pull in real-money-gambling search intent that
   bounces immediately).
7. **Ad copy**: responsive search ad, final URL `https://haddley.github.io/games/`. Lean on
   what's actually true and differentiating — no app, no sign-up, play in-browser via a QR
   code, works across any network (not just same-wifi).
8. **Launch capped**, then watch **GA4 → Realtime** for `room_created` events carrying a
   `google` / `cpc` source, to confirm attribution is wired correctly before leaving the
   budget to run unattended. Treat the whole thing as a small, capped experiment — not an
   ongoing spend — given there is nothing to sell.
