"""Bloomfall Blender library: builds island geometry from Python, bakes lightmaps, exports GLB.

Authoring is in game space (Y up, meters). Blender is Z up, so every point goes through g2b().
The glTF exporter converts back to Y up, so exported files are in game space again.

Materials are named after texture sets (wall, tiles, marble...). The game assigns the real
PBR textures by name. In Blender each material only needs its average albedo, so light bounces
carry the right color into the bake.
"""
import bpy
import bmesh
import json
import math
import os
import random
import time
import inspect
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLD = json.load(open(os.path.join(ROOT, 'shared', 'world.json')))
ALBEDO = json.load(open(os.path.join(ROOT, 'shared', 'albedo.json')))

# Meters per texture repeat for each material (texel density of the tiling textures).
UV_SCALE = {
    'wall': 3.5, 'ribbed': 2.0, 'tiles': 2.4, 'paving': 3.2, 'concrete': 3.0, 'marble': 2.0, 'rock': 7.0,
    'leaves': 2.5, 'rust': 2.0, 'lattice': 1.0, 'steel': 1.5, 'plates': 2.0, 'screen': 1.0,
}
GLOW = {
    # name -> (linear color, strength)
    'glow_cyan': ((0.35, 0.85, 1.0), 6.0),
    'glow_warm': ((1.0, 0.55, 0.22), 5.0),
    'glow_white': ((1.0, 0.95, 0.88), 6.0),
}


def g2b(p):
    """Game (x, y, z), Y up -> Blender (x, -z, y), Z up."""
    return Vector((p[0], -p[2], p[1]))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.unit_settings.system = 'METRIC'
    return sc


