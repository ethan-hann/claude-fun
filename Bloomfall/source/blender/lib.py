"""Bloomfall Blender library: builds island geometry from Python, bakes lightmaps, exports GLB.

Authoring is in game space (Y up, metres). Blender is Z up, so every point goes through g2b().
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
from mathutils import Vector, Matrix, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLD = json.load(open(os.path.join(ROOT, 'shared', 'world.json')))
ALBEDO = json.load(open(os.path.join(ROOT, 'shared', 'albedo.json')))

# Metres per texture repeat for each material (texel density of the tiling textures).
UV_SCALE = {
    'wall': 3.0, 'ribbed': 2.0, 'tiles': 2.4, 'concrete': 3.0, 'marble': 2.0, 'rock': 6.0,
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

    # ------------------------------------------------------------------ helpers
    def _name(self, base):
        self._n += 1
        return f'{base}_{self._n}'

    def _link(self, obj, mat, lm_weight=1.0):
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(get_material(mat))
        obj['lm_weight'] = lm_weight
        self.objects.append(obj)
        return obj

    def collider_box(self, center, size, rot_y=0.0, kind='solid', tag=None):
        rec = {'t': 'box', 'p': list(map(float, center)), 'h': [size[0] / 2, size[1] / 2, size[2] / 2],
               'ry': float(rot_y), 'k': kind}
        if tag:
            rec['tag'] = tag
        self.colliders.append(rec)

    def collider_hull(self, points, kind='solid'):
        self.colliders.append({'t': 'hull', 'v': [list(map(float, p)) for p in points], 'k': kind})

    def collider_cyl(self, center, radius, height, kind='solid'):
        self.colliders.append({'t': 'cyl', 'p': list(map(float, center)), 'r': float(radius),
                               'hh': float(height) / 2, 'k': kind})

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
            obj.rotation_euler = Euler((rot[0], -rot[2], rot[1]), 'XYZ')
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
                                       'r': list(map(float, rot)), 'k': kind})
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
        for r in range(rings + 1):
            t = r / rings
            shrink = (1 - t) ** 1.25 * 0.97 + 0.03  # radius factor at depth
            y = top_y - 0.05 - depth * (t ** 0.85)
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
        # make sure normals point outward (down/out): flip if the top ring faces inward
        me = bpy.data.meshes.new(self._name('under'))
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        obj = bpy.data.objects.new(me.name, me)
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
        tex2 = bpy.data.textures.new(self._name('rocknoise2'), 'CLOUDS')
        tex2.noise_scale = 0.6
        disp2 = obj.modifiers.new('disp2', 'DISPLACE')
        disp2.texture = tex2
        disp2.strength = 0.45
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
    """World-space planar UVs per face, scaled by the material's metres-per-repeat. Adjacent pieces
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


def join_static(island, margin=0.004):
    """Apply modifiers, make texture UVs and lightmap UVs, and join everything into one mesh.
    Lightmap UVs: rock is unwrapped before its displacement (so islands stay whole), props reuse
    their own UVs, architecture is smart-projected. Every object is then scaled to the same texel
    density times its lm_weight, and the joined mesh is packed once."""
    objs = island.objects
    for o in objs:
        me = o.data
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
    arch = []
    for o in objs:
        me = o.data
        if o.get('keep_uv'):
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
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = f'island_{island.key}'
    obj.data.name = obj.name
    # UVMap first, Lightmap second (TEXCOORD_0 / TEXCOORD_1)
    return obj, None


def lightmap_unwrap(obj, weight_of_material=None, margin=0.004):
    """Pack the (already density-normalized) lightmap islands into the unit square."""
    me = obj.data
    me.uv_layers.active = me.uv_layers['Lightmap']
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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


def bake_lightmap(obj, island, size, samples=(256, 128, 64), out_dir=None, quick=False):
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
    me = obj.data
    me.uv_layers.active = me.uv_layers['Lightmap']
    img = bpy.data.images.new('lm_' + island.key, size, size, float_buffer=True, alpha=True)
    for m in me.materials:
        nt = m.node_tree
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'Lightmap'
        nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
        nt.nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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
    mask = np.where(expected > sun_lum * 0.06, np.clip(direct / np.maximum(expected, 1e-6), 0.0, 1.0), 1.0)
    rgb = A[..., :3] + B[..., :3]
    return rgb, mask, A[..., 3]


def denoise_lightmap(rgb, coverage, radius=2):
    """Edge-aware blur in UV space that never mixes texels from outside the covered area."""
    import numpy as np
    h, w, _ = rgb.shape
    cov = (coverage > 0.5).astype(np.float32)
    acc = np.zeros_like(rgb)
    wsum = np.zeros((h, w), dtype=np.float32)
    lum = rgb.mean(axis=2)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            sh = np.roll(np.roll(rgb, dy, 0), dx, 1)
            sl = np.roll(np.roll(lum, dy, 0), dx, 1)
            sc = np.roll(np.roll(cov, dy, 0), dx, 1)
            wgt = sc * np.exp(-(dx * dx + dy * dy) / (2 * (radius * 0.6) ** 2)) * \
                np.exp(-np.abs(sl - lum) / (0.25 * lum + 0.02))
            acc += sh * wgt[..., None]
            wsum += wgt
    out = np.where(wsum[..., None] > 1e-6, acc / np.maximum(wsum, 1e-6)[..., None], rgb)
    return out


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


def export_glb(obj, path):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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
