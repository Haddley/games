#!/usr/bin/env python3
"""Rebuild sprites/trekkers.png and sprites/emotes.png from the upstream Kenney zips.

This script is the audit trail for the third-party art in this repo: it takes the two CC0
zips exactly as they come off kenney.nl and produces the two sheets we ship, so anyone can
verify the sheets hold nothing but the source frames listed in CREDITS.md. It prints the
SHA-256 of each input for comparison against the ones recorded there.

    python3 sprites/build-sheets.py <new-platformer-pack.zip> <emotes-pack.zip>

Needs Pillow. Nothing in the games needs this — it's a one-off tool.
"""

import hashlib
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent

# Which poses, in which order, across the sheet — ALL NINE the source pack ships per
# character, because a frame left in the zip is a facial expression the game can't make.
# The names are the animation vocabulary plumptrek.html drives: idle/walk/climb are loops,
# the rest are one-shot reactions.
FRAMES = ['idle', 'walk_a', 'walk_b', 'jump', 'hit', 'duck', 'front', 'climb_a', 'climb_b']
# Which characters, top to bottom. Seat colour comes from a CSS hue-rotate on top of these.
CHARS = ['beige', 'green', 'pink', 'purple', 'yellow']
# The union bounding box of all 35 source frames inside their 128×128 canvas. Cropping every
# frame to the SAME box is the whole trick — a per-frame bbox would shift the feet between
# frames and the walk cycle would bounce.
BOX = (22, 26, 106, 128)

# 12 of the pack's 30 balloons, in the order plumptrek.html indexes them.
EMOTES = ['faceHappy', 'faceAngry', 'faceSad', 'laugh', 'exclamation', 'question',
          'sleep', 'star', 'heart', 'idea', 'drop', 'music']
EMOTE_STYLE = 'PNG/Vector/Style 2'      # outlined balloon, tail pointing down at the head
EMOTE_SCALE = 2                         # 32×38 sources are small; 2× for retina/TV


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(zf, name):
    """Open a member by suffix match, so a repackaged zip with a top-level folder still works."""
    hits = [n for n in zf.namelist() if n.endswith(name)]
    if not hits:
        sys.exit(f'not found in zip: {name}')
    return Image.open(io.BytesIO(zf.read(hits[0]))).convert('RGBA')


def build_cast(zip_path):
    cw, ch = BOX[2] - BOX[0], BOX[3] - BOX[1]
    sheet = Image.new('RGBA', (cw * len(FRAMES), ch * len(CHARS)), (0, 0, 0, 0))
    with zipfile.ZipFile(zip_path) as zf:
        for r, c in enumerate(CHARS):
            for col, f in enumerate(FRAMES):
                src = read(zf, f'Characters/Default/character_{c}_{f}.png')
                sheet.paste(src.crop(BOX), (col * cw, r * ch))
    sheet.save(OUT / 'trekkers.png', optimize=True)
    print(f'trekkers.png {sheet.size[0]}×{sheet.size[1]}, cell {cw}×{ch}')


def build_emotes(zip_path):
    with zipfile.ZipFile(zip_path) as zf:
        src = [read(zf, f'{EMOTE_STYLE}/emote_{e}.png') for e in EMOTES]
    w, h = src[0].size
    ew, eh = w * EMOTE_SCALE, h * EMOTE_SCALE
    sheet = Image.new('RGBA', (ew * len(src), eh), (0, 0, 0, 0))
    for i, im in enumerate(src):
        sheet.paste(im.resize((ew, eh), Image.LANCZOS), (i * ew, 0))
    sheet.save(OUT / 'emotes.png', optimize=True)
    print(f'emotes.png {sheet.size[0]}×{sheet.size[1]}, cell {ew}×{eh}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    cast_zip, emote_zip = sys.argv[1], sys.argv[2]
    for p in (cast_zip, emote_zip):
        print(f'{digest(p)}  {p}')
    build_cast(cast_zip)
    build_emotes(emote_zip)
    print('compare the hashes above with sprites/CREDITS.md')
