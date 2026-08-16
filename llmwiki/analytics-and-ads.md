# Analytics and Ads

GA4 is live and wired into `common.js` (see CLAUDE.md's "Google Analytics (GA4) and Ads"
section for the code-level facts — property ID, where `trackEvent`/`gameSlug` live, exactly
which events `p2p.js` and `index.html` fire and why). This page is the operational/setup
side: what's been done in the GA4 **UI** (not the repo), what's still open, and the Ads setup
steps for whoever picks this back up.

## ✅ Done: `room_created` / `room_joined` / `bmc_click` marked as GA4 Key Events

**Resolved 2026-08-13.** All three are now starred under Admin → Events → Recent events
(confirmed by screenshot — the delay noted below turned out to be under an hour in practice,
not the full 24–48h ceiling GA4's own UI warns about). They now feed GA4's "Key events"
report card and are available to import as Google Ads conversions, if/when Ads gets set up —
see below, including the standing recommendation to **hold off** given there's still nothing
to sell on this site.

<details><summary>Original troubleshooting notes (kept for reference)</summary>

Both events were confirmed firing correctly in production (verified via a real host+join
round-trip on the live site, and visible with real counts in a GA4 Explore "Event count by
Event name" report) before they appeared in Admin → Events → Recent events — GA4's admin
event-name list can lag real reporting data by up to ~24–48h even though the underlying hits
are already being counted. Fixed by: GA4 → Admin → Events → **Recent events** tab (not "Key
events" — that tab only lists events already starred) → star each one.

</details>

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

## Google Ads (AdWords) — live

**Launched 2026-08-13** as a deliberately tiny first test — this is a free, non-commercial
site (BUSL 1.1, no purchase funnel beyond a voluntary Buy Me a Coffee link), so the point was
to confirm the whole chain (ad → click → site → GA4) actually works before spending anything
real, not to run a real acquisition campaign.

**As configured:**
- Campaign: **"Search - Game Night"** (renamed from the auto-generated "Search GAME NIGHT"),
  type Search, Networks = Google Search Network only (Display Network and Search Partners
  both deliberately off). Ad group renamed from the default "Ad group 1" to
  **"Free Party Games"**.
- Bidding: **Maximize clicks**, max CPC cap **$0.10**.
- Budget: **$1/day** (intentionally minimal for the first test — see below).
- Locations: **Australia, New Zealand, United Kingdom, United States** — a deliberate choice
  for broader English-speaking reach, not a mistake (an earlier draft of this doc's advice
  said "one country, not global"; the actual owner overrode that on purpose).
- Final URL: `https://haddley.github.io/games/`.
- Keywords: 5 entered, only **2 are actually Eligible** — `"game night"` (phrase match) and
  `free multiplayer party games online` (broad match). The other 3
  (`games to play with family over video call`, `online party games for family game night`,
  `no download multiplayer games phone`) show **Not eligible — Low search volume**: real
  phrases, right intent, just not things people type verbatim into Google often enough to
  clear its threshold. Not a bug — natural-language long-tail phrases frequently land here.
  Left as-is since $1/day doesn't need much volume to spend; shorter, more commonly-searched
  terms (`party games`, `multiplayer games online`, `virtual game night`) are the fix if
  broader reach is wanted later.
- Ad: one Responsive Search Ad, 8 headlines / 3 descriptions, Ad strength **89.9% ("Average")**
  — fine to launch with, not a blocker.

**Known Google Ads UI quirk hit repeatedly during setup**: Budget, Locations, and Bidding each
silently reverted to a Google-recommended default (a $0.39/day auto-budget, all-country
targeting, "Maximize conversions") at least once after being set correctly, with a
"Changes failed to save" error showing alongside. Re-entering the value and refreshing the
page to confirm it actually held is the fix — worth remembering as a "verify, don't trust the
UI" step if this campaign (or a future one) needs editing again.

**✅ Done since:**
- **Negative keywords** — live at account level: `download`, `apk`, `jobs`, `buy`,
  `casino real money` (Negative Broad), added via Google Ads Editor and confirmed present in
  a full account CSV export.
- **`room_joined` imported as an Ads conversion action** — via Goals → Conversions →
  + New conversion action → the "create multiple conversion actions from a linked account"
  path (not the generic category cards — those are for actions with no GA4 event behind
  them). Categorised as **Engagement**, which is genuinely more accurate than the "Sign-up"
  fallback first suggested; confirmed as its own **Account-default** goal, Active, applied to
  the campaign — no extra step needed once it showed as its own goal card (an earlier "Group
  1/2/3 goals" panel on the same page turned out to be an unrelated display-only feature, not
  something this needed to be added to).

**⏳ Still open — a genuine anomaly, not just pending work:**
- **`room_created` will not appear in Ads' "Import from GA4" event picker**, despite being
  confirmed in GA4 itself as a starred Key Event, Active, with real data (2 recorded events
  from 1 user — genuinely *more* activity than `room_joined`, which imported without issue on
  the same linked property). Waiting longer hasn't fixed it (checked again after several
  days, not just hours) — GA4↔Ads sync lag was the first theory and is now ruled out by the
  elapsed time and by `room_created` having *more*, not less, data than the event that did
  import cleanly. If this keeps failing, the next step is contacting Google Ads support
  directly with these specifics (Key Event, Active, real data, same property as
  `room_joined`, still absent from the picker) — this is no longer something to keep
  retrying alone.
- **Confirm attribution end-to-end** once the campaign starts actually serving: check
  **GA4 → Realtime** for a `room_created` event carrying a `google` / `cpc` source. That's
  the one signal that proves the whole ad→click→site→GA4 chain works, more trustworthy than
  any number in the Ads dashboard itself.
