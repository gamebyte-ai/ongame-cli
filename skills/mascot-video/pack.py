#!/usr/bin/env python3
"""Turn green-screen forge videos of one character into transparent WebP atlas pages + a clips JSON.

    python3 pack.py --check cheer=cheer.mp4 fire=fire.mp4               # measure the takes, write nothing
    python3 pack.py --out public/assets/mascot --name hero cheer=cheer.mp4 fire=fire.mp4

Every take is generated from the same idle still, so every take starts (and nearly ends) on that pose. The layout
relies on it: all frames of all clips share ONE crop box and ONE idle still (`<name>_idle.webp`), so the game holds
the still between clips and swaps to video frames without a jump.

Keying: alpha = 1 - (G - max(R,B) - lo) / (hi - lo), green spill clamped to max(R,B). The ratio of green over the other
two channels separates the screen from the character, so a darker or vignetted screen keys the same.

Needs python3 with numpy + Pillow, and ffmpeg/ffprobe on PATH. Exit 0 = done and every take passed its checks,
1 = a take failed a check (the pack is still written, so it can be looked at), 2 = bad input or a missing tool.
"""
import argparse
import json
import math
import pathlib
import shutil
import subprocess
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError as e:
    sys.exit(f'pack.py needs numpy and Pillow ({e.name} missing): python3 -m pip install numpy pillow')

# Calibrated on 8 takes the user kept and 2 that were thrown out (2026-10, four games). A frame "stands still" when
# the character region moves less than STEP (mean 0-255) since the previous frame. Kept takes stood still for 14-43%
# of their frames, the thrown-out "sad" take for 71%. Peak motion does NOT separate them: a kept wave peaks
# lower than the rejected sad take, because waving moves a small part of the body.
STEP, MAX_STILL = 0.6, 0.6
MIN_SCREEN = 0.2   # share of the first frame that must key out; a screen-region clip (no green) has ~0.03
MAX_EDGE = 0.01    # share of a frame border the character covers before that frame counts as touching the edge
EDGE_FRAMES = 0.05 # touching in more frames than this means something is cut off; one frame is a passing effect streak
MEASURE_H = 360    # frames are measured at this height, whatever the pack height


def die(msg):
    print(f'pack.py: {msg}', file=sys.stderr)
    sys.exit(2)


def probe(src):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                          '-of', 'csv=p=0', src], capture_output=True, text=True)
    try:
        w, h, rate = out.stdout.strip().split(',')[:3]
        num, den = rate.split('/')
        return int(w), int(h), int(num) / int(den)
    except ValueError:
        die(f'{src}: ffprobe cannot read a video stream')


def decode(src, h, lo, hi):
    """All frames keyed to RGBA uint8 at height `h` (never above the source), and the frame rate."""
    sw, sh, fps = probe(src)
    h = min(h, sh)
    w = round(sw * h / sh / 2) * 2
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={w}:{h}:flags=lanczos', '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    if not raw:
        die(f'{src}: no frames decoded')
    out = []
    for f in np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3):
        rgb = f.astype(np.float32)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        rb = np.maximum(r, b)
        alpha = 1.0 - np.clip((g - rb - lo) / (hi - lo), 0, 1)
        out.append(np.dstack([r, np.minimum(g, rb), b, alpha * 255]).clip(0, 255).astype(np.uint8))
    return out, fps


