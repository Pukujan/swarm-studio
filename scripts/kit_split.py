"""Cut a kit strip (six pieces side by side, from games/ares/tools/sheets/cut.py) into one
trimmed, transparent PNG per piece.

python3 scripts/kit_split.py strip.webp outdir name1 name2 ... name6
  → writes outdir/<name>.png for every frame that holds a piece, and prints
    {"pieces": [{"name", "file", "size": [w, h]}], "empty": [names with nothing in them]}
"""
import json
import os
import sys

from PIL import Image


def split(strip, outdir, names, pad=4):
    im = Image.open(strip).convert("RGBA")
    n = len(names)
    cw = im.width // n
    pieces, empty = [], []
    for i, name in enumerate(names):
        cell = im.crop((i * cw, 0, (i + 1) * cw, im.height))
        box = cell.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        if not box or (box[2] - box[0]) * (box[3] - box[1]) < 400:
            empty.append(name)
            continue
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(cell.width, box[2] + pad), min(cell.height, box[3] + pad))
        out = cell.crop(box)
        file = os.path.join(outdir, f"{name}.png")
        out.save(file, "PNG", optimize=True)
        pieces.append({"name": name, "file": file, "size": list(out.size)})
    return {"pieces": pieces, "empty": empty}


if __name__ == "__main__":
    print(json.dumps(split(sys.argv[1], sys.argv[2], sys.argv[3:])))