def get_material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    if name in GLOW:
        col, strength = GLOW[name]
        bsdf.inputs['Base Color'].default_value = (*col, 1)
        bsdf.inputs['Emission Color'].default_value = (*col, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    else:
        key = name.split('.')[0]
        alb = ALBEDO.get(key, (0.3, 0.3, 0.3))
        bsdf.inputs['Base Color'].default_value = (*alb, 1)
        bsdf.inputs['Roughness'].default_value = 0.85
        bsdf.inputs['Metallic'].default_value = 0.0  # bake irradiance for metals too
    return m


class Island:
    """Collects geometry, colliders and entities for one island."""

    def __init__(self, key, title):
        self.key = key
        self.title = title
        self.objects = []      # Blender objects to join into the static mesh
        self.colliders = []    # physics records for the game
        self.entities = []     # dynamic objects and puzzle logic for the game
        self.meta = {}
        self.lights = []
        self.lm_size = 1024
        self._n = 0
        self.current_chunk = 'main'

    def chunk(self, name):
        """Context manager: everything built inside belongs to the named chunk. Chunks share the
        island's lightmap but are separate meshes and collider bodies, so the game can move them
        (for example, a section that breaks off and falls)."""
        island = self

        class _C:
            def __enter__(self_):
                self_.prev = island.current_chunk
                island.current_chunk = name

            def __exit__(self_, *a):
                island.current_chunk = self_.prev
        return _C()

    # ------------------------------------------------------------------ helpers
    def _name(self, base):
        self._n += 1
        return f'{base}_{self._n}'

    def _link(self, obj, mat, lm_weight=1.0):
        # remember which line of the island script (or arch.py) made this piece, for warnings
        for fr in inspect.stack()[1:]:
            fn = os.path.basename(fr.filename)
            if fn != 'lib.py':
                obj['src'] = f'{fn}:{fr.lineno}'
                if 'islands' in fr.filename:
                    break
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(get_material(mat))
        obj['lm_weight'] = lm_weight
        obj['chunk'] = self.current_chunk
        self.objects.append(obj)
        return obj

    def collider_box(self, center, size, rot_y=0.0, kind='solid', tag=None):
        rec = {'t': 'box', 'p': list(map(float, center)), 'h': [size[0] / 2, size[1] / 2, size[2] / 2],
               'ry': float(rot_y), 'k': kind, 'c': self.current_chunk}
        if tag:
            rec['tag'] = tag
        self.colliders.append(rec)

    def collider_hull(self, points, kind='solid'):
        self.colliders.append({'t': 'hull', 'v': [list(map(float, p)) for p in points], 'k': kind, 'c': self.current_chunk})

    def collider_cyl(self, center, radius, height, kind='solid'):
        self.colliders.append({'t': 'cyl', 'p': list(map(float, center)), 'r': float(radius),
                               'hh': float(height) / 2, 'k': kind, 'c': self.current_chunk})

    # --------------------------------------------------------------- primitives
    def box(self, center, size, mat='wall', bevel=0.03, rot_y=0.0, collide=True, segments=2,
            lm_weight=1.0, kind='solid', rot=None):
        """Axis-aligned (optionally Y-rotated) box with bevelled edges. Center and size in game space."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        # game size (sx, sy, sz) -> blender (sx, sz, sy)
        bmesh.ops.scale(bm, vec=Vector((size[0], size[2], size[1])), verts=bm.verts)
        me = bpy.data.meshes.new(self._name('box'))
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(me.name, me)
        obj.location = g2b(center)
        if rot is not None:
            # game-space Euler XYZ -> the same rotation expressed in Blender's basis
            C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
            # three.js Euler 'XYZ' is Rx * Ry * Rz
            Rg = Matrix.Rotation(rot[0], 3, 'X') @ Matrix.Rotation(rot[1], 3, 'Y') @ Matrix.Rotation(rot[2], 3, 'Z')
            obj.rotation_euler = (C @ Rg @ C.inverted()).to_euler('XYZ')
        else:
            obj.rotation_euler = Euler((0, 0, rot_y), 'XYZ')
        self._link(obj, mat, lm_weight)
        b = min(bevel, min(size) * 0.45)
        if b > 0.001:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = b
            mod.segments = segments
            mod.limit_method = 'NONE'
            mod.harden_normals = True
        if collide:
            if rot is None:
                self.collider_box(center, size, rot_y, kind)
            else:
                self.colliders.append({'t': 'box', 'p': list(map(float, center)),
                                       'h': [size[0] / 2, size[1] / 2, size[2] / 2],
                                       'r': list(map(float, rot)), 'k': kind, 'c': self.current_chunk})
        return obj

    def cyl(self, center, radius, height, mat='wall', segments=24, bevel=0.02, collide=True, lm_weight=1.0,
            kind='solid', radius_top=None):
        """Vertical cylinder (or cone frustum if radius_top given) centered at center."""
        bm = bmesh.new()
        r2 = radius if radius_top is None else radius_top
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                              radius2=r2, depth=height)
        me = bpy.data.meshes.new(self._name('cyl'))
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = abs(p.normal.z) < 0.5
        obj = bpy.data.objects.new(me.name, me)
        obj.location = g2b(center)
        self._link(obj, mat, lm_weight)
        if bevel > 0.001:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(50)
            mod.harden_normals = True
        if collide:
            self.collider_cyl(center, max(radius, r2), height, kind)
        return obj

    def poly_prism(self, points, y0, y1, mat='wall', bevel=0.02, collide=True, lm_weight=1.0, kind='solid'):
        """Extrude a convex or concave polygon (list of (x, z) in game space) from y0 to y1."""
        bm = bmesh.new()
        vs_bottom = [bm.verts.new(g2b((x, y0, z))) for x, z in points]
        vs_top = [bm.verts.new(g2b((x, y1, z))) for x, z in points]
        n = len(points)
        # Orientation: make faces point outward whatever the winding.
        area = sum(points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in range(n))
        order = list(range(n)) if area < 0 else list(reversed(range(n)))
        bm.faces.new([vs_top[i] for i in order])
        bm.faces.new([vs_bottom[i] for i in reversed(order)])
        for k in range(n):
            i, j = order[k], order[(k + 1) % n]
            bm.faces.new([vs_bottom[i], vs_bottom[j], vs_top[j], vs_top[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self._name('prism'))
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(me.name, me)
        self._link(obj, mat, lm_weight)
        if bevel > 0.001:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(30)
            mod.harden_normals = True
        if collide:
            pts = [(x, y0, z) for x, z in points] + [(x, y1, z) for x, z in points]
            self.collider_hull(pts, kind)
        return obj

    def ramp(self, p0, p1, width, thickness=0.3, mat='concrete', collide=True):
        """Sloped slab from p0 (low end center, top surface) to p1 (high end center)."""
        p0 = Vector(p0)
        p1 = Vector(p1)
        d = p1 - p0
        horiz = Vector((d.x, 0, d.z)).normalized()
        side = Vector((-horiz.z, 0, horiz.x)) * (width / 2)
        down = Vector((0, -thickness, 0))
        pts = [p0 - side, p0 + side, p1 + side, p1 - side]
        corners = pts + [p + down for p in pts]
        bm = bmesh.new()
        v = [bm.verts.new(g2b(c)) for c in corners]
        for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            bm.faces.new([v[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self._name('ramp'))
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(me.name, me)
        self._link(obj, mat)
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = 0.02
        mod.segments = 2
        mod.harden_normals = True
        if collide:
            self.collider_hull(corners)
        return obj

    def stairs(self, start, direction, count, step_h, step_d, width, mat='marble', bevel=0.015):
        """Solid stairs. start = floor-level center of the first step's front edge.
        direction = unit (dx, dz) of ascent. Each step is a solid box down to the start height."""
        dx, dz = direction
        ry = math.atan2(dx, dz)  # rotation around Y so local +Z points along direction
        for i in range(count):
            h = step_h * (i + 1)
            c = (start[0] + dx * (step_d * (i + 0.5)), start[1] + h / 2, start[2] + dz * (step_d * (i + 0.5)))
            size = (width, h, step_d) if abs(dz) >= abs(dx) else (step_d, h, width)
            self.box(c, size, mat=mat, bevel=bevel)
        return ry

    def railing(self, p0, p1, height=1.05, post_every=1.6, mat='steel', collide=True, top_mat=None):
        """Metal railing between two floor points: posts plus a top rail and a mid rail."""
        a = Vector(p0)
        b = Vector(p1)
        d = b - a
        length = d.length
        ry = math.atan2(d.x, d.z)
        n = max(1, int(round(length / post_every)))
        for i in range(n + 1):
            p = a + d * (i / n)
            self.box((p.x, p.y + height / 2, p.z), (0.06, height, 0.06), mat=mat, bevel=0.01, collide=False,
                     rot_y=ry, lm_weight=0.5)
        mid = (a + b) / 2
        self.box((mid.x, mid.y + height, mid.z), (0.08, 0.06, length + 0.06), mat=top_mat or mat, bevel=0.015,
                 collide=False, rot_y=ry, lm_weight=0.5)
        self.box((mid.x, mid.y + height * 0.5, mid.z), (0.04, 0.04, length), mat=mat, bevel=0.008,
                 collide=False, rot_y=ry, lm_weight=0.5)
        if collide:
            self.collider_box((mid.x, mid.y + height / 2 + 0.1, mid.z), (0.12, height + 0.2, length), ry)

    def balustrade(self, p0, p1, height=1.0, mat='marble', collide=True):
        """Stone parapet wall with a coping stone on top."""
        a = Vector(p0)
        b = Vector(p1)
        d = b - a
        length = d.length
        ry = math.atan2(d.x, d.z)
        mid = (a + b) / 2
        self.box((mid.x, mid.y + (height - 0.1) / 2, mid.z), (0.3, height - 0.1, length), mat=mat, bevel=0.02,
                 collide=False, rot_y=ry)
        self.box((mid.x, mid.y + height - 0.05, mid.z), (0.42, 0.12, length + 0.12), mat=mat, bevel=0.025,
                 collide=False, rot_y=ry)
        if collide:
            self.collider_box((mid.x, mid.y + height / 2, mid.z), (0.42, height, length), ry)

    def glow_strip(self, center, size, color='glow_cyan', rot_y=0.0):
        """Emissive strip. It lights its surroundings in the bake and glows in the game."""
        return self.box(center, size, mat=color, bevel=0.0, collide=False, rot_y=rot_y, lm_weight=0.2)

    def screen(self, center, size, rot_y=0.0, frame_mat='steel'):
        """Perforated metal screen: blocks bodies, lets the Graft through. Rendered by the game as a
        cut-out material; the frame is part of the static mesh."""
        self.box(center, (size[0], size[1], 0.02) if size[2] < size[0] else (0.02, size[1], size[2]),
                 mat='screen', bevel=0.0, collide=False, rot_y=rot_y, lm_weight=0.3)
        self.collider_box(center, (max(size[0], 0.1), size[1], max(size[2], 0.1)), rot_y, kind='screen')

    def point_light(self, pos, color=(1.0, 0.6, 0.3), power=200.0, radius=0.1, realtime=True):
        """Local light: baked into the lightmap; mirrored in the game as a cheap real-time light
        (no shadows) so moving objects are lit by it too."""
        ld = bpy.data.lights.new(self._name('pl'), 'POINT')
        ld.energy = power
        ld.color = color
        ld.shadow_soft_size = radius
        obj = bpy.data.objects.new(ld.name, ld)
        obj.location = g2b(pos)
        bpy.context.scene.collection.objects.link(obj)
        self.lights.append(obj)
        if realtime:
            # Blender point W -> three.js candela (approx): I = P / (4 pi) * 683 / 683 -> use P / (4 pi)
            self.entities.append({'type': 'light', 'p': list(pos), 'color': list(color),
                                  'intensity': power / (4 * math.pi), 'range': 0})

    def area_light(self, pos, size, color=(1, 0.7, 0.45), power=300.0, direction=(0, -1, 0)):
        ld = bpy.data.lights.new(self._name('al'), 'AREA')
        ld.energy = power
        ld.color = color
        ld.shape = 'RECTANGLE'
        ld.size = size[0]
        ld.size_y = size[1]
        obj = bpy.data.objects.new(ld.name, ld)
        obj.location = g2b(pos)
        d = g2b(direction)
        obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.collection.objects.link(obj)
        self.lights.append(obj)

    def entity(self, etype, **kw):
        rec = {'type': etype}
        if self.current_chunk != 'main':
            rec['chunk'] = self.current_chunk
        for k, v in kw.items():
            if isinstance(v, tuple):
                v = list(v)
            rec[k] = v
        self.entities.append(rec)
        return rec

    # ------------------------------------------------------------ island rock
    def underside(self, outline, top_y, depth, mat='rock', seed=1, segments_per_m=0.8, lm_weight=0.35):
        """The torn underside of a floating island: a jagged inverted cone of rock under the outline.
        outline: list of (x, z) points (game space) of the island's edge at top_y."""
        rnd = random.Random(seed)
        bm = bmesh.new()
        rings = 7
        # resample outline evenly
        pts = []
        n = len(outline)
        for i in range(n):
            a = Vector((outline[i][0], outline[i][1]))
            b = Vector((outline[(i + 1) % n][0], outline[(i + 1) % n][1]))
            seg = max(1, int((b - a).length * segments_per_m))
            for s in range(seg):
                pts.append(a.lerp(b, s / seg))
        cx = sum(p.x for p in pts) / len(pts)
        cz = sum(p.y for p in pts) / len(pts)
        ring_verts = []
        # The top ring sits 10 cm inside the floor slab, exactly on the outline, and is never
        # displaced, so the rock meets the slab's edge cleanly. The top stays open: pits and shafts
        # under holes in the floor go down into it.
        for r in range(rings + 1):
            t = r / rings
            shrink = (1 - t) ** 1.25 * 0.97 + 0.03  # radius factor at depth
            y = top_y + 0.1 - depth * (t ** 0.85)
            ring = []
            for p in pts:
                jitter = 1.0 if r == 0 else (0.82 + rnd.random() * 0.3)
                x = cx + (p.x - cx) * shrink * jitter
                z = cz + (p.y - cz) * shrink * jitter
                yy = y + (0 if r == 0 else (rnd.random() - 0.5) * depth / rings * 0.9)
                ring.append(bm.verts.new(g2b((x, yy, z))))
            ring_verts.append(ring)
        m = len(pts)
        for r in range(rings):
            for i in range(m):
                a, b = ring_verts[r][i], ring_verts[r][(i + 1) % m]
                c, d = ring_verts[r + 1][(i + 1) % m], ring_verts[r + 1][i]
                bm.faces.new([a, d, c, b])
        tip = bm.verts.new(g2b((cx + rnd.uniform(-1, 1), top_y - depth * 1.08, cz + rnd.uniform(-1, 1))))
        for i in range(m):
            bm.faces.new([ring_verts[-1][i], tip, ring_verts[-1][(i + 1) % m]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # normals must point out of the rock (down and away from its axis), or it renders inside out
        mid = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        out = sum((f.normal.dot(f.calc_center_median() - mid) * f.calc_area() for f in bm.faces), 0.0)
        if out < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        # only the sides are displaced; the top ring and the cap keep their shape
        dl = bm.verts.layers.deform.verify()
        top = set(ring_verts[0])
        for v in bm.verts:
            v[dl][0] = 0.0 if v in top else 1.0
        me = bpy.data.meshes.new(self._name('under'))
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        obj = bpy.data.objects.new(me.name, me)
        obj.vertex_groups.new(name='rough')
        self._link(obj, mat, lm_weight)
        obj['lm_method'] = 'rock'
        # Displace for a rocky, broken surface.
        tex = bpy.data.textures.new(self._name('rocknoise'), 'VORONOI')
        tex.noise_scale = 2.2
        sub = obj.modifiers.new('sub', 'SUBSURF')
        sub.levels = 1
        sub.render_levels = 1
        sub.subdivision_type = 'SIMPLE'
        disp = obj.modifiers.new('disp', 'DISPLACE')
        disp.texture = tex
        disp.strength = 1.1
        disp.mid_level = 0.6
        disp.vertex_group = 'rough'
        tex2 = bpy.data.textures.new(self._name('rocknoise2'), 'CLOUDS')
        tex2.noise_scale = 0.6
        disp2 = obj.modifiers.new('disp2', 'DISPLACE')
        disp2.texture = tex2
        disp2.strength = 0.45
        disp2.vertex_group = 'rough'
        return obj

    # --------------------------------------------------------------- props
    def prop(self, asset, pos, rot_y=0.0, scale=1.0, mat_override=None, collider=None, decimate=None, lm_weight=0.6):
        """Import a Poly Haven model as static, baked geometry. Its textures are handled by the game:
        the material is renamed prop_<asset> and the game loads that set."""
        path = os.path.join(ROOT, '.cache', 'models', asset, asset + '.gltf')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in new:
            o.parent = None
        for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
            bpy.data.objects.remove(o)
        objs = []
        for o in new:
            me = o.data
            me.transform(o.matrix_world)  # keep the importer's Y-up -> Z-up conversion
            o.matrix_world = Matrix.Identity(4)
            me.transform(Matrix.Scale(scale, 4))
            if decimate:
                mod = o.modifiers.new('dec', 'DECIMATE')
                mod.ratio = decimate
            o.location = g2b(pos)
            o.rotation_euler = Euler((0, 0, rot_y), 'XYZ')
            o.data.materials.clear()
            o.data.materials.append(get_material(mat_override or f'prop_{asset}'))
            o['lm_weight'] = lm_weight
            o['keep_uv'] = True
            o['chunk'] = self.current_chunk
            self.objects.append(o)
            objs.append(o)
        if collider:
            kind = collider[0]
            if kind == 'cyl':
                _, r, h = collider
                self.collider_cyl((pos[0], pos[1] + h / 2, pos[2]), r, h)
            elif kind == 'box':
                _, size, off = collider
                self.collider_box((pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]), size, rot_y)
        return objs


# ---------------------------------------------------------------- pipeline

def apply_modifiers(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if not o.modifiers:
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        o.modifiers.clear()
        old = o.data
        o.data = me
        bpy.data.meshes.remove(old)


def planar_uvs(obj):
    """World-space planar UVs per face, scaled by the material's meters-per-repeat. Adjacent pieces
    line up, and slanted faces are projected in their own plane so textures never stretch."""
    me = obj.data
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    mat_names = [m.name.split('.')[0] if m else 'wall' for m in me.materials]
    up = Vector((0, 0, 1))
    for poly in me.polygons:
        n = (nm @ poly.normal).normalized()
        scale = UV_SCALE.get(mat_names[poly.material_index] if mat_names else 'wall', 2.0)
        if abs(n.z) > 0.7:  # floor / ceiling: world X and (game Z = -blender Y)
            t = Vector((1, 0, 0))
            bt = Vector((0, -1, 0)) if n.z > 0 else Vector((0, 1, 0))
        else:
            t = up.cross(n)
            t.normalize()
            bt = n.cross(t)
            bt.normalize()
            if bt.z < 0:
                bt = -bt
        for li in poly.loop_indices:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (p.dot(t) / scale, p.dot(bt) / scale)


def _smart_project(objs, margin):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def _uv_area(me, layer):
    uv = me.uv_layers[layer].data
    total = 0.0
    for poly in me.polygons:
        idx = list(poly.loop_indices)
        a = uv[idx[0]].uv
        for k in range(1, len(idx) - 1):
            b = uv[idx[k]].uv
            c = uv[idx[k + 1]].uv
            total += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) * 0.5
    return total


def _closed(me):
    """True when every edge has exactly two faces: the mesh encloses a volume."""
    count = {}
    for p in me.polygons:
        for ek in p.edge_keys:
            count[ek] = count.get(ek, 0) + 1
    return bool(count) and all(c == 2 for c in count.values())


# Three fixed, skewed directions for the inside test (majority vote), so a ray that grazes an
# edge or runs along a face cannot decide on its own.
_RAYS = [Vector(d).normalized() for d in ((0.5812, 0.5703, 0.5803), (-0.6211, 0.2987, 0.7247), (0.1733, -0.8931, 0.4152))]


def remove_hidden_faces(objs, label=''):
    """Delete faces buried inside other solids (wall feet on a floor, glow strips set into a wall...).
    They are never seen, but they take lightmap space.

    A face goes only when every one of its sample points, 1 cm in front of it, is inside some other
    closed object. Samples cover the face on a grid about 20 cm apart plus its corners, so a face
    that shows anywhere is kept. Inside means an odd number of crossings along a ray, voted over
    three rays, against one closed mesh at a time. Open meshes (the rock undersides, props, trees)
    and see-through screens never hide anything.
    Also warns about visible coplanar faces from different objects: they z-fight and bake black."""
    t0 = time.time()
    solids = []
    verts, polys, owner = [], [], []
    for oi, o in enumerate(objs):
        mw = o.matrix_world
        wv = [mw @ v.co for v in o.data.vertices]
        pl = [list(p.vertices) for p in o.data.polygons]
        if not wv or not pl:
            solids.append(None)
            continue
        base = len(verts)
        verts.extend(wv)
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append(oi)
        mats = {m.name.split('.')[0] for m in o.data.materials if m}
        if o.get('keep_uv') or o.get('own_lm') or 'screen' in mats or not _closed(o.data):
            solids.append(None)
            continue
        lo = Vector((min(v.x for v in wv), min(v.y for v in wv), min(v.z for v in wv))) - Vector((0.02, 0.02, 0.02))
        hi = Vector((max(v.x for v in wv), max(v.y for v in wv), max(v.z for v in wv))) + Vector((0.02, 0.02, 0.02))
        solids.append((BVHTree.FromPolygons(wv, pl, all_triangles=False, epsilon=0.0), lo, hi, (hi - lo).length + 1.0))
    everything = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)

    def crossings_odd(bvh, q, d, reach):
        n = 0
        o = q
        for _ in range(256):
            loc, _nor, _idx, _dist = bvh.ray_cast(o, d, reach)
            if loc is None:
                break
            n += 1
            o = loc + d * 1e-4
        return n % 2 == 1

    jit = Vector((0.00071, -0.00113, 0.00053))  # off the planes where boxes meet face to face

    def inside_any(q, oi):
        q = q + jit
        for k, sol in enumerate(solids):
            if k == oi or sol is None:
                continue
            bvh, lo, hi, reach = sol
            if not (lo.x <= q.x <= hi.x and lo.y <= q.y <= hi.y and lo.z <= q.z <= hi.z):
                continue
            votes = 0
            for i, d in enumerate(_RAYS):
                if crossings_odd(bvh, q, d, reach):
                    votes += 1
                if votes >= 2 or votes + (len(_RAYS) - 1 - i) < 2:
                    break
            if votes >= 2:
                return True
        return False

    def samples_of(p, mw, me):
        pts = [mw @ me.vertices[vi].co for vi in p.vertices]
        c = sum(pts, Vector()) / len(pts)
        out = [c]
        out += [v.lerp(c, 0.08) for v in pts]  # just inside each corner
        for k in range(1, len(pts) - 1):
            a, b2, c2 = pts[0], pts[k], pts[k + 1]
            area = (b2 - a).cross(c2 - a).length * 0.5
            n = max(1, min(10, math.ceil(math.sqrt(area) / 0.2)))
            for i in range(n):
                for j in range(n - i):
                    u, v = (i + 1 / 3) / n, (j + 1 / 3) / n
                    out.append(a + (b2 - a) * u + (c2 - a) * v)
        return out

    removed = 0
    warned = set()
    for oi, o in enumerate(objs):
        if o.get('keep_uv') or o.get('own_lm') or not o.data.polygons:
            continue  # props and trees keep their authored topology
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        doomed = []
        for p in me.polygons:
            n = (nm @ p.normal).normalized()
            if all(inside_any(sp + n * 0.01, oi) for sp in samples_of(p, mw, me)):
                doomed.append(p.index)
                continue
            # a visible face lying on another object's face z-fights and bakes black
            if p.area * abs(mw.determinant()) ** (2 / 3) < 0.02:
                continue
            c = mw @ p.center
            for (co, hn, hi, dist) in everything.find_nearest_range(c, 0.0015):
                if hi is None:
                    continue
                ooi = owner[hi]
                if ooi != oi and hn.dot(n) > 0.98:
                    key = (min(oi, ooi), max(oi, ooi))
                    if key not in warned:
                        warned.add(key)
                        g = (round(c.x, 2), round(c.z, 2), round(-c.y, 2))
                        print(f'[{label}] WARNING coplanar visible faces: {o.get("src", o.name)} and {objs[ooi].get("src", objs[ooi].name)} at game {g}, normal {(round(n.x, 2), round(n.z, 2), round(-n.y, 2))}')
        if doomed:
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.faces[i] for i in doomed], context='FACES_ONLY')
            loose = [v for v in bm.verts if not v.link_faces]
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.to_mesh(me)
            bm.free()
            me.update()
            removed += len(doomed)
    print(f'[{label}] removed {removed} hidden faces in {time.time() - t0:.1f}s')


