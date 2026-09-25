"""Architecture helpers built on lib.Island. All coordinates are game space (Y up, metres)."""
import math
import random


def _rects_minus_holes(x0, z0, x1, z1, holes):
    """Split a rectangle into rectangles that avoid the given holes (also rectangles)."""
    xs = {x0, x1}
    zs = {z0, z1}
    for hx0, hz0, hx1, hz1 in holes:
        for v in (hx0, hx1):
            if x0 < v < x1:
                xs.add(v)
        for v in (hz0, hz1):
            if z0 < v < z1:
                zs.add(v)
    xs = sorted(xs)
    zs = sorted(zs)
    cells = []
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            cx = (xs[i] + xs[i + 1]) / 2
            cz = (zs[j] + zs[j + 1]) / 2
            if any(hx0 < cx < hx1 and hz0 < cz < hz1 for hx0, hz0, hx1, hz1 in holes):
                continue
            cells.append([xs[i], zs[j], xs[i + 1], zs[j + 1]])
    # merge along z within columns, then along x
    merged = True
    while merged:
        merged = False
        for a in cells:
            for b in cells:
                if a is b:
                    continue
                if a[0] == b[0] and a[2] == b[2] and a[3] == b[1]:
                    a[3] = b[3]
                    cells.remove(b)
                    merged = True
                    break
                if a[1] == b[1] and a[3] == b[3] and a[2] == b[0]:
                    a[2] = b[2]
                    cells.remove(b)
                    merged = True
                    break
            if merged:
                break
    return cells


def floor(b, x0, z0, x1, z1, y, thick=0.4, mat='tiles', holes=(), bevel=0.02, collide=True):
    """Slab with its top at y. Holes are (x0, z0, x1, z1) rectangles left open."""
    for rx0, rz0, rx1, rz1 in _rects_minus_holes(min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1), holes):
        b.box(((rx0 + rx1) / 2, y - thick / 2, (rz0 + rz1) / 2), (rx1 - rx0, thick, rz1 - rz0), mat=mat,
              bevel=bevel, collide=collide)


def wall(b, x0, z0, x1, z1, y0, y1, thick=0.5, mat='wall', openings=(), bevel=0.03, collide=True, cap=None,
         style=None, trim='marble', pilaster_every=0.0, frames=False):
    """Straight wall from (x0, z0) to (x1, z1). openings: (u0, u1, v0, v1) in metres along the wall
    and heights above y0. The wall is split into boxes around the openings.
    style='classic' adds a plinth course, a two-tier cornice (instead of cap), pilasters every
    pilaster_every metres and, with frames, stone surrounds around the openings. All of it wraps
    both faces of the wall."""
    if style == 'classic':
        _classic_dress(b, x0, z0, x1, z1, y0, y1, thick, openings, trim, pilaster_every, frames)
        cap = None
    openings = [tuple(o[:4]) for o in openings]  # a fifth element marks raised doorways
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    ux, uz = dx / length, dz / length
    ry = math.atan2(ux, uz)  # local +Z along the wall
    h = y1 - y0
    # build pieces in wall-local (u along wall, v up)
    us = {0.0, length}
    for u0, u1, v0, v1 in openings:
        us.add(max(0.0, u0))
        us.add(min(length, u1))
    us = sorted(us)
    pieces = []
    for i in range(len(us) - 1):
        ua, ub = us[i], us[i + 1]
        um = (ua + ub) / 2
        vs = [(0.0, h)]
        for u0, u1, v0, v1 in openings:
            if u0 < um < u1:
                new = []
                for va, vb in vs:
                    if v1 <= va or v0 >= vb:
                        new.append((va, vb))
                        continue
                    if v0 > va:
                        new.append((va, v0))
                    if v1 < vb:
                        new.append((v1, vb))
                vs = new
        for va, vb in vs:
            if vb - va > 0.01 and ub - ua > 0.01:
                pieces.append((ua, ub, va, vb))
    for ua, ub, va, vb in pieces:
        um = (ua + ub) / 2
        cx = x0 + ux * um
        cz = z0 + uz * um
        b.box((cx, y0 + (va + vb) / 2, cz), (thick, vb - va, ub - ua), mat=mat, bevel=bevel, rot_y=ry, collide=collide)
    if cap:
        b.box(((x0 + x1) / 2, y1 + 0.075, (z0 + z1) / 2), (thick + 0.12, 0.15, length + 0.12), mat=cap, bevel=0.03, rot_y=ry,
              collide=collide)


