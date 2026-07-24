# Podium & scoring — tie handling (repo-wide)

Every ranked game shows a final podium/standings with medals (🥇🥈🥉). They all used
to assign the medal by **array index**, so two players with the *same* score showed
as 1st + 2nd. Fixed repo-wide with a shared helper.

## `rankByScore(list, key='score')` (in `common.js`)

Competition ranking (1-2-2-4): walk a score-descending-sorted list and reuse the
previous rank unless the score drops. Two equal scores get the **same** rank.

```js
rankByScore([{score:5},{score:5},{score:3}]) // → [0,0,2]  (joint gold, then bronze)
```

Callers pass a `key` for non-default score fields, e.g. `rankByScore(list, 'totalScore')`
(boggle) or `rankByScore(list, 'net')` (goinggone).

## How it's applied

- **Phone standings lists:** render `medals[rank]` instead of `medals[i]`.
- **TV podiums:** the medal **and** the podium block colour follow the rank. Height stays
  positional staging, but the block colour moved off `.pod.p1/.p2/.p3` onto
  **`.pod.mrank-0/1/2`** classes, so a tied-first pair both show gold blocks. boggleparty
  uses `pod-mrank-*`; each game keeps its own gold/silver/bronze palette.
- **boggle** also declares **joint winners** on a tie (`"A & B"`).
- **liarsdice / rockpaperscissors** are exempt from ties: their `rankings`/standings are a
  strict **elimination order** (champion first, then reverse elimination) — no equal ranks
  possible, so a simple index is correct there.

## Adding a new ranked game

Sort the players by score descending, call `rankByScore`, and drive both the list medal
and the podium block class from the returned rank. Don't reintroduce `medals[i]` or
position-based block colours. A copied game inherits this automatically.

Reference: `rankByScore` in `common.js`; the `mrank-*` blocks in each game's
`renderViewerPodium`; the shared core in [shared-core.md](shared-core.md).