def join_static(island, margin=0.004):
    """Apply modifiers, make texture UVs and lightmap UVs, and join everything into one mesh.
    Lightmap UVs: rock is unwrapped before its displacement (so islands stay whole), props reuse
    their own UVs, architecture is smart-projected. Every object is then scaled to the same texel
    density times its lm_weight, and the joined mesh is packed once."""
    objs = island.objects
    for o in objs:
        me = o.data
        if o.get('own_lm'):  # built with its own texture and lightmap UVs (for example, trees)
            continue
        while len(me.uv_layers) > (1 if o.get('keep_uv') else 0):
            me.uv_layers.remove(me.uv_layers[-1])
        if o.get('keep_uv'):
            me.uv_layers[0].name = 'UVMap'
            lm = me.uv_layers.new(name='Lightmap')
            for i, d in enumerate(me.uv_layers['UVMap'].data):
                lm.data[i].uv = d.uv
    rock = [o for o in objs if o.get('lm_method') == 'rock']
    for o in rock:
        o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.new(name='Lightmap')
    if rock:
        _smart_project(rock, margin)
    apply_modifiers(objs)
    remove_hidden_faces(objs, island.key)
    arch = []
    for o in objs:
        me = o.data
        if o.get('keep_uv') or o.get('own_lm'):
            continue
        if 'UVMap' not in me.uv_layers:
            me.uv_layers.new(name='UVMap')
        planar_uvs(o)
        if 'Lightmap' not in me.uv_layers:
            me.uv_layers.new(name='Lightmap')
            arch.append(o)
    if arch:
        _smart_project(arch, margin)
    # Uniform texel density: scale each object's lightmap UVs so uv_area / surface_area is equal.
    bpy.context.view_layer.update()
    for o in objs:
        me = o.data
        mw = o.matrix_world
        area3 = sum(p.area for p in me.polygons) * abs(mw.determinant()) ** (2.0 / 3.0)
        area_uv = _uv_area(me, 'Lightmap')
        if area_uv <= 1e-9 or area3 <= 1e-9:
            continue
        s = math.sqrt(area3 * o.get('lm_weight', 1.0) / area_uv) * 0.01
        for d in me.uv_layers['Lightmap'].data:
            d.uv = d.uv * s
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # one joined mesh per chunk
    chunks = {}
    for o in objs:
        chunks.setdefault(o.get('chunk', 'main'), []).append(o)
    out = []
    for name, group in chunks.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = f'island_{island.key}' if name == 'main' else f'chunk_{name}'
        obj.data.name = obj.name
        out.append(obj)
    return out, None


