"""Prepare the sky from the Poly Haven HDRI (run with Blender's Python: bpy).

- Rotates the panorama so its sunset glow sits at the game's sun azimuth (shared/world.json).
- Writes assets/sky/sky.webp: 4096x2048, each channel log-encoded so an 8-bit image keeps the
  HDR range: v = ln(c / logMin) / ln(logMax / logMin). The game decodes it in its sky shader and
  builds the image-based lighting from it.
- Writes .cache/hdri/sky_rotated_2k.hdr for the Blender bakes, so baked light matches the game.

usage: <bpy python> tools/process_sky.py
"""
import bpy
import json
import math
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'shared', 'world.json')))


def load_hdr(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1, :, :3].copy()  # row 0 = top


def save_hdr(path, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new('out', w, h, float_buffer=True, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = rgb[::-1]
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = 'HDR'
    img.save()


def rotation_pixels(width):
    # Game/three.js equirect: u = 0.5 + atan2(z, x) / 2pi. Move the glow to the sun azimuth.
    target_u = 0.5 + CFG['sun']['azimuthDeg'] / 360.0
    du = (target_u - CFG['sky']['sourceGlowU']) % 1.0
    return int(round(du * width))


def main():
    cache = os.path.join(ROOT, '.cache', 'hdri')
    out_dir = os.path.join(ROOT, 'assets', 'sky')
    os.makedirs(out_dir, exist_ok=True)
    lo, hi = CFG['sky']['logMin'], CFG['sky']['logMax']

    sky4 = load_hdr(os.path.join(cache, 'sky_4k.hdr'))
    sky4 = np.roll(sky4, rotation_pixels(sky4.shape[1]), axis=1)
    print('4k range', sky4.min(), sky4.max())
    v = np.log(np.clip(sky4, lo, hi) / lo) / math.log(hi / lo)
    # Triangular dither of one code value hides banding in the smooth gradients.
    rng = np.random.default_rng(7)
    noise = (rng.random(v.shape) - rng.random(v.shape)) / 255.0
    v8 = np.clip(np.round((v + noise) * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(v8, 'RGB').save(os.path.join(out_dir, 'sky.webp'), 'WEBP', quality=90, method=6)
    print('sky.webp', os.path.getsize(os.path.join(out_dir, 'sky.webp')) // 1024, 'KB')

    sky2 = load_hdr(os.path.join(cache, 'sky_2k.hdr'))
    sky2 = np.roll(sky2, rotation_pixels(sky2.shape[1]), axis=1)
    save_hdr(os.path.join(cache, 'sky_rotated_2k.hdr'), sky2)
    # A small preview for checking the rotation.
    prev = np.clip(sky2[::4, ::4] / 8.0, 0, 1) ** (1 / 2.2)
    Image.fromarray((prev * 255).astype(np.uint8)).save(os.path.join(cache, 'sky_rotated_preview.jpg'))


main()
