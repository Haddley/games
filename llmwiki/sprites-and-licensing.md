# Sprites & licensing — the third-party art in this repo

Everything in this repo is hand-written except the **player pieces in Plump Trek**, which
are sprites from **Kenney**. This page is the reference for two things a future session
needs: **why we're allowed to use them** (and what evidence proves it), and **how the
sprite animation system actually works**, because it is not like the CSS-drawn effects
everywhere else.

## The licence, in one paragraph

Kenney releases his asset packs under **Creative Commons CC0 1.0 Universal** — not a
permissive licence but a *public-domain dedication*. The author waives copyright as far as
law allows. Practically:

| | |
|---|---|
| Attribution | **Not required.** |
| Commercial use | **Allowed.** |
| Modification / repacking | **Allowed**, and derivatives carry no obligations. |
| Copyleft | **None.** CC0 cannot "infect" the rest of the repo — nothing here has to change licence because a PNG came from Kenney. |
| Share-alike | **None.** |
| Patent / trademark | CC0 waives copyright and neighbouring rights only; it says nothing about trademarks. Irrelevant here — we use art, not a brand. |

Kenney's own `License.txt` says it plainly: *"You can use this content for personal,
educational, and commercial purposes. Support by crediting 'Kenney' or 'www.kenney.nl'
(this is not a requirement)."*

**So we credit anyway.** It costs a line and it's the decent thing to do. The credit
appears in two places, both user-visible:

- `index.html` footer — "Player sprites by Kenney (CC0 1.0 — public domain)"
- `plumptrek.html` home screen, under the join buttons (`.credit`)

Do not remove those. They aren't a licence obligation; they're the repo's own policy, and a
test asserts they exist.

## The evidence we keep

CC0 requires nothing of us, so "compliance" here means being able to **prove the assets
really are CC0 and really came from Kenney** — the risk isn't breaching a licence, it's
someone later being unable to tell where a PNG came from. Everything needed sits in
`sprites/`:

```
sprites/
  LICENSE                      "this directory is CC0, not BSL" — so the folder is
                               self-describing if anyone copies it out on its own
  trekkers.png                 the 30-piece cast sheet we ship
  emotes.png                   the 12 emote balloons we ship
  CREDITS.md                   provenance: pack, version, URL, date, SHA-256, what we changed
  build-sheets.py              rebuilds both sheets from the upstream zips
  licenses/
    CC0-1.0.txt                          the full CC0 1.0 legal code, local copy
    kenney_new-platformer-pack_License.txt   verbatim, from inside the zip
    kenney_emotes-pack_License.txt           verbatim, from inside the zip
```

## How this sits with the repo's own licence

The repository is licensed **Business Source License 1.1** (`/LICENSE`) — source-available,
non-commercial production use granted, converting to Apache 2.0 on the Change Date. That
covers *our* work: the game code, the decks, the written content.

It explicitly does **not** cover the sprites. CC0 is a public-domain dedication and cannot
be withdrawn — repacking frames into a sheet creates no new restriction — so putting a
BSL over `sprites/*.png` would be both wrong and unenforceable. The carve-out is stated in
three places on purpose:

1. `/LICENSE` — "Third-party material — NOT part of the Licensed Work"
2. `sprites/LICENSE` — so the directory is self-describing if copied out alone
3. `sprites/CREDITS.md` — a one-line summary at the top

`sprites/build-sheets.py` is our own code, so that one *is* BSL.

Four kinds of evidence, in increasing strength:

1. **The upstream `License.txt`, verbatim** — Kenney's own words that the pack is CC0.
2. **A local copy of the CC0 1.0 legal code** — so the repo is self-contained if
   creativecommons.org ever moves.
3. **`CREDITS.md`** — pack name and version, the exact download URL, the date, the file
   size and the **SHA-256 of the zip**. That hash is what ties our PNG to *that* release of
   *that* pack, not "some Kenney pack, probably".
