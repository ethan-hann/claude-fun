"""Download the CC0 source assets Bloomfall is built from.

Sources: Poly Haven (textures, HDRI, models) and ambientCG (textures). Everything is CC0.
Files go to source/.cache/ (not committed). process_assets.py and the Blender scripts read from there.

usage: python3 tools/fetch_assets.py
"""
import json
import os
import sys
import urllib.request
import zipfile
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache')
UA = {'User-Agent': 'bloomfall-asset-fetch/1.0'}

# key -> (source, asset id, resolution)
TEXTURES = {
    'wall':     ('ph', 'concrete_wall_008', '2k'),
    'ribbed':   ('ph', 'ribbed_concrete_wall', '1k'),
    'tiles':    ('ph', 'granite_tile', '2k'),
    'concrete': ('ph', 'concrete_floor_worn_001', '1k'),
    'marble':   ('ph', 'marble_01', '1k'),
    'rock':     ('ph', 'dry_riverbed_rock', '1k'),
    'paving':   ('ph', 'large_grey_tiles', '2k'),
    'leaves':   ('ph', 'dry_decay_leaves', '1k'),
    'rust':     ('ph', 'rust_coarse_01', '1k'),
    'lattice':  ('acg', 'Metal046A', '1K'),
    'steel':    ('acg', 'Metal032', '1K'),
    'plates':   ('acg', 'MetalPlates003', '1K'),
    'screen':   ('acg', 'SheetMetal002', '1K'),
}

HDRIS = {
    'sky': ('belfast_sunset_puresky', ['2k', '4k']),
}

# Poly Haven models used as static props (baked into the islands).
MODELS = ['dead_tree_trunk', 'dead_quiver_trunk', 'marble_bust_01', 'boulder_01', 'rock_07', 'rock_09']


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def fetch_ph_texture(key, asset, res):
    out = os.path.join(CACHE, 'tex', key)
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    want = {'Diffuse': 'color', 'nor_gl': 'normal', 'arm': 'arm'}
    for src, dst in want.items():
        path = os.path.join(out, dst + '.jpg')
        if os.path.exists(path):
            continue
        url = files[src][res]['jpg']['url']
        print('  ', url)
        save(path, get(url))


def fetch_acg_texture(key, asset, res):
    out = os.path.join(CACHE, 'tex', key)
    if os.path.exists(os.path.join(out, 'color.jpg')):
        return
    url = f'https://ambientcg.com/get?file={asset}_{res}-JPG.zip'
    print('  ', url)
    z = zipfile.ZipFile(io.BytesIO(get(url)))
    names = {
        '_Color.jpg': 'color.jpg', '_NormalGL.jpg': 'normal.jpg', '_Roughness.jpg': 'rough.jpg',
        '_Metalness.jpg': 'metal.jpg', '_AmbientOcclusion.jpg': 'ao.jpg', '_Opacity.jpg': 'opacity.jpg',
    }
    for n in z.namelist():
        for suffix, dst in names.items():
            if n.endswith(suffix):
                save(os.path.join(out, dst), z.read(n))


def fetch_hdri(key, asset, resolutions):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    for res in resolutions:
        path = os.path.join(CACHE, 'hdri', f'{key}_{res}.hdr')
        if os.path.exists(path):
            continue
        url = files['hdri'][res]['hdr']['url']
        print('  ', url)
        save(path, get(url))


def fetch_model(asset):
    out = os.path.join(CACHE, 'models', asset)
    if os.path.exists(os.path.join(out, asset + '.gltf')):
        return
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    g = files['gltf']['1k']['gltf']
    print('  ', g['url'])
    save(os.path.join(out, asset + '.gltf'), get(g['url']))
    for rel, inc in g.get('include', {}).items():
        save(os.path.join(out, rel), get(inc['url']))


def main():
    for key, (src, asset, res) in TEXTURES.items():
        print('texture', key, asset)
        (fetch_ph_texture if src == 'ph' else fetch_acg_texture)(key, asset, res)
    for key, (asset, res) in HDRIS.items():
        print('hdri', key, asset)
        fetch_hdri(key, asset, res)
    for asset in MODELS:
        print('model', asset)
        fetch_model(asset)


if __name__ == '__main__':
    sys.exit(main())
