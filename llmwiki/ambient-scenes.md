# Ambient scene engine — `mountScene` (repo-wide)

A lively little scene along the **bottom of the TV/viewer screen**: themed figures
amble back and forth (turning to *face* their travel), props sway on the ground, and
a couple of things flit above. Lives in `common.js`; each game opts in with one
guarded line. This is a *newer, separate* layer from the per-game drifting
backgrounds documented in [animation-conventions.md](animation-conventions.md) —
those still exist behind `#app`; the scene is the walking strip along the very
bottom.

## Usage

```js
typeof mountScene === 'function' && mountScene('pirates');   // most games
typeof mountMeadow === 'function' && mountMeadow();          // alias for mountScene('meadow')
```

- Injects its own scoped stylesheet (everything under `#meadow`, keyframes `mdw-*`
  so it can't collide with a game) and builds the scene once.
- Shows only under `body.viewer-mode` **or** `body.tv-mode` (ticktacktoe uses the latter).
- Lifts the viewer root (`body.viewer-mode #app`, or a passed selector) to `z-index:1`
  so content sits above the scene (which is `z-index:0`, fixed to the bottom).
- Also moves each game's `#sound-togs` / `.audio-togs` to the **bottom-right** in
  TV mode (so they don't collide with the tvLobby ⛶ button top-right).
- Motion is killed under `prefers-reduced-motion`; the flock still stands there.

## Themes (`SCENE_THEMES` in common.js)

- **CSS-drawn actors** (higher fidelity, hand-built): `meadow` (woolly sheep flock +
  border collie — herdmind\*/oddsheep), `cows` (Holstein dairy cows — herdmind),
  `bingo` (glossy numbered BINGO balls, B1-15…O61-75 — *not* pool balls).
- **Emoji actors** (a ground palette + `walk`/`props`/`fly` emoji lists): `pirates`
  (liarsdice), `night` (wolves/bats — moonlightvillage), `letters` (boggle/boggleparty),
  `library` (familytrivia), `carnival` (categoryclash), `art` (brokenpencil/doodleparty),
  `auction` (goinggone), `masks` (fibbers), `mystery` (bestguess), `market` (bulls/bears —
  pit), `tictactoe` (❌/⭕), `rps` (✊✋✌️ — rockpaperscissors).

\* herdmind uses `cows`; oddsheep/`meadow` keeps the sheep.

## How the motion works (shared keyframes)

- **Walkers** amble left/right via `mdw-ambleR`/`mdw-ambleL` (`translateX` + `scaleX`
  flip so the figure *faces* its direction — left-half start walking right, right-half
  left, so they stay on screen). A bob keyframe adds a walking hop. **Bingo balls** use
  `mdw-driftR/L` (no flip) so the printed numbers stay upright.
- **Props** sway (`mdw-sway`), **flyers** cross with a flutter (`mdw-flit`/`mdw-flitBob`).
- The ground is a lit gradient hill (theme colours via `--g1/--g2/--glow`) with a warm
  glow so figures read against a dark screen.

## Adding / theming

- New emoji theme = one line in `SCENE_THEMES`: `{ g1, g2, glow, walk:[…], props:[…], fly:[…] }`.
- New CSS actor = a `*_CSS` block + a `_build*` function + a `t.<flag>` branch in
  `mountScene` (see `_buildSheep`/`_buildCows`/`_buildBingo`).
- Tune an existing theme's cast/colours right in `SCENE_THEMES`.