def small(fs):
    k = max(1, fs[0].shape[0] // MEASURE_H)
    return np.stack([f[::k, ::k] for f in fs]).astype(np.float32)


def motion(fs):
    """Per frame: change since the previous frame and distance from the first, both inside the character's region."""
    s = small(fs)
    region = s[..., 3].max(0) > 128
    if not region.any():
        return np.zeros(len(fs)), np.zeros(len(fs)), s, region
    step = np.array([0.0] + [float(np.abs(s[i] - s[i - 1])[region].mean()) for i in range(1, len(s))])
    away = np.array([float(np.abs(s[i] - s[0])[region].mean()) for i in range(len(s))])
    return step, away, s, region


def measure(name, fs, fps):
    """What a viewer would notice about a take, and whether it is fit to ship."""
    step, away, s, region = motion(fs)
    a = s[..., 3] > 128
    border = np.stack([a[:, 0].mean(1), a[:, -1].mean(1), a[:, :, 0].mean(1), a[:, :, -1].mean(1)]).max(0)
    edge = float((border > MAX_EDGE).mean())
    screen = float((s[0, ..., 3] < 8).mean())
    still = float((step[1:] < STEP).mean()) if len(step) > 1 else 1.0
    seam = float(np.abs(s[-1] - s[0])[region].mean()) if region.any() else 0.0
    problems = []
    if screen < MIN_SCREEN:
        problems.append(f'only {screen:.0%} of the first frame keyed out: not a flat green screen')
    elif still > MAX_STILL:
        problems.append(f'{still:.0%} of the frames stand still: the action is too small to read, regenerate it')
    if edge > EDGE_FRAMES:
        problems.append('the character crosses the frame edge: part of it is cut off, generate from a wider still')
    return {'clip': name, 'frames': len(fs), 'sec': round(len(fs) / fps, 2), 'still': round(still, 2),
            'peak': round(float(away.max()), 1), 'seam': round(seam, 2), 'edge': round(edge, 3), 'screen': round(screen, 2),
            'problems': problems}, away


def trim(fs, away, fps, tail):
    """Drop the lead-in and the settle that only hold the idle pose: the game shows its still there anyway.
    `act` is how many seconds into the kept frames the action is over, so other things can move in step with it."""
    peak = float(away.max())
    moving = np.nonzero(away > max(1.5, peak * 0.1))[0]
    if not len(moving):
        return fs, round(len(fs) / fps, 3)
    start, end = max(0, int(moving[0]) - 2), min(len(fs), int(moving[-1]) + tail + 1)
    acting = np.nonzero(away[start:end] >= peak * 0.3)[0]
    return fs[start:end], round((int(acting[-1]) + 1) / fps, 3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('clips', nargs='+', metavar='clip=video.mp4', help='clip name and its green-screen video; the first clip supplies the idle still')
    ap.add_argument('--check', action='store_true', help='measure the takes and stop; write nothing')
    ap.add_argument('--out', help='directory for the WebP pages, the idle still and the clips JSON')
    ap.add_argument('--name', default='mascot', help='file prefix (default mascot)')
    ap.add_argument('--height', type=int, default=400, help='frame height in px; about 1.5x the on-screen CSS height (default 400)')
    ap.add_argument('--page', type=int, default=2048, help='atlas page edge in px; 2048 is safe on every phone GPU (default 2048)')
    ap.add_argument('--fps', type=float, default=0, help='playback rate; 0 keeps the video\'s own (default)')
    ap.add_argument('--lo', type=float, default=18, help='green dominance below which a pixel is fully opaque (default 18)')
    ap.add_argument('--hi', type=float, default=70, help='green dominance above which a pixel is fully clear (default 70)')
    ap.add_argument('--tail', type=int, default=6, help='frames kept after the motion settles, for the fade back to the still (default 6)')
    ap.add_argument('--quality', type=int, default=80, help='WebP quality of the pages (default 80)')
    ap.add_argument('--keep-still', action='store_true', help='keep the idle lead-in and settle (a take that must loop whole)')
    a = ap.parse_args()

    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            die(f'{tool} not found on PATH')
    if not a.check and not a.out:
        die('--out is required unless --check')
    if not 0 <= a.lo < a.hi:
        die('need 0 <= --lo < --hi')
    pairs = []
    for spec in a.clips:
        name, _, src = spec.partition('=')
        if not name or not src or not name.replace('_', '').isalnum():
            die(f'"{spec}": expected clip=video.mp4, the name in letters, digits and _')
        if not pathlib.Path(src).is_file():
            die(f'{src}: no such file')
        pairs.append((name, src))
    if len({n for n, _ in pairs}) != len(pairs):
        die('two clips share a name')
    sizes = {probe(src)[:2] for _, src in pairs}
    if len({w / h for w, h in sizes}) > 1:
        die(f'the takes differ in shape {sorted(sizes)}: generate them all from the same still')

    # Decode at twice the pack height: the crop box keeps roughly half the frame, so the frames stay sharp after it.
    takes, report = {}, []
    for name, src in pairs:
        fs, fps = decode(src, MEASURE_H if a.check else a.height * 2, a.lo, a.hi)
        r, away = measure(name, fs, fps)
        report.append(r)
        takes[name] = (fs, away, a.fps or fps)
    sizes = {fs[0].shape for fs, _, _ in takes.values()}
    if len(sizes) > 1:
        die(f'the takes decode to different sizes {sorted(sizes)}: give them the same resolution')
    for r in report:
        verdict = 'FAIL: ' + '; '.join(r['problems']) if r['problems'] else 'ok'
        print(f"{r['clip']:<14} {r['frames']:>4} fr {r['sec']:>5}s  still {r['still']:.0%}  peak {r['peak']:>5}  "
              f"seam {r['seam']:>5}  edge {r['edge']:.0%}  {verdict}")
    failed = any(r['problems'] for r in report)
    if a.check:
        sys.exit(1 if failed else 0)

    idle_full = next(iter(takes.values()))[0][0]
    clips = {}
    for name, (fs, away, fps) in takes.items():
        kept, act = (fs, round(len(fs) / fps, 3)) if a.keep_still else trim(fs, away, fps, a.tail)
        clips[name] = (kept, fps, act)

    # one crop box for every frame of every clip, so the feet never move inside the image
    mask = np.zeros(idle_full.shape[:2], bool)
    for fs, _, _ in clips.values():
        for f in fs:
            mask |= f[..., 3] > 8
    ys, xs = np.nonzero(mask)
    if not len(ys):
        die('every frame keyed out completely: is the character green, or are --lo/--hi wrong?')
    pad = 6
    H, W = mask.shape
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(W, int(xs.max()) + pad + 1), min(H, int(ys.max()) + pad + 1)
    fh = min(a.height, a.page)
    fw = min(round((x1 - x0) * fh / (y1 - y0)), a.page)

    def cut(f):
        return Image.fromarray(f[y0:y1, x0:x1], 'RGBA').resize((fw, fh), Image.LANCZOS)

    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob(f'{a.name}_*.webp'):
        old.unlink()
    idle = cut(idle_full)
    iy, ix = np.nonzero(np.asarray(idle)[..., 3] > 128)
    meta = {'name': a.name, 'fw': fw, 'fh': fh, 'top': int(iy.min()), 'feet': int(iy.max()), 'cx': round(float(ix.mean()), 1),
            'idle': f'{a.name}_idle.webp', 'clips': {}}
    idle.save(out / meta['idle'], quality=86, method=6)
    cols, rows = a.page // fw, a.page // fh
    per = cols * rows
    total = (out / meta['idle']).stat().st_size
    for name, (fs, fps, act) in clips.items():
        pages = math.ceil(len(fs) / per)
        for p in range(pages):
            chunk = fs[p * per:(p + 1) * per]
            sheet = Image.new('RGBA', (cols * fw, math.ceil(len(chunk) / cols) * fh), (0, 0, 0, 0))
            for i, f in enumerate(chunk):
                sheet.paste(cut(f), ((i % cols) * fw, (i // cols) * fh))
            page = out / f'{a.name}_{name}_{p}.webp'
            sheet.save(page, quality=a.quality, method=4)  # method 6 is ~9x slower for ~8% smaller pages
            total += page.stat().st_size
        meta['clips'][name] = {'n': len(fs), 'fps': round(fps, 3), 'act': act, 'cols': cols, 'per': per, 'pages': pages}
        mb = pages * cols * fw * rows * fh * 4 / 2 ** 20  # every page is decoded to RGBA on the GPU while the clip is loaded
        print(f'{name:<14} kept {len(fs)} fr, action over at {act}s, {pages} page(s) of {cols}x{rows} at {fw}x{fh}, ~{mb:.0f} MB GPU')
    (out / f'{a.name}-clips.json').write_text(json.dumps(meta, indent=1) + '\n')
    print(f'wrote {out}/{a.name}-clips.json; {total / 2 ** 20:.1f} MB of WebP')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
