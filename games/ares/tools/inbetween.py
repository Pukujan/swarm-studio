#!/usr/bin/env python3
"""Double the frames of a sprite or FX strip with RIFE in-betweens, keeping transparency.

A strip is N square frames side by side (each frame is as wide as the strip is tall).
RIFE only sees RGB, so each pair is interpolated twice:
  1. the colour premultiplied by alpha, on black;
  2. the alpha itself, as a grey image.
The middle frame's colour is then divided back by its alpha.

  python3 tools/inbetween.py --rife /path/to/rife-ncnn-vulkan \
      --in assets/skins/messenger/default/m-idle.webp --loop \
      --anchors web/anchors.json --hero messenger --sheet m-idle

Writes the doubled strip over --out (default: the input; the original is kept as <name>.6f.webp),
and, with --anchors, sets that sheet's frame count n. Loops (--loop) also get a frame between
the last and first, so a 6-frame loop becomes 12; a one-shot becomes 11.

Use it on character sheets only (loops and fight moves), never on FX. On big swings RIFE morphs
two far-apart poses into a blurry ghost, so --guard holds the frame instead when the two
silhouettes overlap too little.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image


def frames_of(img, n):
    s = img.height
    n = n or img.width // s
    return [img.crop((i * s, 0, (i + 1) * s, s)) for i in range(n)]


def rife(binary, model, a, b, out, tmp):
    pa, pb = os.path.join(tmp, 'a.png'), os.path.join(tmp, 'b.png')
    a.save(pa); b.save(pb)
    cmd = [binary, '-0', pa, '-1', pb, '-o', out]
    if model:
        cmd += ['-m', os.path.join(os.path.dirname(binary), model) if not os.path.isabs(model) else model]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or not os.path.exists(out):
        sys.exit(f'rife failed: {r.stderr[-400:]}')
    return Image.open(out).convert('RGB')


def split(f):
    a = np.asarray(f.convert('RGBA')).astype(np.float32) / 255
    alpha = a[..., 3:4]
    pre = Image.fromarray((a[..., :3] * alpha * 255).round().astype(np.uint8), 'RGB')
    al = Image.fromarray(np.repeat((alpha * 255).round().astype(np.uint8), 3, axis=2), 'RGB')
    return pre, al


def overlap(f0, f1):
    a0 = np.asarray(f0.getchannel('A')) > 40; a1 = np.asarray(f1.getchannel('A')) > 40
    u = (a0 | a1).sum()
    return (a0 & a1).sum() / u if u else 1.0


def middle(binary, model, f0, f1, tmp, guard=0.0):
    if guard and overlap(f0, f1) < guard:
        return None   # too big a pose jump: RIFE would blend two ghosts, so the frame is held instead
    p0, a0 = split(f0); p1, a1 = split(f1)
    pm = np.asarray(rife(binary, model, p0, p1, os.path.join(tmp, 'pm.png'), tmp)).astype(np.float32) / 255
    am = np.asarray(rife(binary, model, a0, a1, os.path.join(tmp, 'am.png'), tmp)).astype(np.float32).mean(axis=2, keepdims=True) / 255
    am[am < 0.02] = 0
    rgb = np.where(am > 0, pm / np.maximum(am, 1e-3), 0).clip(0, 1)
    # ghost cleanup: where neither painted frame is solid, a near-black in-between pixel is RIFE
    # smearing alpha past the colour (the heroines are painted pale): drop it
    s0 = np.asarray(f0.convert('RGBA')).astype(np.float32) / 255; s1 = np.asarray(f1.convert('RGBA')).astype(np.float32) / 255
    solid = (s0[..., 3:4] > 0.5) & (s1[..., 3:4] > 0.5)
    lum = rgb.mean(axis=2, keepdims=True)
    ghost = ~solid & (lum < 0.3)
    am = np.where(ghost, 0, am)
    out = np.concatenate([rgb, am], axis=2)
    return Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rife', required=True, help='path to the rife-ncnn-vulkan binary')
    ap.add_argument('--model', default='rife-v4.6', help='model folder next to the binary')
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--out')
    ap.add_argument('--frames', type=int, default=0)
    ap.add_argument('--loop', action='store_true')
    ap.add_argument('--guard', type=float, default=0.55, help='hold instead of blending when the two silhouettes overlap less than this (0 = always blend)')
    ap.add_argument('--anchors'); ap.add_argument('--hero'); ap.add_argument('--sheet')
    o = ap.parse_args()

    img = Image.open(o.src).convert('RGBA')
    fr = frames_of(img, o.frames)
    pairs = list(zip(fr, fr[1:] + ([fr[0]] if o.loop else [])))
    out, held = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for i, (a, b) in enumerate(pairs):
            m = middle(o.rife, o.model, a, b, tmp, o.guard)
            if m is None:
                held += 1; m = a.copy()
            out += [a, m]
        if not o.loop:
            out.append(fr[-1])
    s = img.height
    strip = Image.new('RGBA', (s * len(out), s))
    for i, f in enumerate(out):
        strip.paste(f, (i * s, 0))
    dst = o.out or o.src
    if dst == o.src:
        root, ext = os.path.splitext(o.src)
        keep = f'{root}.{len(fr)}f{ext}'
        if not os.path.exists(keep):
            shutil.copy(o.src, keep)
    strip.save(dst, quality=92, method=6) if dst.endswith('.webp') else strip.save(dst)
    if o.anchors and o.hero and o.sheet:
        a = json.load(open(o.anchors))
        a['sheets'][o.hero][o.sheet]['n'] = len(out)
        json.dump(a, open(o.anchors, 'w'), indent=2)
    print(f'{o.src}: {len(fr)} -> {len(out)} frames, {held} held (big pose jumps)')


if __name__ == '__main__':
    main()
