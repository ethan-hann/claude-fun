"""Build the moving props (real-time lit, not lightmapped) and export them as GLB.

usage: <bpy python> blender/build_props.py [name ...]
Outputs assets/models/<name>.glb. Material names map to the game's texture sets
(lattice, steel, plates, marble...) or glow_* for emissive parts.
"""
import bpy  # must come before bmesh
import bmesh
import math
import os
import subprocess
import sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'models')


def new_obj(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(lib.get_material(m))
    return obj


def box_uvs(obj, scale=1.0):
    """Planar UVs per face in object space (props are exported in their own space)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    up = Vector((0, 0, 1))
    for poly in me.polygons:
        n = poly.normal
        if abs(n.z) > 0.7:
            t, bt = Vector((1, 0, 0)), Vector((0, 1, 0))
        else:
            t = up.cross(n).normalized()
            bt = n.cross(t).normalized()
            if bt.z < 0:
                bt = -bt
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (p.dot(t) / scale + 0.5, p.dot(bt) / scale + 0.5)


def export(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    raw = os.path.join(ROOT, '.cache', f'{name}_raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_yup=True, export_image_format='NONE')
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f'{name}.glb')
    subprocess.run(['npx', 'gltf-transform', 'meshopt', raw, out], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f'{name}: {os.path.getsize(out) // 1024} KB', flush=True)


def apply_mods(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)


# ------------------------------------------------------------------------------------------
# Lattice crate: 1 m cube. Dark cast-metal frame, recessed panels, a glowing seam around each
# panel and three level pips on each face (pip0..pip2, lit by the game for the current size).
# ------------------------------------------------------------------------------------------

def lattice_crate():
    lib.reset_scene()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.035, segments=3, profile=0.5, affect='EDGES')
    # the six big faces are the ones with |normal| along an axis and area > 0.5
    big = [f for f in bm.faces if f.calc_area() > 0.5]
    # frame border
    res = bmesh.ops.inset_individual(bm, faces=big, thickness=0.085, depth=0.0)
    # seam ring
    res2 = bmesh.ops.inset_individual(bm, faces=big, thickness=0.018, depth=-0.012)
    seam_faces = set(res2['faces'])
    # recessed panel
    res3 = bmesh.ops.inset_individual(bm, faces=big, thickness=0.008, depth=-0.02)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.material_index = 0
    for f in seam_faces:
        f.material_index = 1
    for f in big:
        f.material_index = 2
    for f in bm.faces:
        f.smooth = False
    obj = new_obj('crate', bm, ['lattice', 'glow_cyan', 'plates'])
    box_uvs(obj, 1.0)
    objs = [obj]
    # level pips: three small studs in a corner of every face, named so the game can light them
    for i in range(3):
        pb = bmesh.new()
        for axis in range(3):
            for sgn in (-1, 1):
                n = Vector((0, 0, 0))
                n[axis] = sgn
                # tangent directions on the face
                t1 = Vector((0, 0, 0))
                t2 = Vector((0, 0, 0))
                t1[(axis + 1) % 3] = 1
                t2[(axis + 2) % 3] = 1
                c = n * 0.503 + t1 * (0.44 - i * 0.055) + t2 * 0.44
                geom = bmesh.ops.create_cube(pb, size=0.03)
                bmesh.ops.translate(pb, verts=geom['verts'], vec=c)
        pip = new_obj(f'pip{i}', pb, ['glow_white'])
        objs.append(pip)
    export(objs, 'lattice_crate')


def lattice_orb():
    lib.reset_scene()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=0.5)
    for f in bm.faces:
        f.smooth = True
        c = f.calc_center_median()
        lat = math.degrees(math.asin(max(-1, min(1, c.z / 0.5))))
        lon = math.degrees(math.atan2(c.y, c.x)) % 45
        f.material_index = 1 if abs(lat) < 2.2 or (lon < 1.6 or lon > 43.4) and abs(lat) < 70 else 0
    obj = new_obj('orb', bm, ['lattice', 'glow_cyan'])
    # spherical UVs
    me = obj.data
    me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    for poly in me.polygons:
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co.normalized()
            uv[li].uv = (0.5 + math.atan2(p.y, p.x) / (2 * math.pi) * 2.0, 0.5 + math.asin(max(-1, min(1, p.z))) / math.pi * 1.0)
    # push the seam faces slightly inward so they read as grooves
    for v in me.vertices:
        pass
    objs = [obj]
    for i in range(3):
        pb = bmesh.new()
        for k in range(4):
            a = math.radians(90 * k + 22.5 + i * 7)
            c = Vector((math.cos(a) * 0.43, math.sin(a) * 0.43, 0.25))
            geom = bmesh.ops.create_icosphere(pb, subdivisions=1, radius=0.018)
            bmesh.ops.translate(pb, verts=geom['verts'], vec=c)
        pip = new_obj(f'pip{i}', pb, ['glow_white'])
        objs.append(pip)
    export(objs, 'lattice_orb')



# ------------------------------------------------------------------------------------------
# The Graft: a forearm device. Forward is Blender +Y (game -Z). Parts named for animation:
# cell0..2 (glowing capsules), petal0..4 (hinged at their base), lens.
# ------------------------------------------------------------------------------------------

def _cyl(name, r1, r2, depth, loc, rot, mats, segs=24, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    obj = new_obj(name, bm, mats)
    for p in obj.data.polygons:
        p.use_smooth = abs(p.normal.z) < 0.6
    obj.location = loc
    obj.rotation_euler = rot
    if bevel > 0:
        m = obj.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(40); m.harden_normals = True
        apply_mods(obj)
    box_uvs(obj, 0.2)
    return obj


def _box(name, size, loc, mats, rot=(0, 0, 0), bevel=0.003):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = new_obj(name, bm, mats)
    obj.location = loc
    obj.rotation_euler = rot
    if bevel > 0:
        m = obj.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = 2; m.harden_normals = True
        apply_mods(obj)
    box_uvs(obj, 0.2)
    return obj


def glove():
    lib.reset_scene()
    X = math.radians(90)
    objs = []
    # forearm bracer (along Y)
    objs.append(_cyl('bracer', 0.05, 0.056, 0.30, (0, -0.05, 0), (X, 0, 0), ['lattice'], segs=28, bevel=0.004))
    for y in (-0.17, -0.07, 0.05):
        objs.append(_cyl('band', 0.059, 0.059, 0.018, (0, y, 0), (X, 0, 0), ['steel'], segs=28, bevel=0.002))
    # spine carrying the cells
    objs.append(_box('spine', (0.036, 0.26, 0.022), (0, -0.05, 0.058), ['steel'], bevel=0.004))
    for i, y in enumerate((-0.14, -0.065, 0.01)):
        objs.append(_cyl(f'cellcase{i}', 0.016, 0.016, 0.06, (0, y, 0.078), (X, 0, 0), ['steel'], segs=16, bevel=0.002))
        c = _cyl(f'cell{i}', 0.011, 0.011, 0.066, (0, y, 0.078), (X, 0, 0), ['glow_cyan'], segs=16)
        objs.append(c)
    # emitter head: flared collar, lens, petals
    objs.append(_cyl('collar', 0.056, 0.07, 0.05, (0, 0.125, 0), (X, 0, 0), ['steel'], segs=32, bevel=0.003))
    objs.append(_cyl('throat', 0.045, 0.045, 0.02, (0, 0.155, 0), (X, 0, 0), ['lattice'], segs=32))
    objs.append(_cyl('lens', 0.03, 0.03, 0.012, (0, 0.165, 0), (X, 0, 0), ['glow_white'], segs=32))
    for k in range(5):
        a = k / 5 * math.tau
        # petal: a thin curved blade hinged at the collar rim, leaning outward
        bm = bmesh.new()
        geom = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((0.03, 0.075, 0.004)), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((0, 0.0375, 0)), verts=bm.verts)  # hinge at local origin
        # curve the blade: bend verts outward along its length
        for v in bm.verts:
            t = v.co.y / 0.075
            v.co.z += 0.012 * t * t
            v.co.x *= (1.0 - 0.45 * t)
        p = new_obj(f'petal{k}', bm, ['lattice'])
        box_uvs(p, 0.2)
        r = 0.062
        p.location = (math.cos(a) * r, 0.15, math.sin(a) * r)
        # orient: local +Y forward, local +Z outward (radial)
        p.rotation_euler = (math.radians(-18), 0, 0)
        mat_rot = Matrix.Rotation(a - math.pi / 2, 4, 'Y')
        p.matrix_world = Matrix.Translation(p.location) @ mat_rot @ Matrix.Rotation(math.radians(-15), 4, 'X')
        objs.append(p)
    # a few cables along the underside
    for sx in (-0.03, 0.03):
        objs.append(_cyl('cable', 0.007, 0.007, 0.24, (sx, -0.04, -0.052), (X, 0, 0), ['rust'], segs=10))
    export(objs, 'glove')


PROPS = {
    'lattice_crate': lattice_crate,
    'lattice_orb': lattice_orb,
    'glove': glove,
}

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    names = args or list(PROPS)
    for n in names:
        PROPS[n]()