def lightmap_unwrap(objs, weight_of_material=None, margin=0.004):
    """Pack the (already density-normalized) lightmap islands of every chunk into one atlas."""
    objs = objs if isinstance(objs, list) else [objs]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def setup_world(strength=None):
    sc = bpy.context.scene
    world = bpy.data.worlds.new('sky')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(ROOT, '.cache', 'hdri', 'sky_rotated_2k.hdr'))
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = WORLD['sky']['strength'] if strength is None else strength
    return bg


def sun_dir_game():
    s = WORLD['sun']
    az = math.radians(s['azimuthDeg'])
    el = math.radians(s['elevationDeg'])
    return Vector((math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)))


def setup_sun():
    s = WORLD['sun']
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = s['intensity']
    ld.color = s['color']
    ld.angle = math.radians(s['angleDeg'])
    obj = bpy.data.objects.new('sun', ld)
    bpy.context.scene.collection.objects.link(obj)
    to_sun = g2b(sun_dir_game())
    # light shines along its local -Z; point -Z away from the sun direction
    obj.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()
    return obj


def bake_lightmap(objs, island, size, samples=(256, 128, 64), out_dir=None, quick=False):
    """Bake: A = sky + local lights (direct + indirect), B = sun bounce only, C = sun shadow mask.
    Lightmap RGB = A + B (irradiance / pi), alpha = C."""
    import numpy as np
    sc = bpy.context.scene
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 6
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.target = 'IMAGE_TEXTURES'
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 0
    sc.cycles.use_adaptive_sampling = False
    objs = objs if isinstance(objs, list) else [objs]
    img = bpy.data.images.new('lm_' + island.key, size, size, float_buffer=True, alpha=True)
    done = set()
    for obj in objs:
        obj.data.uv_layers.active = obj.data.uv_layers['Lightmap']
        for m in obj.data.materials:
            if m.name in done:
                continue
            done.add(m.name)
            nt = m.node_tree
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = img
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'Lightmap'
            nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
            nt.nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bg = setup_world()
    sun = setup_sun()

    def run(kind, direct, indirect, spp):
        sc.cycles.samples = spp
        b = sc.render.bake
        b.use_pass_color = False
        b.use_pass_direct = direct
        b.use_pass_indirect = indirect
        t = time.time()
        bpy.ops.object.bake(type=kind)
        a = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        print(f'  bake {kind} d={direct} i={indirect} spp={spp}: {time.time() - t:.1f}s', flush=True)
        return a.reshape(size, size, 4)

    sa, sb, sc_ = samples
    if quick:
        sa, sb, sc_ = 24, 16, 16
    # A: sky + local lights, sun hidden
    sun.hide_render = True
    A = run('DIFFUSE', True, True, sa)
    # B: sun bounce only (world black, local lights hidden)
    sun.hide_render = False
    bg.inputs['Strength'].default_value = 0.0
    for l in island.lights:
        l.hide_render = True
    B = run('DIFFUSE', False, True, sb)
    # C: direct sun only; divided by the unshadowed N.L term below to get the sun visibility mask
    C = run('DIFFUSE', True, False, sc_)
    sc.render.bake.normal_space = 'OBJECT'
    sc.render.bake.normal_r = 'POS_X'
    sc.render.bake.normal_g = 'POS_Y'
    sc.render.bake.normal_b = 'POS_Z'
    sc.cycles.samples = 1
    bpy.ops.object.bake(type='NORMAL')
    N = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(N)
    N = N.reshape(size, size, 4)[..., :3] * 2.0 - 1.0
    for l in island.lights:
        l.hide_render = False
    bg.inputs['Strength'].default_value = WORLD['sky']['strength']
    to_sun = g2b(sun_dir_game())
    ndl = N[..., 0] * to_sun.x + N[..., 1] * to_sun.y + N[..., 2] * to_sun.z
    s = WORLD['sun']
    lum_w = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    sun_lum = float(np.dot(np.array(s['color'], dtype=np.float32), lum_w)) * s['intensity'] / math.pi
    direct = (C[..., :3] * lum_w).sum(-1)
    expected = sun_lum * np.clip(ndl, 0.0, None)
    # The sun mask is only known where a face turns toward the sun. Elsewhere it is filled from
    # known neighbors later (fill_lightmap), never assumed lit: a lit default bleeds through the
    # texture filter as bright lines along shadowed edges.
    cov = A[..., 3] > 0.5
    known = cov & (expected > sun_lum * 0.06)
    mask = np.where(known, np.clip(direct / np.maximum(expected, 1e-6), 0.0, 1.0), 0.0)
    rgb = A[..., :3] + B[..., :3]
    return rgb, mask, known, cov, N


