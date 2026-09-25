"""Convert downloaded CC0 texture sets into the game's WebP sets.

Each set becomes three files in assets/textures/:
  <key>_color.webp   base color (sRGB); alpha = opacity for cut-out materials
  <key>_normal.webp  OpenGL-convention normal map
  <key>_arm.webp     R = ambient occlusion, G = roughness, B = metalness (linear)

usage: python3 tools/process_textures.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.cache', 'tex')
DST = os.path.join(ROOT, 'assets', 'textures')

# key -> output size (square). Floors and walls seen up close keep 2K.
SIZES = {
    'wall': 2048, 'tiles': 2048, 'paving': 2048, 'ribbed': 1024, 'concrete': 1024, 'marble': 1024, 'rock': 1024,
    'leaves': 1024, 'rust': 1024, 'lattice': 1024, 'steel': 1024, 'plates': 1024, 'screen': 1024,
}
# Constant metalness for ambientCG sets that ship without a metalness map.
QUALITY = {'color': 86, 'normal': 90, 'arm': 84}


def load(path, mode, size):
    im = Image.open(path).convert(mode)
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return im


def main():
    os.makedirs(DST, exist_ok=True)
    total = 0
    for key, size in SIZES.items():
        d = os.path.join(SRC, key)
        color = load(os.path.join(d, 'color.jpg'), 'RGB', size)
        if os.path.exists(os.path.join(d, 'opacity.jpg')):
            alpha = load(os.path.join(d, 'opacity.jpg'), 'L', size)
            color.putalpha(alpha)
        normal = load(os.path.join(d, 'normal.jpg'), 'RGB', size)
        if os.path.exists(os.path.join(d, 'arm.jpg')):
            arm = load(os.path.join(d, 'arm.jpg'), 'RGB', size)
        else:
            rough = load(os.path.join(d, 'rough.jpg'), 'L', size)
            metal = load(os.path.join(d, 'metal.jpg'), 'L', size) if os.path.exists(os.path.join(d, 'metal.jpg')) \
                else Image.new('L', (size, size), 0)
            ao = load(os.path.join(d, 'ao.jpg'), 'L', size) if os.path.exists(os.path.join(d, 'ao.jpg')) \
                else Image.new('L', (size, size), 255)
            arm = Image.merge('RGB', (ao, rough, metal))
        for name, im in (('color', color), ('normal', normal), ('arm', arm)):
            out = os.path.join(DST, f'{key}_{name}.webp')
            kw = {'quality': QUALITY[name], 'method': 6}
            if im.mode == 'RGBA':
                kw['alpha_quality'] = 100
            im.save(out, 'WEBP', **kw)
            total += os.path.getsize(out)
        print(f'{key:10s} {size}px  {sum(os.path.getsize(os.path.join(DST, f"{key}_{n}.webp")) for n in ("color", "normal", "arm")) / 1024:.0f} KB')
    # Prop models from Poly Haven: their own texture sets, renamed prop_<asset>.
    mdir = os.path.join(ROOT, '.cache', 'models')
    for asset in sorted(os.listdir(mdir)) if os.path.isdir(mdir) else []:
        tdir = os.path.join(mdir, asset, 'textures')
        files = os.listdir(tdir)
        def find(tag):
            for f in files:
                if f'_{tag}_' in f:
                    return os.path.join(tdir, f)
            return None
        size = 1024
        color = load(find('diff'), 'RGB', size)
        normal = load(find('nor_gl'), 'RGB', size)
        if find('arm'):
            arm = load(find('arm'), 'RGB', size)
        else:
            rough = load(find('rough'), 'L', size)
            arm = Image.merge('RGB', (Image.new('L', (size, size), 255), rough, Image.new('L', (size, size), 0)))
        key = 'prop_' + asset
        for name, im in (('color', color), ('normal', normal), ('arm', arm)):
            out = os.path.join(DST, f'{key}_{name}.webp')
            im.save(out, 'WEBP', quality=QUALITY[name], method=6)
            total += os.path.getsize(out)
        print(f'{key:28s} {sum(os.path.getsize(os.path.join(DST, f"{key}_{n}.webp")) for n in ("color", "normal", "arm")) / 1024:.0f} KB')
    print(f'total {total / 1048576:.2f} MB')


if __name__ == '__main__':
    main()
