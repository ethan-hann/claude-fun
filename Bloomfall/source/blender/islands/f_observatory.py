"""Island VI: the Observatory.

The great instrument in the middle of the plaza has lost its three lenses to the outer stages.
Bring them home: with all three in their cradles, it finds the Heart and the way on opens. The
stages can be taken in any order. Each is reached by a span from the plaza (one cell), and spans
can always be taken back from the plaza, so no order leaves the player short.

West, the Stair. Three pillars climb toward a tower; the lens is on top, 8 m up. Two cells are
   needed: the stage's bollard and the span you crossed (you strand yourself). Leapfrog: raise the
   first pillar, drop to the second, take the first pillar's cells and give them to the second,
   and so on. The last pillar reaches the tower. Take its cells from the floor to put the span back.
East, the Counterweight. The chamber stays open while its plate holds 16, and the lens is the
   weight: a large orb. Take the crate's cell to unfold the short span, carry the small crate in and
   set it on the plate, take the lens's two cells (the door closes) and give them to the crate. At
   16 the door opens again, and the lens is small enough to carry.
North, the Long Reach. The span stops 8 m short of the north stage. A column stands at its edge
   with a small crate beside it, in range from the span's tip. Grow the crate: the column falls
   onto the span and bridges the gap (the span takes one cell, the crate one more). On the stage,
   the lens is in a screened cage that opens while the plate beside it holds 4: the grown crate.

Local origin: the arrival pier, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
from mathutils import Vector
import arch
import lib

TITLE = 'The Observatory'

HX, HZ = 0.0, -14.0   # plaza center
HUB_R = 11.0
DAIS_R = 3.2
DAIS_H = 0.4
CRADLE_R = 2.3
RIM = 0.12            # cradle rim above the dais
SPAN = 7.4            # every plaza span
TOWER = 8.0           # west tower top
COL_H = 9.5           # the north column, long enough to reach onto the span


def ring(cx, cz, r, n, a0=0.0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cz + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def circle_balustrade(b, cx, cz, r, n, gaps, y=0.0, height=1.0):
    """Parapet along a circle, as chords, leaving out the angle ranges in gaps (degrees)."""
    for i in range(n):
        a0 = 360.0 * i / n
        a1 = 360.0 * (i + 1) / n
        mid = (a0 + a1) / 2
        if any(g0 <= mid <= g1 or g0 <= mid + 360 <= g1 for g0, g1 in gaps):
            continue
        p0 = (cx + r * math.cos(math.radians(a0)), y, cz + r * math.sin(math.radians(a0)))
        p1 = (cx + r * math.cos(math.radians(a1)), y, cz + r * math.sin(math.radians(a1)))
        b.balustrade(p0, p1, height=height, mat='marble')


def edge_rim(b, x0, z0, x1, z1, y=0.0):
    """Cornice under a platform edge (decorative)."""
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    b.box((cx, y - 0.28, cz), (max(abs(x1 - x0), 0.36), 0.3, max(abs(z1 - z0), 0.36)), mat='marble', bevel=0.03, collide=False,
          lm_weight=0.5)


def cradle(b, E, cid, x, z):
    """A low square rim on the dais: a small orb dropped inside stays put and lights the ring."""
    y = DAIS_H
    inner = 0.66
    t = 0.12
    for dx, dz, w, d in ((0.0, (inner + t) / 2, inner + 2 * t, t), (0.0, -(inner + t) / 2, inner + 2 * t, t),
                         ((inner + t) / 2, 0.0, t, inner), (-(inner + t) / 2, 0.0, t, inner)):
        b.box((x + dx, y + RIM / 2, z + dz), (w, RIM, d), mat='steel', bevel=0.01)
    b.box((x, y + 0.006, z), (inner, 0.012, inner), mat='plates', bevel=0.0, collide=False)
    E('cradle', id=cid, p=(x, y + RIM, z), r=0.34)


def build(b):
    b.lm_size = 4096
    b.meta['killY'] = -30
    b.meta['startCells'] = 0
    E = b.entity

    # ---------------------------------------------------------------- arrival and the plaza
    arch.floor(b, -3.2, -3.9, 3.2, 5.2, -0.005, thick=1.2, mat='paving')
    for side in (-1, 1):
        b.balustrade((side * 3.0, -0.005, 5.0), (side * 3.0, -0.005, -3.8), height=1.05, mat='marble')
        edge_rim(b, side * 3.3, -3.0, side * 3.3, 5.2)
    plaza = ring(HX, HZ, HUB_R, 40)
    b.poly_prism(plaza, -1.2, 0.0, mat='paving', bevel=0.02)
    b.underside(ring(HX, HZ, HUB_R, 40), -1.2, 22, seed=81)
    # openings: east span, south arrival, west span, north balcony, north-east pier
    # openings (chord midpoints, 9 degree chords): east span, south arrival, west span, north gate,
    # north-east pier
    circle_balustrade(b, HX, HZ, HUB_R - 0.25, 40, gaps=[(-9, 9), (74, 106), (171, 189), (252, 288), (309, 343)])
    b.cyl((HX, -0.29, HZ), HUB_R + 0.1, 0.3, mat='marble', segments=40, bevel=0.03, collide=False, lm_weight=0.5)
    for (x, z) in ((-7.4, -7.0), (7.4, -7.0), (-7.4, -21.0)):
        arch.lamp_post(b, x, z, 0.0, power=90.0)
    for (x, z, ry) in ((-9.2, -10.4, 1.9), (9.2, -10.4, -1.9)):
        arch.bust(b, x, z, 0.0, ry=ry)

    # the great instrument: a round dais, a stepped mount and the telescope, pointed low and west of
    # north, where the Heart will be
    b.poly_prism(ring(HX, HZ, DAIS_R, 32), 0.0, DAIS_H, mat='marble', bevel=0.03)
    b.cyl((HX, DAIS_H + 0.01, HZ), DAIS_R - 0.2, 0.02, mat='tiles', segments=32, bevel=0.0, collide=False)
    for a in range(0, 360, 45):
        rx = HX + (DAIS_R + 0.02) * math.cos(math.radians(a + 22.5))
        rz = HZ + (DAIS_R + 0.02) * math.sin(math.radians(a + 22.5))
        b.glow_strip((rx, 0.2, rz), (0.05, 0.05, 0.9), color='glow_cyan', rot_y=-math.radians(a + 22.5))
    b.box((HX, DAIS_H + 0.5, HZ), (1.9, 1.0, 1.9), mat='marble', bevel=0.04)
    b.box((HX, DAIS_H + 1.6, HZ), (1.3, 1.2, 1.3), mat='plates', bevel=0.03)
    for sx in (-1, 1):
        b.box((HX + sx * 0.55, DAIS_H + 3.0, HZ), (0.16, 1.9, 0.9), mat='steel', bevel=0.02, collide=False)
    pivot = (HX, DAIS_H + 3.6, HZ)
    # aimed at the Heart: island g_heart sits at (-30, 28, -530) and this one at (-6, 25, -447) (see
    # src/main.ts); the Heart floats 14.3 m over g_heart's local (0, -20)
    heart = (-30.0 + 6.0, 28.0 + 14.3 - 25.0, -530.0 - 20.0 + 447.0)
    to = (heart[0] - pivot[0], heart[1] - pivot[1], heart[2] - pivot[2])
    el = math.atan2(to[1], math.hypot(to[0], to[2]))
    az = math.atan2(to[0], -to[2])  # toward -z, a little toward -x
    tube_len = 7.2
    d = (math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el))
    axis = Vector((0.0, 0.0, 1.0)).rotation_difference(lib.g2b(d)).to_euler()

    def along(off, r, L, m, bevel=0.02, segs=40, r_top=None):
        c = (pivot[0] + d[0] * off, pivot[1] + d[1] * off, pivot[2] + d[2] * off)
        o = b.cyl(c, r, L, mat=m, segments=segs, bevel=bevel, collide=False, radius_top=r_top)
        o.rotation_euler = axis
        return o

    along(0.9, 0.6, tube_len, 'plates', bevel=0.03)             # the tube
    along(4.62, 0.7, 0.36, 'steel')                              # objective ring
    along(4.82, 0.52, 0.04, 'glow_white', bevel=0.0)             # the objective glass
    # with all three lenses home, a shaft of light runs from the objective to the Heart
    E('beam', id='beam', p=tuple(round(pivot[i] + d[i] * 4.9, 3) for i in range(3)), openIf=['cr_w', 'cr_e', 'cr_s'],
      target='g_heart.heart')
    for off in (-1.2, 0.9, 3.0):
        along(off, 0.66, 0.22, 'steel')                          # bands
    along(-2.95, 0.36, 0.9, 'steel', r_top=0.5)                  # eyepiece end
    along(-2.2, 0.8, 0.8, 'steel')                               # counterweight collar
    cradle(b, E, 'cr_w', HX - CRADLE_R, HZ)
    cradle(b, E, 'cr_e', HX + CRADLE_R, HZ)
    cradle(b, E, 'cr_s', HX, HZ + CRADLE_R)
    b.point_light((HX, 2.4, HZ + 1.6), color=(0.6, 0.85, 1.0), power=60.0, radius=0.3)

    # the plaza's own space: two bollards
    E('bulkhead', id='b1', p=(-4.8, 0.0, -6.2), size=(0.8, 1.0, 0.8), level=1)
    E('bulkhead', id='b2', p=(4.8, 0.0, -6.2), size=(0.8, 1.0, 0.8), level=1)
    for x in (-4.8, 4.8):
        b.box((x, 0.03, -6.2), (1.1, 0.06, 1.1), mat='steel', bevel=0.01, collide=False)

    E('spawn', p=(0.0, 0.05, 1.2), yaw=0)
    E('arrive', p=(0.0, 0.0, 3.8))
    E('zone', id='z_arrive', p=(0.0, 0.0, 1.0), r=3.0, echo='f_arrive')
    E('zone', id='z_dais', p=(HX, 0.0, HZ + 5.0), r=3.0, echo='f_dais', card='lens')
    E('zone', id='z_plaza', p=(HX, 0.0, HZ), r=HUB_R - 1.0, takeback=True)

    # ---------------------------------------------------------------- the way on: the north balcony
    arch.floor(b, -3.0, -32.0, 3.0, -24.6, -0.005, thick=1.2, mat='paving')
    for side in (-1, 1):
        b.balustrade((side * 2.8, -0.005, -25.2), (side * 2.8, -0.005, -31.8), height=1.05, mat='marble')
        edge_rim(b, side * 3.1, -24.6, side * 3.1, -32.0)
    # the bridge to the Heart leaves to the north-west: the rail stops short of it
    b.balustrade((0.4, -0.005, -31.8), (2.8, -0.005, -31.8), height=1.05, mat='marble')
    b.cyl((0.0, 0.15, -29.4), 1.7, 0.3, mat='marble', segments=40, bevel=0.03)
    E('bloom', id='bloom', p=(0.0, 0.3, -29.4))
    E('zone', id='z_bloom', p=(0.0, 0.3, -29.4), r=1.6, bloom=True)
    # gate: jambs and a lintel in the plaza's rim, a slab that rises once all three lenses sit
    # jambs wide enough to meet the plaza's parapet on either side, reaching 2 cm below the floor
    for sx in (-1, 1):
        b.box((sx * 2.5, 1.74, -25.1), (1.8, 3.52, 0.8), mat='marble', bevel=0.03)
    b.box((0.0, 3.7, -25.1), (6.8, 0.4, 0.8), mat='marble', bevel=0.03)
    # two leaves that part into the jambs
    for gid, sx, mode in (('gate', -1, 'left'), ('gate_r', 1, 'right')):
        E('door', id=gid, p=(sx * 0.8, 0.0, -25.1), size=(1.6, 3.5, 0.3), openIf=['cr_w', 'cr_e', 'cr_s'], mode=mode,
          travel=1.55, latch=True)
    E('zone', id='z_gate', p=(0.0, 0.0, -22.4), r=2.4, echo='f_gate')

    # ---------------------------------------------------------------- west: the Stair
    W0, W1 = -HUB_R - SPAN, -32.6   # east edge (the span's tip), west edge
    arch.floor(b, W1, -20.0, W0, -8.0, 0.0, thick=1.2, mat='tiles',
               holes=[(-23.42, -15.02, -21.38, -12.98), (-26.42, -15.02, -24.38, -12.98), (-29.42, -15.02, -27.38, -12.98)])
    b.underside([(W1, -8.0), (W0, -8.0), (W0, -20.0), (W1, -20.0)], -1.2, 14, seed=82)
    for z in (-8.25, -19.75):
        b.balustrade((W0 - 0.3, 0.0, z), (W1 + 0.3, 0.0, z), height=1.0, mat='marble')
    b.balustrade((W1 + 0.25, 0.0, -8.5), (W1 + 0.25, 0.0, -12.2), height=1.0, mat='marble')
    b.balustrade((W1 + 0.25, 0.0, -15.8), (W1 + 0.25, 0.0, -19.5), height=1.0, mat='marble')
    b.balustrade((W0 + 0.25, 0.0, -8.5), (W0 + 0.25, 0.0, -12.6), height=1.0, mat='marble')
    b.balustrade((W0 + 0.25, 0.0, -15.4), (W0 + 0.25, 0.0, -19.5), height=1.0, mat='marble')
    E('span', id='s_w', p=(-HUB_R, 0.0, HZ), dir=(-1.0, 0.0), width=2.4, lengths=[0.6, SPAN], level=0)
    E('bulkhead', id='b_w', p=(-20.6, 0.0, -9.4), size=(0.8, 1.0, 0.8), level=1)
    b.box((-20.6, 0.03, -9.4), (1.1, 0.06, 1.1), mat='steel', bevel=0.01, collide=False)
    # three pillars, each one step higher than the last, then the tower
    E('pillar', id='p1', p=(-22.4, 0.0, -14.0), size=(2.0, 2.0), heights=[0.0, 2.0, 4.0], level=0, depth=2.0)
    E('pillar', id='p2', p=(-25.4, 2.0, -14.0), size=(2.0, 2.0), heights=[0.0, 2.0, 4.0], level=0, depth=4.0)
    E('pillar', id='p3', p=(-28.4, 4.0, -14.0), size=(2.0, 2.0), heights=[0.0, 2.0, 4.0], level=0, depth=6.0)
    b.box((-31.4, TOWER / 2, -14.0), (2.0, TOWER, 2.0), mat='wall', bevel=0.04)
    b.box((-31.4, TOWER + 0.06, -14.0), (2.3, 0.12, 2.3), mat='marble', bevel=0.02)
    for dx, dz, w, d in ((0.0, 1.05, 2.3, 0.2), (0.0, -1.05, 2.3, 0.2), (-1.05, 0.0, 0.2, 1.9)):
        b.box((-31.4 + dx, TOWER + 0.24, -14.0 + dz), (w, 0.24, d), mat='marble', bevel=0.02)
    E('orb', id='lens_w', p=(-31.5, TOWER + 0.4, -14.0), level=0, lens=True)
    b.glow_strip((-30.35, TOWER - 0.6, -14.0), (0.04, 0.05, 1.4), color='glow_warm')
    arch.lamp_post(b, -21.0, -18.6, 0.0, power=80.0)
    arch.urn(b, -31.0, -9.0, 0.0, s=1.1)
    arch.urn(b, -31.0, -19.0, 0.0, s=1.1)
    # a sundial, for the stage's name
    b.cyl((-24.6, 0.25, -9.6), 1.0, 0.5, mat='marble', segments=32, bevel=0.03)
    b.box((-24.6, 0.9, -9.6), (0.06, 0.8, 0.9), mat='steel', bevel=0.01, collide=False, rot_y=0.5)
    E('zone', id='z_west', p=(-22.0, 0.0, -14.0), r=3.6, takeback=True)

    # ---------------------------------------------------------------- east: the Counterweight
    E0 = HUB_R + SPAN
    arch.floor(b, E0, -20.0, 26.0, -8.0, 0.0, thick=1.2, mat='paving')
    b.underside([(E0, -8.0), (26.0, -8.0), (26.0, -20.0), (E0, -20.0)], -1.2, 12, seed=83)
    for z in (-8.25, -19.75):
        b.balustrade((E0 + 0.3, 0.0, z), (25.7, 0.0, z), height=1.0, mat='marble')
    b.balustrade((E0 - 0.25, 0.0, -8.5), (E0 - 0.25, 0.0, -12.6), height=1.0, mat='marble')
    b.balustrade((E0 - 0.25, 0.0, -15.4), (E0 - 0.25, 0.0, -19.5), height=1.0, mat='marble')
    b.balustrade((25.75, 0.0, -8.5), (25.75, 0.0, -12.6), height=1.0, mat='marble')
    b.balustrade((25.75, 0.0, -15.4), (25.75, 0.0, -19.5), height=1.0, mat='marble')
    E('span', id='s_e', p=(HUB_R, 0.0, HZ), dir=(1.0, 0.0), width=2.4, lengths=[0.6, SPAN], level=0)
    E('crate', id='c_e', p=(21.6, 0.5, -10.6), level=1, ry=14)
    E('span', id='s_e2', p=(26.0, 0.0, HZ), dir=(1.0, 0.0), width=2.2, lengths=[0.6, 4.4], level=0)
    arch.lamp_post(b, 20.2, -18.6, 0.0, power=80.0)
    # the chamber pier, across a 4.4 m gap
    C0, C1 = 30.4, 38.6
    arch.floor(b, C0, -19.4, C1, -8.6, 0.0, thick=1.2, mat='tiles')
    b.underside([(C0, -8.6), (C1, -8.6), (C1, -19.4), (C0, -19.4)], -1.2, 12, seed=84)
    # chamber: walls on three sides and around the door, open to the sky
    CX0, CX1, CZ0, CZ1 = 31.8, 38.2, -18.6, -9.4
    arch.wall(b, CX0, CZ0, CX1, CZ0, 0.0, 4.6, thick=0.5, mat='wall', style='classic', pilaster_every=3.2)
    arch.wall(b, CX0, CZ1, CX1, CZ1, 0.0, 4.6, thick=0.5, mat='wall', style='classic', pilaster_every=3.2)
    arch.wall(b, CX1, CZ1 - 0.25, CX1, CZ0 + 0.25, 0.0, 4.6, thick=0.5, mat='wall')
    arch.wall(b, CX0, CZ1 - 0.25, CX0, CZ0 + 0.25, 0.0, 4.6, thick=0.5, mat='wall', openings=[(3.1, 5.6, 0.0, 3.2)])
    b.box((CX0, 3.45, HZ), (0.7, 0.3, 3.0), mat='marble', bevel=0.03)
    E('door', id='door_e', p=(CX0, 0.0, HZ), size=(0.2, 3.2, 2.6), openIf=['plate_e'], mode='up', travel=2.4, closeSpeed=2.0,
      screen=True)
    b.cyl((35.2, 0.003, HZ), 1.72, 0.01, mat='steel', segments=48, bevel=0.003, collide=False)
    E('plate', id='plate_e', p=(35.2, 0.008, HZ), r=1.6, threshold=16)
    E('orb', id='lens_e', p=(35.2, 1.05, HZ), level=2, lens=True)
    b.glow_strip((37.9, 3.9, HZ), (0.04, 0.05, 3.0), color='glow_warm')
    E('zone', id='z_east', p=(22.0, 0.0, -14.0), r=3.4, takeback=True)
    E('zone', id='z_chamber', p=(35.0, 0.0, HZ), size=(6.0, 8.8), h=4.0, echo='f_chamber')

    # ---------------------------------------------------------------- north: the Long Reach
    NX = 8.5
    arch.floor(b, NX - 2.0, -27.0, NX + 2.0, -18.5, -0.005, thick=1.2, mat='paving')
    for side in (-1, 1):
        # from where the pier leaves the plaza's circle to the pier's end
        z_in = HZ - math.sqrt((HUB_R - 0.25) ** 2 - (NX + side * 1.8) ** 2)
        b.balustrade((NX + side * 1.8, -0.005, z_in), (NX + side * 1.8, -0.005, -26.8), height=1.05, mat='marble')
        edge_rim(b, NX + side * 2.1, -18.5, NX + side * 2.1, -27.0)
    E('span', id='s_n', p=(NX, 0.0, -27.0), dir=(0.0, -1.0), width=2.4, lengths=[0.6, SPAN], level=0)
    E('zone', id='z_reach', p=(NX, 0.0, -24.0), r=2.4, card='range', takeback=True)
    N0 = -27.0 - SPAN - 8.0   # the stage's south edge, 8 m past the span's tip
    N1 = N0 - 11.0
    arch.floor(b, NX - 6.0, N1, NX + 6.0, N0, 0.0, thick=1.2, mat='paving')
    b.underside([(NX - 6.0, N0), (NX + 6.0, N0), (NX + 6.0, N1), (NX - 6.0, N1)], -1.2, 14, seed=85)
    for side in (-1, 1):
        b.balustrade((NX + side * 5.75, 0.0, N0 - 0.3), (NX + side * 5.75, 0.0, N1 + 0.3), height=1.0, mat='marble')
    b.balustrade((NX - 5.7, 0.0, N1 + 0.25), (NX + 5.7, 0.0, N1 + 0.25), height=1.0, mat='marble')
    b.balustrade((NX - 5.7, 0.0, N0 - 0.25), (NX - 1.4, 0.0, N0 - 0.25), height=1.0, mat='marble')
    b.balustrade((NX + 1.4, 0.0, N0 - 0.25), (NX + 5.7, 0.0, N0 - 0.25), height=1.0, mat='marble')
    colz = N0 - 1.0
    E('toppler', id='col', p=(NX, 0.0, colz), height=COL_H, width=1.1, dir=(0.0, 1.0), endAngle=90)
    E('crate', id='c_n', p=(NX + 1.35, 0.25, colz), level=0, ry=8)
    # the lens cage: screens all round and over the top, and a screen door facing south
    KX, KZ = NX - 2.2, N1 + 2.6
    for dx in (-1.3, 1.3):
        b.screen((KX + dx, 1.4, KZ), (0.02, 2.8, 2.6))
    b.screen((KX, 1.4, KZ - 1.3), (2.6, 2.8, 0.02))
    b.screen((KX, 2.8, KZ), (2.6, 0.02, 2.6))
    for dx in (-1.3, 1.3):
        for dz in (-1.3, 1.3):
            b.box((KX + dx, 1.45, KZ + dz), (0.14, 2.9, 0.14), mat='steel', bevel=0.02)
    E('door', id='cage', p=(KX, 0.0, KZ + 1.3), size=(2.4, 2.7, 0.14), openIf=['plate_n'], mode='up', travel=2.5, screen=True)
    E('orb', id='lens_n', p=(KX, 0.3, KZ - 0.2), level=0, lens=True)
    b.cyl((NX + 3.0, 0.003, KZ + 0.4), 1.02, 0.01, mat='steel', segments=48, bevel=0.003, collide=False)
    E('plate', id='plate_n', p=(NX + 3.0, 0.008, KZ + 0.4), r=0.95, threshold=4)
    arch.lamp_post(b, NX + 4.8, N0 - 1.6, 0.0, power=80.0)
    # the memory: a star chart on a plinth, the last thing the survey drew
    b.box((NX + 4.6, 0.45, N1 + 1.2), (0.7, 0.9, 0.7), mat='marble', bevel=0.04)
    E('pickup', id='seed', kind='seed', p=(NX + 4.6, 1.3, N1 + 1.2))
    E('zone', id='z_north', p=(NX, 0.0, N0 - 5.0), r=5.0, takeback=True)
