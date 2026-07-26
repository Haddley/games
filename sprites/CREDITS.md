# Third-party art in this repo

> **Licensing in one line:** this directory is **CC0 public domain** and is explicitly
> carved out of the repository's Business Source License — see [`LICENSE`](LICENSE) here and
> the "Third-party material" section of [`../LICENSE`](../LICENSE).

Everything in `sprites/` is derived from **Kenney** asset packs, all released under
**Creative Commons CC0 1.0 Universal** — a public-domain dedication. Under CC0 the author
waives copyright entirely: no attribution is required, commercial use is fine, and there is
**no copyleft**, so nothing here places any licence obligation on the rest of this repo.

We credit Kenney anyway, because it's the decent thing to do and Kenney asks nicely
("Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)"). The credit
appears on the launcher footer (`index.html`) and in Plump Trek's How-to-play panel.

## Provenance

| | |
|---|---|
| **Author** | Kenney Vleugels — https://kenney.nl |
| **Licence** | CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/ |
| **Downloaded** | 26 July 2026, direct from kenney.nl |

### 1. New Platformer Pack 1.1 → `trekkers.png`

- Page: https://kenney.nl/assets/new-platformer-pack
- File: `kenney_new-platformer-pack-1.1.zip` (3,276,507 bytes)
- URL: `https://kenney.nl/media/pages/assets/new-platformer-pack/1896103897-1764756702/kenney_new-platformer-pack-1.1.zip`
- SHA-256: `553b907f3f0e505ab65f56f245ccaff3123c8fe3f3a0dfce9373b996bfc18cc2`
- Pack's own licence text: [`licenses/kenney_new-platformer-pack_License.txt`](licenses/kenney_new-platformer-pack_License.txt)
- Used: `Sprites/Characters/Default/character_{beige,green,pink,purple,yellow}_{idle,walk_a,walk_b,jump,hit,duck,front,climb_a,climb_b}.png`
  — all 45, i.e. every pose the pack ships for every one of its five characters.

### 2. Emotes Pack → `emotes.png`

- Page: https://kenney.nl/assets/emotes-pack
- File: `kenney_emotes-pack.zip` (380,191 bytes)
- URL: `https://kenney.nl/media/pages/assets/emotes-pack/d00a3dcb06-1677578798/kenney_emotes-pack.zip`
- SHA-256: `96ab3f2c92d7acd860942efca1c9f1295184b11d3db5c79c28da82036e496526`
- Pack's own licence text: [`licenses/kenney_emotes-pack_License.txt`](licenses/kenney_emotes-pack_License.txt)
- Used: `PNG/Vector/Style 2/emote_*.png` — the outlined balloon style, whose tail points down
  at the character's head. (The pack ships 8 balloon shapes × pixel and vector renderings;
  Style 2 is the one that stays legible at token size.)

A third pack, **Platformer Characters 1**
(`7abbee0635e83a8f223b048579c95d9d93329c00aea0b07413beb8c0add9085d`, also CC0), was
downloaded and evaluated but **not used** — its 2017 art doesn't sit next to the 2025 pack,
and its five casts are five *different people* rather than five colours, which is worse for
telling players apart. Nothing from it is in the repo.

## What we changed

Both sheets are mechanical re-packings, no redrawing:

- **`trekkers.png`** — the 45 source PNGs pasted into one 756×510 sheet, 9 poses across ×
  5 characters down, each cell 84×102. Every frame is cropped with the *same* fixed box
  (the union bounding box, `(22,26)–(106,128)` of the 128×128 source) so the characters'
  feet sit on the same line in every pose — otherwise a walk cycle bobs.
  No resampling: the pixels are the originals.
- **`emotes.png`** — 12 of the 30 balloons in one 768×76 row, cell 64×76, upscaled 2× with
  Lanczos from the 32×38 source for retina and TV headroom.

Thirty player pieces come from five characters plus a CSS `hue-rotate` at 60° steps
(`--hue` in `plumptrek.html`), not from thirty images — the art is a white helmet, dark
eyes and one saturated body colour, so rotating the hue recolours the body and leaves the
face alone.

## The files we ship

| file | SHA-256 | layout |
|---|---|---|
| `trekkers.png` | `315da92af56cb5e5e311a9f3d9f933a46d4fce7e8ee827c3073210dc47582671` | 756×510, 9 poses × 5 characters, cell 84×102 |
| `emotes.png` | `5dec7c059567f47b49ba5204655531484e80e928e4240acbbf44689f45cf6e44` | 768×76, 12 balloons × 1, cell 64×76 |

These are what `build-sheets.py` produces from the zips above — the two hashes together are
the whole chain of custody. The **layout** column is also a contract with the CSS: the game
references the sheets as `?v=9x5` and `?v=12x1` so that changing a layout changes the URL. If
you rebuild a sheet with different rows or columns, bump the token in `plumptrek.html` or
cached copies render each window across two frames.

## Re-deriving the sheets

`build-sheets.py` rebuilds both from the upstream zips. It is the audit trail: run it
against zips matching the SHA-256s above and you get these exact PNGs, which proves the
sheets contain nothing but the listed CC0 source frames.

```sh
python3 sprites/build-sheets.py ~/Downloads/kenney_new-platformer-pack-1.1.zip \
                                ~/Downloads/kenney_emotes-pack.zip
```