def denoise_lightmap(img, weight, normals=None, radius=2, edge=True):
    """Edge-aware blur in UV space. Only texels with weight > 0.5 contribute. Texels whose baked
    normal differs (another face of the same UV island) do not mix, and with edge=True neither do
    texels of very different brightness, so shadow and crease edges stay sharp."""
    import numpy as np
    one = img.ndim == 2
    x = img[..., None] if one else img
    h, w, _ = x.shape
    wt = (weight > 0.5).astype(np.float32)
    acc = np.zeros_like(x)
    wsum = np.zeros((h, w), dtype=np.float32)
    lum = x.mean(axis=2)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            sh = np.roll(np.roll(x, dy, 0), dx, 1)
            g = np.roll(np.roll(wt, dy, 0), dx, 1) * np.float32(np.exp(-(dx * dx + dy * dy) / (2 * (radius * 0.6) ** 2)))
            if edge:
                sl = np.roll(np.roll(lum, dy, 0), dx, 1)
                g = g * np.exp(-np.abs(sl - lum) / (0.25 * lum + 0.02))
            if normals is not None:
                sn = np.roll(np.roll(normals, dy, 0), dx, 1)
                g = g * np.clip((sn * normals).sum(-1), 0.0, 1.0) ** 16
            acc += sh * g[..., None]
            wsum += g
    out = np.where(wsum[..., None] > 1e-6, acc / np.maximum(wsum, 1e-6)[..., None], x)
    return out[..., 0] if one else out