4. **`build-sheets.py`** — the strongest one. It rebuilds both sheets from the upstream
   zips, and its output is **byte-identical** to what we ship. Anyone can therefore verify
   the sheets contain nothing but the CC0 frames listed in `CREDITS.md` — no fourth-party
   art crept in.

To re-verify:

```sh
python3 sprites/build-sheets.py <new-platformer-pack.zip> <emotes-pack.zip>
git diff --stat sprites/    # must be empty
```

**If you ever add another third-party asset, do all four.** `unit/plumptrek.test.js` has a
test ("the sprite sheets are in the repo, with their licences") that fails if any of these
files goes missing or the recorded hashes change.

### What we deliberately did NOT use

- **Platformer Characters 1** (also CC0, hash in `CREDITS.md`) was downloaded and rejected:
  its 2017 art doesn't sit next to the 2025 pack, and its five casts are five different
  *people* rather than five colours, which is worse for telling players apart. Nothing from
  it is in the repo.
- **LPC / OpenGameArt character sets** — mostly CC-BY-SA or GPL. Copyleft on art is a trap
  for a repo like this, so they were ruled out before downloading.
- **Third-party *characters*** (memes, film, games) — see CLAUDE.md's naming convention.
  Mechanics can be borrowed; someone's character cannot.

## The sprite system (plumptrek.html)

The rest of the repo animates with CSS transforms on drawn shapes. Sprites are different:
the animation is **predetermined frames**, a flipbook, and that is the point — Neil asked
for exactly this after the hand-drawn creatures came out lifeless.

### The sheets

**`sprites/trekkers.png`** — 756×510, **9 poses across × 5 characters down**, cell 84×102.

```
--f:   0 idle · 1 walk_a · 2 walk_b · 3 jump · 4 hit
       5 duck · 6 front · 7 climb_a · 8 climb_b
--row: 0 human · 1 alien · 2 cyclops · 3 monster · 4 duck
```

**All nine poses the pack ships**, because a frame left in the zip is an expression the game
can't make. Every one is used: `idle` rests, `walk_a`/`walk_b` are the walk cycle, `jump`
celebrates, `hit` is a genuine frown, `duck` is a crouch, `front` looks you in the eye (and is
the still frame used in lists and buttons via `miniTrekHTML`), and the two `climb` frames —
back turned, arms up — loop as `.trk.strain` for a trekker held up at a gate. A held frame
says "stopped"; a climb loop says "still trying", which is what a STOP square is.

Every frame was cropped from the source PNGs with **one fixed box**, not per-frame bounding
boxes — otherwise the feet shift between frames and a walk cycle bounces.

### The `?v=` token is load-bearing

The sheets are referenced as `url(sprites/trekkers.png?v=9x5)` and
`url(sprites/emotes.png?v=12x1)`. A sheet's **grid is a contract with the CSS**: change the
number of rows or columns and a browser still holding the old PNG windows each cell across
*two* frames. You get sliced half-trekkers, with no console error and nothing to point at.
It happened the moment this sheet went from 7 columns to 9.

**If you rebuild a sheet with a different layout, bump the token.** A unit test checks the
token agrees with the `background-size` it documents.

**`sprites/emotes.png`** — 768×76, **12 balloons in one row**, cell 64×76. Kenney's Emotes
Pack ships 8 balloon shapes in both pixel and vector renderings; we use **vector Style 2**,
the outlined balloon whose tail points *down* at the character's head, because it's the one
that stays legible at token size.

```
--e: 0 happy · 1 angry · 2 sad · 3 laugh · 4 alert · 5 question
     6 sleep · 7 star · 8 heart · 9 idea · 10 drop · 11 music
```

### Thirty pieces from five characters

The art is a **white helmet, dark eyes and one saturated body colour**. A CSS
`filter: hue-rotate()` therefore recolours the body and leaves the face alone — which is how
five characters become thirty pieces: 5 characters × 6 hues, 60° apart.

```js
const TREK_CAST = [ [row, hueDeg, '#colour'], … ];   // 30 entries
const PAWN_COLS = TREK_CAST.map(c => c[2]);
const AUTO_SEATS = 12;                               // the front of the list
```