def column(b, x, z, y0, h, r=0.35, mat='marble', base_mat=None, square=False, collide=True):
    base_mat = base_mat or mat
    if square:
        b.box((x, y0 + 0.15, z), (r * 2 + 0.3, 0.3, r * 2 + 0.3), mat=base_mat, bevel=0.03, collide=collide)
        b.box((x, y0 + h / 2, z), (r * 2, h - 0.6, r * 2), mat=mat, bevel=0.03, collide=collide)
        b.box((x, y0 + h - 0.15, z), (r * 2 + 0.3, 0.3, r * 2 + 0.3), mat=base_mat, bevel=0.03, collide=collide)
    else:
        b.box((x, y0 + 0.12, z), (r * 2 + 0.34, 0.24, r * 2 + 0.34), mat=base_mat, bevel=0.03, collide=collide)
        b.cyl((x, y0 + h / 2, z), r, h - 0.5, mat=mat, segments=20, bevel=0.0, collide=collide)
        b.box((x, y0 + h - 0.13, z), (r * 2 + 0.3, 0.26, r * 2 + 0.3), mat=base_mat, bevel=0.03, collide=collide)


def planter(b, x, z, y, r=2.0, h=0.55, tree=None, tree_scale=1.0, tree_rot=0.0, soil='leaves'):
    b.cyl((x, y + h / 2, z), r, h, mat='marble', segments=40, bevel=0.03)
    b.cyl((x, y + h - 0.06, z), r - 0.18, 0.1, mat=soil, segments=40, bevel=0.0, collide=False)
    if tree:
        b.prop(tree, (x, y + h - 0.08, z), rot_y=tree_rot, scale=tree_scale, collider=('cyl', 0.35, 4.0), decimate=0.5)


def rubble(b, cx, y, cz, radius, n, seed, mat='concrete', max_size=0.7, collide=True):
    rnd = random.Random(seed)
    for _ in range(n):
        a = rnd.random() * math.tau
        d = rnd.random() ** 0.6 * radius
        s = (0.25 + rnd.random() * (max_size - 0.25))
        sx, sy, sz = s * (0.7 + rnd.random() * 0.6), s * (0.4 + rnd.random() * 0.5), s * (0.7 + rnd.random() * 0.6)
        rx = (rnd.random() - 0.5) * 0.6
        rz = (rnd.random() - 0.5) * 0.6
        ry = rnd.random() * math.tau
        b.box((cx + math.cos(a) * d, y + sy * 0.35, cz + math.sin(a) * d), (sx, sy, sz), mat=mat, bevel=0.04,
              rot=(rx, ry, rz), collide=collide and s > 0.45)


def seed_pod(b, x, z, y, ry=0.0, open_=True, lit=True):
    """A Tender's sleeping pod: a tall rounded cradle with a hood and a glow ring."""
    c, s = math.cos(ry), math.sin(ry)

    def local(u, v, w):  # u right, v up, w forward (the pod faces +w)
        return (x + u * c + w * s, y + v, z - u * s + w * c)

    b.box(local(0, 0.15, 0), (1.3, 0.3, 1.3), mat='steel', bevel=0.05, rot_y=ry)
    b.box(local(0, 1.25, -0.45), (1.2, 2.3, 0.18), mat='plates', bevel=0.04, rot_y=ry)
    for side in (-1, 1):
        b.box(local(side * 0.57, 1.25, -0.1), (0.14, 2.3, 0.8), mat='plates', bevel=0.04, rot_y=ry)
    b.box(local(0, 2.45, -0.1), (1.3, 0.2, 0.9), mat='steel', bevel=0.05, rot_y=ry)
    b.box(local(0, 0.36, -0.05), (0.9, 0.12, 0.7), mat='lattice', bevel=0.03, rot_y=ry, collide=False)
    if lit:
        b.glow_strip(local(0, 2.33, 0.25), (1.0, 0.04, 0.04), color='glow_warm', rot_y=ry)
    if not open_:
        b.box(local(0, 1.25, 0.34), (1.0, 2.1, 0.06), mat='steel', bevel=0.02, rot_y=ry)