def fill_lightmap(img, known):
    """Fill every texel that is not known with a smooth average of the nearest known texels
    (push-pull over a pyramid), so the texture filter and mipmaps never pull in junk at island
    edges or from the empty parts of the atlas."""
    import numpy as np
    one = img.ndim == 2
    x = (img[..., None] if one else img).astype(np.float32)
    k = known.astype(np.float32)
    levels = [(x * k[..., None], k)]
    while min(levels[-1][1].shape) > 1:
        xs, ws = levels[-1]
        h2, w2 = ws.shape[0] // 2, ws.shape[1] // 2
        levels.append((xs[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, -1).sum((1, 3)),
                       ws[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))))
    xs, ws = levels[-1]
    cur = xs / np.maximum(ws, 1e-8)[..., None]
    for xs, ws in reversed(levels[:-1]):
        up = np.repeat(np.repeat(cur, 2, 0), 2, 1)
        up = np.pad(up, ((0, ws.shape[0] - up.shape[0]), (0, ws.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        cur = np.where(ws[..., None] > 0, xs / np.maximum(ws, 1e-8)[..., None], up)
    out = np.where(k[..., None] > 0, x, cur)
    return out[..., 0] if one else out


def save_lightmap(rgb, mask, path, quality=92):
    """RGB: sRGB-encoded (irradiance/pi) / scale. A: sun visibility. Returns the scale used."""
    import numpy as np
    from PIL import Image
    scale = WORLD['lightmap']['scale']
    x = np.clip(rgb / scale, 0, 1)
    srgb = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    rng = np.random.default_rng(3)
    dither = (rng.random(srgb.shape) - rng.random(srgb.shape)) / 255.0
    rgb8 = np.clip(np.round((srgb + dither) * 255), 0, 255).astype(np.uint8)
    a8 = np.clip(np.round(mask * 255), 0, 255).astype(np.uint8)
    im = np.dstack([rgb8, a8])[::-1]  # Blender rows are bottom-up; glTF UV v is top-down
    # exact=True: keep RGB where alpha (sun visibility) is 0; the encoder would otherwise discard it
    Image.fromarray(im, 'RGBA').save(path, 'WEBP', quality=quality, alpha_quality=100, method=6, exact=True)
    clipped = float((rgb / scale > 1).mean())
    return scale, clipped


def export_glb(objs, path):
    objs = objs if isinstance(objs, list) else [objs]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # remove bake helper nodes' influence: glTF exporter only reads principled inputs; fine
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_yup=True, export_extras=False,
                              export_image_format='NONE')


def write_json(island, path, extra=None):
    data = {'key': island.key, 'title': island.title, 'colliders': island.colliders,
            'entities': island.entities, 'meta': island.meta}
    if extra:
        data.update(extra)
    with open(path, 'w') as f:
        json.dump(data, f, indent=0, separators=(',', ':'))
