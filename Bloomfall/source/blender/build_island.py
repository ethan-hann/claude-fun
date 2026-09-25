"""Build one island: geometry -> lightmap UVs -> bake -> GLB + lightmap + JSON.

usage: <bpy python> blender/build_island.py <key> [--quick | --nobake] [--size N]
  --quick   low-sample bake for layout work
  --nobake  flat lightmap, geometry only (fastest)
Outputs: assets/levels/<key>.glb, assets/levels/<key>_lm.webp, src/levels/<key>.json
"""
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
key = args[0]
quick = '--quick' in args
nobake = '--nobake' in args
t0 = time.time()
lib.reset_scene()
mod = importlib.import_module('islands.' + key)
island = lib.Island(key, getattr(mod, 'TITLE', key))
mod.build(island)
size = island.lm_size
if '--size' in args:
    size = int(args[args.index('--size') + 1])
print(f'[{key}] built {len(island.objects)} pieces, {len(island.colliders)} colliders, '
      f'{len(island.entities)} entities in {time.time() - t0:.1f}s', flush=True)

obj, _ = lib.join_static(island, margin=6.0 / size)
print(f'[{key}] joined: {len(obj.data.polygons)} faces, {len(obj.data.vertices)} verts', flush=True)

lib.lightmap_unwrap(obj, margin=6.0 / size)
print(f'[{key}] unwrapped in {time.time() - t0:.1f}s', flush=True)

root = os.path.dirname(HERE)
lm_path = os.path.join(root, 'assets', 'levels', f'{key}_lm.webp')
if nobake:
    import numpy as np
    rgb = np.full((64, 64, 3), 0.6, dtype=np.float32)
    mask = np.ones((64, 64), dtype=np.float32)
    lib.save_lightmap(rgb, mask, lm_path)
else:
    rgb, mask, cov = lib.bake_lightmap(obj, island, size, quick=quick)
    rgb = lib.denoise_lightmap(rgb, cov, radius=1 if quick else 2)
    scale, clipped = lib.save_lightmap(rgb, mask, lm_path)
    print(f'[{key}] lightmap saved, clipped fraction {clipped:.4f}', flush=True)

glb_raw = os.path.join(root, '.cache', f'{key}_raw.glb')
lib.export_glb(obj, glb_raw)
import subprocess
glb = os.path.join(root, 'assets', 'levels', f'{key}.glb')
subprocess.run(['npx', 'gltf-transform', 'meshopt', glb_raw, glb], cwd=root, check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f'[{key}] glb {os.path.getsize(glb) // 1024} KB, lightmap {os.path.getsize(lm_path) // 1024} KB', flush=True)
lib.write_json(island, os.path.join(root, 'src', 'levels', f'{key}.json'),
               extra={'lightmapScale': lib.WORLD['lightmap']['scale']})
print(f'[{key}] done in {time.time() - t0:.1f}s', flush=True)