def pipe_run(b, p0, p1, r=0.09, mat='steel'):
    """Horizontal pipe between two points along X or Z with brackets."""
    import mathutils
    a = mathutils.Vector(p0)
    c = mathutils.Vector(p1)
    d = c - a
    length = d.length
    mid = (a + c) / 2
    ry = math.atan2(d.x, d.z)
    b.box((mid.x, mid.y, mid.z), (r * 2, r * 2, length), mat=mat, bevel=r * 0.9, rot_y=ry, collide=False, segments=3,
          lm_weight=0.4)


def lamp_post(b, x, z, y, h=3.6, color=(1.0, 0.62, 0.32), power=140.0):
    b.cyl((x, y + 0.15, z), 0.22, 0.3, mat='steel', segments=16, bevel=0.02)
    b.cyl((x, y + h / 2, z), 0.07, h, mat='steel', segments=12, bevel=0.0, collide=False)
    b.box((x, y + h + 0.1, z), (0.36, 0.2, 0.36), mat='steel', bevel=0.03, collide=False)
    b.glow_strip((x, y + h - 0.02, z), (0.26, 0.04, 0.26), color='glow_warm')
    b.point_light((x, y + h - 0.25, z), color=color, power=power, radius=0.15)


def arch_ring(b, x, z0, z1, y_spring, width, ring=0.9, mat='wall', segs=18, start=0.0, end=1.0, lm_weight=0.6):
    """Semicircular stone arch spanning z0..z1 (along Z), centred on x, springing at y_spring.
    ring: radial depth of the voussoirs. start/end: the part of the half circle that is still
    standing (0 = the z1 springer, 1 = the z0 springer), for broken arches. No collider."""
    import bmesh
    import bpy
    from lib import g2b
    zc = (z0 + z1) / 2
    r_in = abs(z1 - z0) / 2
    r_out = r_in + ring
    bm = bmesh.new()
    rows = []
    for i in range(segs + 1):
        a = math.pi * (start + (end - start) * i / segs)
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for side in (-1, 1):
            xx = x + side * width / 2
            row.append(bm.verts.new(g2b((xx, y_spring + r_in * sa, zc + r_in * ca))))
            row.append(bm.verts.new(g2b((xx, y_spring + r_out * sa, zc + r_out * ca))))
        rows.append(row)  # [left inner, left outer, right inner, right outer]
    for i in range(segs):
        a, c = rows[i], rows[i + 1]
        bm.faces.new([a[0], c[0], c[2], a[2]])  # intrados
        bm.faces.new([a[1], a[3], c[3], c[1]])  # extrados
        bm.faces.new([a[0], a[1], c[1], c[0]])  # left face
        bm.faces.new([a[2], c[2], c[3], a[3]])  # right face
    for row in (rows[0], rows[-1]):
        bm.faces.new([row[0], row[2], row[3], row[1]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(b._name('arch'))
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(me.name, me)
    b._link(obj, mat, lm_weight)
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = 0.03
    mod.segments = 2
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30)
    mod.harden_normals = True
    return obj


def viaduct_pier(b, x, z, top, bottom=-34.0, w=5.2, d=3.2, mat='wall'):
    """A tall masonry pier under a deck, with a stepped base course and a cornice. No collider
    below the deck (the player can never reach it)."""
    h = top - bottom
    b.box((x, bottom + h / 2, z), (w, h, d), mat=mat, bevel=0.06, collide=False, lm_weight=0.5)
    b.box((x, top - 1.05, z), (w + 0.3, 0.3, d + 0.3), mat='marble', bevel=0.04, collide=False, lm_weight=0.5)
    # corner piers and stepped bands: the eye reads them as courses of cut stone
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((x + sx * (w / 2 - 0.25), bottom + 0.5 + (h - 1.7) / 2, z + sz * (d / 2 - 0.25)), (0.62, h - 1.7, 0.62), mat=mat,
                  bevel=0.04, collide=False, lm_weight=0.3)
    y = top - 3.2
    k = 0
    while y > top - 16.0:
        b.box((x, y, z), (w + 0.16, 0.16 if k % 2 else 0.1, d + 0.16), mat='marble' if k == 0 else mat, bevel=0.02, collide=False,
              lm_weight=0.3)
        y -= 2.6
        k += 1


def fluted_shaft_bmesh(r, h, flutes=20, depth=0.04, rings=8):
    """A fluted column shaft as a bmesh in Blender space (Z up, from z = 0 to h), with a slight
    swelling (entasis) in the lower third."""
    import bmesh
    bm = bmesh.new()
    seg = flutes * 4
    rows = []
    for j in range(rings + 1):
        t = j / rings
        z = h * t
        swell = 1.0 + 0.035 * math.sin(math.pi * min(1.0, t * 1.5)) - 0.06 * t
        row = []
        for i in range(seg):
            a = i / seg * math.tau
            # each flute is a shallow groove: depth follows a cosine across the flute
            k = (i % 4) / 4.0
            groove = depth * (0.5 + 0.5 * math.cos(k * math.tau))
            rr = (r - groove) * swell
            row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rows.append(row)
    for j in range(rings):
        for i in range(seg):
            a, b2 = rows[j][i], rows[j][(i + 1) % seg]
            c, d = rows[j + 1][(i + 1) % seg], rows[j + 1][i]
            f = bm.faces.new([a, b2, c, d])
            f.smooth = True
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def fluted_column(b, x, z, y0, h=8.5, r=0.45, mat='marble', collide=True):
    """Plinth, round base, fluted shaft, capital and abacus. Same proportions as the game's
    toppling column (assets/models/column.glb)."""
    import bpy
    from lib import g2b
    b.box((x, y0 + 0.175, z), (1.1, 0.35, 1.1), mat=mat, bevel=0.03, collide=collide)
    b.cyl((x, y0 + 0.45, z), r + 0.08, 0.2, mat=mat, segments=32, bevel=0.03, collide=False)
    shaft_h = h - 0.35 - 0.2 - 0.25 - 0.3
    bm = fluted_shaft_bmesh(r, shaft_h)
    me = bpy.data.meshes.new(b._name('shaft'))
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(me.name, me)
    obj.location = g2b((x, y0 + 0.55, z))
    b._link(obj, mat, 0.8)
    if collide:
        b.collider_cyl((x, y0 + 0.55 + shaft_h / 2, z), r, shaft_h)
    top = y0 + 0.55 + shaft_h
    b.cyl((x, top + 0.125, z), r + 0.02, 0.25, mat=mat, segments=32, bevel=0.03, collide=False, radius_top=r + 0.2)
    b.box((x, top + 0.25 + 0.15, z), (1.1, 0.3, 1.1), mat=mat, bevel=0.03, collide=collide)


def _classic_dress(b, x0, z0, x1, z1, y0, y1, thick, openings, trim, every, frames):
    """Plinth course, cornice, pilasters and opening surrounds for a straight wall.
    Walls running along X sit 1 cm higher than walls along Z, so crossing bands at corners never
    share a face (they would z-fight and bake black)."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    ux, uz = dx / length, dz / length
    ry = math.atan2(ux, uz)
    lift = 0.01 if abs(ux) > abs(uz) else 0.0

    def at(u, y, w_across, h, l_along, mat=trim, collide=False, bevel=0.02):
        b.box((x0 + ux * u, y + lift, z0 + uz * u), (w_across, h, l_along), mat=mat, bevel=bevel, rot_y=ry, collide=collide)

    kinds = [o[4] if len(o) > 4 else ('door' if o[2] < 0.05 else 'window') for o in openings]
    openings = [tuple(o[:4]) for o in openings]
    doors = sorted((u0, u1) for u0, u1, v0, v1 in openings if v0 < 0.05)
    # plinth course, broken at doorways
    edges = [0.0 - 0.08]
    for u0, u1 in doors:
        edges += [u0 - 0.02, u1 + 0.02]
    edges.append(length + 0.08)
    for i in range(0, len(edges), 2):
        a, c = edges[i], edges[i + 1]
        if c - a > 0.1:
            at((a + c) / 2, y0 + 0.27, thick + 0.16, 0.58, c - a)  # 2 cm below the wall's foot
    # cornice: a narrow band under a wider crown
    h = y1 - y0
    at(length / 2, y1 - 0.14, thick + 0.18, 0.28, length + 0.18)
    at(length / 2, y1 + 0.09, thick + 0.4, 0.18, length + 0.4, bevel=0.03)
    # pilasters, clear of the ends and of openings
    if every > 0:
        n = int((length - 2.0) // every)
        start = (length - n * every) / 2
        for k in range(n + 1):
            u = start + k * every
            if u < 1.0 or u > length - 1.0:
                continue
            if any(u0 - 0.5 < u < u1 + 0.5 for u0, u1, v0, v1 in openings):
                continue
            at(u, y0 + 0.56 + (h - 0.56 - 0.28) / 2, thick + 0.24, h - 0.56 - 0.28 - 0.01, 0.56, bevel=0.03)
    # surrounds around openings: jambs, a head, and a sill under windows
    if frames:
        for (u0, u1, v0, v1), kind in zip(openings, kinds):
            w = 0.26
            top = min(v1 + w, h - 0.3)
            for uc in (u0 - w / 2 + 0.03, u1 + w / 2 - 0.03):
                at(uc, y0 + (v0 + top) / 2 + (0.28 if v0 < 0.05 else 0.0) / 2, thick + 0.16, top - v0 - (0.28 if v0 < 0.05 else 0.0), w)
            at((u0 + u1) / 2, y0 + v1 + w / 2 - 0.03, thick + 0.16, w, u1 - u0 + 0.02)
            if kind == 'window':
                at((u0 + u1) / 2, y0 + v0 - 0.05, thick + 0.26, 0.14, u1 - u0 + 0.4)  # sits 2 cm proud of the sill


def bust(b, x, z, y, ry=0.0, scale=2.1, plinth_h=1.25):
    """A marble bust on a plinth."""
    b.box((x, y + 0.08, z), (0.86, 0.16, 0.86), mat='marble', bevel=0.03)
    b.box((x, y + plinth_h / 2, z), (0.62, plinth_h - 0.2, 0.62), mat='marble', bevel=0.02)
    b.box((x, y + plinth_h - 0.06, z), (0.8, 0.12, 0.8), mat='marble', bevel=0.03)
    b.prop('marble_bust_01', (x, y + plinth_h, z), rot_y=ry, scale=scale, decimate=0.45, lm_weight=0.8)


def urn(b, x, z, y, s=1.0, mat='marble'):
    """A stone urn: foot, body, shoulder, neck and lip."""
    b.cyl((x, y + 0.08 * s, z), 0.26 * s, 0.16 * s, mat=mat, segments=24, bevel=0.02, collide=False)
    b.cyl((x, y + 0.26 * s, z), 0.12 * s, 0.2 * s, mat=mat, segments=24, bevel=0.0, collide=False, radius_top=0.2 * s)
    b.cyl((x, y + 0.55 * s, z), 0.2 * s, 0.38 * s, mat=mat, segments=28, bevel=0.0, collide=False, radius_top=0.34 * s)
    b.cyl((x, y + 0.82 * s, z), 0.34 * s, 0.16 * s, mat=mat, segments=28, bevel=0.0, collide=False, radius_top=0.22 * s)
    b.cyl((x, y + 0.96 * s, z), 0.22 * s, 0.12 * s, mat=mat, segments=24, bevel=0.0, collide=False, radius_top=0.28 * s)
    b.collider_cyl((x, y + 0.5 * s, z), 0.3 * s, 1.0 * s)


def rusticate(b, x, z, y0, y1, w, d, every=1.4, mat='wall'):
    """Horizontal grooves on a tall pier: thin bands proud of its faces."""
    y = y0 + every
    while y < y1 - 0.4:
        b.box((x, y, z), (w + 0.1, 0.12, d + 0.1), mat=mat, bevel=0.02, collide=False, lm_weight=0.4)
        y += every
