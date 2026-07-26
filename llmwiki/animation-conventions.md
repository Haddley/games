# Animation & graphics conventions (repo-wide)

The "house style" for making a game feel alive. Reference implementations:
**brokenpencil.html, herdmind.html, cornerthemarket.html, letterstorm.html**. See also the "Audio &
animation conventions" section of the root `CLAUDE.md`. Every game got an animation-polish
pass; this records what "good" looks like so future work stays consistent.

## The five pillars

> **Update:** ambient decoration now has TWO layers — the per-game drifting **background**
> below (pillar 1), *plus* a shared **[ambient scene](ambient-scenes.md)** engine
> (`mountScene`) that walks themed figures along the very bottom of the TV screen (sheep,
> cows, bingo balls, pirates, wolves, letters, …). The scene lives in `common.js`, not
> per-game. Both coexist.

1. **Themed ambient background layer.** A decorative, `pointer-events:none`, low-opacity
   layer BEHIND `#app` (z-index below content), built ONCE on load (never rebuilt on
   patches), gently drifting/floating, matched to the game's theme & palette. This was the
   single biggest upgrade in the polish pass — most games had none. Examples now live:
   - pit `#pit-crowd` (waving multi-colour trader crowd + floor paper)
   - herdmind `#meadow` (grazing sheep) + `#sky-bg`; brokenpencil `#doodle-bg`
   - boggle `#tilefield` / letterstorm `#letterfield` (drifting letter tiles)
   - liarsdice `#ld-bg` (drifting dice); ticktacktoe `#ttt-bg` (drifting X/O)
   - bingo floating balls; goinggone gavels/$; moonlightvillage moons/wolves;
     familytrivia story motes; categoryclash neon letters; bestguess ?/coins;
     fibbers masks/bubbles; oddsheep sheep/clouds

2. **Entrance animations gated on a "fresh" flag.** Staggered reveal of cards/rows/tiles
   that runs ONLY on a real screen/phase change (e.g. pit's `#app.fresh`), never on
   same-screen patches — so in-progress interaction is never re-triggered.

3. **Scoring / key-action FX.** A particle `burst(x,y,colors,n)` + floating `popText`
   at the moment points land or a big action resolves. **Both now come from the shared
   `fx.js`** (see [shared-core.md](shared-core.md)) — `burst` injects its own particle CSS
   and takes your palette; `popText` uses each game's own `.pop`/`.pop.*` CSS, so colours
   stay per-game.

4. **Elevated win/podium moment.** `startConfetti` (also from **`fx.js`** — owns one
   `#fx-confetti` canvas, reads your `const CONFETTI_COLS`) + optional `emojiRain` (still
   inline) + a shine sweep on the winner; each game's `sWin()` quotes its own lobby melody
   as a hummable motif. Audio primitives `tone()`/`startMusicLoop()` come from **`audio.js`**
   (full engine) or the pad from **`ambient.js`** (lightweight profile).

5. **Micro-interactions.** Button press scale (`:active { transform: scale(.97) }`),
   selection pulses, smooth state transitions, DOM patch-by-id for high-frequency updates.

## Hard rules (so polish never breaks anything)

- Single self-contained HTML; inline CSS/JS only; no new CDNs/deps/fonts beyond what's loaded.
- **Additive only** near tested code: never change a DOM id/class/`data-*`/`role`/visible
  text a test selects — add new decorative elements/classes instead. 13 games have e2e specs
  in `tests/`; the polish pass kept all 26 tests green.
- Every decorative JS effect early-returns on `REDUCED` (`prefers-reduced-motion`), and the
  stylesheet disables the new animations under `@media (prefers-reduced-motion: reduce)`.
- Keep BOTH phone (390×844) and TV (1920×1080, `vmin` units) layouts working.
- Ambient layers must be `pointer-events:none` so they can't intercept taps.

## Verifying visually

Use the [simulation modes](simulation-modes.md): load `?mode=tvsimulation` /
`?mode=playersimulation`, watch the game auto-play, screenshot, iterate. Confirm zero
`pageerror`s in both modes before shipping.

## The exception: sprites (Plump Trek's player pieces)

Everything above describes animating **drawn** things — CSS shapes, transforms, keyframes on
properties. Plump Trek's player pieces do not work that way and deliberately break several of
the conventions on this page, so don't "fix" them to match:

- **The animation is a flipbook, not a tween.** Every idle, the walk cycle and each reaction
  is a fixed sequence of whole frames off one sprite sheet, stepped with `step-end`. A
  half-frame is a rendering bug, not a smooth interpolation — a unit test asserts every
  keyframe lands on a whole frame.
- **`animation-duration` is a multiplier, not a value.** Mood scales each piece's own
  name-derived tempo (`calc(var(--idle) * var(--mf))`), so a fed-up trekker still moves like
  itself, just heavily.
- **Two animations on one element is normal here.** Where an idle both steps frames and moves
  the piece, the frames run on `step-end` and the transform on `ease` — one animation can't
  do both without either sliding the sheet through half-frames or making the motion snap.

It obeys the two rules that actually matter, though: everything early-returns on `REDUCED`
and the reduced-motion media query kills the lot, balloons included; and high-frequency
updates still patch by id rather than re-rendering.

Full reference: [sprites-and-licensing.md](sprites-and-licensing.md).