**Thirty rather than twelve on purpose.** A room only ever holds twelve, so with thirty on
offer a deliberate pick usually just works and the "sorry, taken" path is rare.

**The first twelve are special.** They're what the host hands out when you didn't pick, or
when the piece you wanted was gone: chosen so no two are closer than 15° of hue with no more
than three of any one character, so a room that never touches the picker still ends up with a
legible board. Unit tests hold both properties.

The colours are **not guesses**: each was read off the actual hue-rotated sprite using the
same `feColorMatrix` maths the browser applies, so a player's disc glow, rail chip and piece
are genuinely the same colour.

### Picking a piece

You tap a trekker on the home screen before joining (`.trekpick`, `fSeat`, stored under
`trek-seat`). One is pre-picked at random so you can just play. Your pick travels in the
join message as `seat`, and **the host grants it** (`hostAddPlayer`) — you can't know from
outside the room which pieces are taken, so a pick is a request:

- free → you get it
- taken → you get **a random free piece from the first twelve**. Random, so a busy room
  doesn't fill left-to-right and two late joiners don't predictably end up as neighbours —
  but drawn from the well-spread pool, so the replacement is never a near-lookalike of
  somebody already on the board. "Random-looking, not actually indifferent."
- nonsense (`undefined`, `-1`, `99`, `'duck'`) → a real free piece
- full room → the join is refused, as before

**In the lobby we know more, so we say more.** `lobbyMsg` carries `taken`, and the same
picker is rendered again with taken pieces greyed, crossed and untappable, your actual piece
selected, and the label changed to "Your piece — tap to swap". Switching sends
`{type:'seat'}` and `hostSetSeat` grants or refuses it (lobby only, never mid-game). On the
home screen nothing is disabled, because out there we genuinely don't know — so the picker
says so: *"Someone may already have your pick — you'll be given another if so."*

`p.seat` (0–11) and `p.col` are both on the player and go out on the wire. There is **no
emoji avatar any more** — the sprite *is* the piece. Showing both read as two playing
pieces for one person.

### Animation

Nothing is tweened. Every idle is a keyframe track that steps `background-position-x`
between whole frames, with `step-end` timing so each keyframe **holds** its frame.

- **Six idles** — `i-shuffle`, `i-peek`, `i-hop`, `i-crouch`, `i-sway`, `i-pace` — dealt
  from a hash of the player's name, each on its own duration and delay so a pile never
  marches in step.
- **Idles that also move the piece run two animations on one element**: frames on
  `step-end`, transform on `ease`. One animation can't do both — a shared timing function
  either slides the sheet through half-frames or makes the motion snap.
- **Walking between squares** — `flipPawns` adds `.trk.walking` for exactly as long as the
  FLIP move runs, and sets `--dir` on `.tb` so they face the way they're going. This is the
  thing a drawn token could never do.
- **Reactions** — a held pose (`.trk.rx` + `--f`) plus an emote balloon. **A pose waits for
  any walk to finish**: a held frame stops the walk cycle, so firing it immediately made a
  boosted piece slide across the board frozen mid-jump.
- **Everything early-returns on `REDUCED`**, and the reduced-motion media query kills all
  of it, balloons included.

### Mood — how the trekker is *feeling*

A reaction on its own has no memory: get trapped three turns running and you'd flinch
identically each time, which reads as a machine rather than a player. So each trekker carries
a **mood** — a running score from −3 (thoroughly fed up) to +3 (having a wonderful time).

```js
const MOOD = {};                    // id → −3…+3, client-side only, never on the wire
const MOOD_DELTA = { home: 3, boost: 2, lead: 1, card: 1, gate: -1, slip: -1, skip: -2, back: -2 };
```

Five buckets: `glum · down · ok · chuffed · elated`. Mood changes two things.

**1. How they wait.** `MOOD_LOOK` sets five CSS variables on the piece, and every one of them
moves monotonically from glum to elated — a unit test enforces that, so nobody can tune one
dial the wrong way:

| | glum | down | ok | chuffed | elated |
|---|---|---|---|---|---|
| `--mf` idle tempo × | 1.8 | 1.35 | 1 | 0.82 | 0.62 |
| `--tilt` lean forward | 7° | 4° | 0 | −2° | −4° |
| `--slump` sag | 6% | 3% | 0 | −2% | −4% |
| `--sat` colour | 0.55 | 0.78 | 1 | 1.08 | 1.18 |
| `--bri` brightness | 0.82 | 0.92 | 1 | 1.05 | 1.1 |
| balloon every | 9s | 13s | 16s | 11s | 7s |
| which balloons | sad, drop, sleep | sad, question | *the one their name dealt them* | happy, music | laugh, star, heart |

`--mf` **multiplies** their own name-derived tempo rather than replacing it, so a fed-up
trekker still moves like themselves — just heavily. Neutral is the untouched baseline (all
1s and 0s), so a player with nothing to feel looks exactly like themselves. The colour drain
is what makes a rail of twelve readable from the sofa: the miserable ones are visibly duller.

Two CSS gotchas worth knowing:

- Custom properties inherit **downward**, so the mood vars live on the `.tb` wrapper: `.tb`
  uses `--tilt`/`--slump` for the posture and `.trk` inherits `--mf`/`--sat`/`--bri`.
- The `.i-*` idle rules use the `animation` shorthand and come *after* `.trk`, so they'd
  clobber any `animation-duration` set there. The multiplier therefore goes **inside each
  shorthand** — `animation: iSway calc(var(--idle) * var(--mf)) …` — including the second
  half of the two-animation idles, or the frames and the motion drift apart.

**2. How they react.** `REACTIONS[kind][bucket]` is `[emote, pose, holdMs]`. The same event
reads differently depending on the mood it lands on: being sent backwards is *indignation*
normally, a longer *sulk* (the duck frame, a sad balloon, held 1.8s) if you were already
miserable, and *startled* if you were flying. A boost when you're glum is relief, not a
victory dance. `down` and `chuffed` borrow the nearer extreme rather than falling through to
neutral.

**The subtle rule:** the mood a reaction reads is the one the event **landed on**, not the one
it leaves behind. `moodPass` pushes `[id, kind, moodOf(id)]` *before* calling `bumpMood`. Get
this backwards and a single trap sours you to glum and is then played as a glum trekker's
sulk — so nobody ever gets the first-time reaction, and "still fed up" stops meaning
anything. A unit test greps `moodPass` for the ordering.

**Mood fades**, one step toward neutral each time the turn comes back round to you
(`if (after.turn !== before.turn) fadeMood(after.turn)`). So a bad break sours you for two or
three of your own turns and then you get over it, which is roughly how it goes at the table.
`resetMoods()` on any return to the lobby — nobody carries a grudge into the next game.

**Ordering matters in the message handlers.** Moods are updated *before* `render()` so the
trekkers are drawn already feeling it, and the reactions play *after* it so they land on the
new tokens:

```js
const events = moodPass(before, msg);   // mood first
… render();
flipPawns(where);                       // then the walk
playReactions(events);                  // then the reaction
```

### Reactions come from diffing snapshots

The host sends nothing extra. `reactPawns(before, after)` compares the snapshot that
arrived with the previous one, so phones and the TV react to the same events on their own:

| what changed | pose | balloon |
|---|---|---|
| `pos` went backwards | hit | angry |
| `skip` went up | duck | sleep |
| `pos` jumped further than a die could | jump | laugh |
| `done` became true | jump | star |
| drew a card | — | idea |
| became the leader | — | happy |
| a card is waiting on you | — | alert (drop, if it's a dare) |

Reactions land on **every** copy of that player on screen — the piece on the board *and*
the portrait in the rail — via `[data-p="<id>"]`. They're the same person in two places and
it looks wrong if only one of them flinches.

### The one rule that keeps the two copies together

A player appears twice: on the board and in "the pack" rail. Both are built by the same
`creatureHTML(pl, now)`, both get the same `--dl` beat and `--idle` duration, and both are
created in the same render pass — so they animate in lockstep.

**Anything that changes how a piece moves must be expressed on the trekker itself, not on
the board token.** The eager-on-your-turn speed-up originally hung off `.tok.up`, which the
rail has no equivalent of, so the piece you were watching ran at a different speed from its
own portrait. It's now `.trk.now`, set from `p.id === d.turn` in both places. An e2e test
pins it ("the active player speeds up in the rail and on the board by the same amount").

### Stacking

Up to twelve players can share one square, and they **stack**. Two numbers make the
difference between a readable pile and a pile of legs:

- **The step is a head's worth.** A trekker is a big round helmet on a small body, so the
  vertical step is ~45% of the sprite's height — enough that every face in the tower shows.
  The first attempt used a much smaller step and each piece planted its feet on the face
  below it.
- **Above four players the pile splits into two side-by-side towers**, so twelve people are
  two stacks of six (about one and a bit squares tall) rather than a skyscraper.

Lower pieces are drawn **in front** (`--k: n - row`), so each face covers the feet of the
trekker above it. On top of that the pile sways as one, riffles open every few seconds so
buried players get their moment, and whoever's turn it is sits on top, scaled up and glowing.

## Gotchas, all of them learned the hard way

Every one of these produced a symptom with no error message:

| symptom | cause |
|---|---|
| **Blank page, no QR** | A module-level `const` (`REACTIONS`) initialised from a name declared further down the file (`EMO`). `const` is in its temporal dead zone until its line runs, so it threw at load. In a single-file game that's the whole game gone. The sheet-index constants now sit above the first `const` that reads them, with a comment saying why. |
| **Sliced half-trekkers** | A cached PNG against new CSS after the sheet went from 7 to 9 columns. Hence `?v=9x5`. |
| **A pile of legs** | The stack step was smaller than a helmet, so each piece planted its feet on the face below. The step is now ~45% of the sprite's height, and above four players the pile splits into two towers to stop that being a skyscraper. |
| **Only the top face visible** | Higher pieces were drawn in front. Reversed (`--k: n - row`): lower pieces in front, so each face covers the feet of the trekker above. |
| **A boosted piece sliding across frozen mid-jump** | A reaction pose is a *held* frame, which stops the walk cycle. Poses now wait for `trk._walkUntil`. |
| **The board piece and its rail portrait out of step** | The eager-on-your-turn speed-up hung off `.tok.up`, which the rail has no equivalent of. It's `.trk.now` now, and an e2e test pins it. Rule: anything that changes how a piece moves goes on the trekker, not on the board token. |
| **Mood ignored** | The `.i-*` idles use the `animation` shorthand and come *after* `.trk`, so they clobber its `animation-duration`. The `--mf` multiplier goes inside each shorthand — both halves of the two-animation idles. |
| **Every trap reading as a sulk** | `moodPass` bumped the mood before recording the event, so the reaction saw the post-event mood. It now snapshots the mood the event *landed on*. |
| **Two playing pieces per player** | The rail showed the sprite *and* the emoji avatar. The sprite is the avatar; the emoji is gone. |
| **A mirrored emote balloon** | The balloon was inside `.tb`, which flips with `scaleX(-1)` when walking left. It's a sibling now. |
| **A pale lilac human beside a pale lilac monster** | Auto-assignment picked the next free seat out of 30. It now picks at random from the first 12, which are chosen to be ≥15° of hue apart. |

## If you need more Kenney art

Kenney's download links are **not in the page HTML** — the button opens a lightbox and the
real URL is in the "Continue without donating" anchor inside it. To find it without a
browser:

```sh
curl -sSL https://kenney.nl/assets/<pack-slug> | grep -oE "https://kenney.nl/media/pages/assets/[^']*\.zip"
```

Then follow all four evidence steps above before committing anything.
