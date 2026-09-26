"""Island VII: the Heartbloom.

The Graft never runs dry here. A promenade leads to a ring around a bright well; the Heart floats
over the well. Climb the calyx wall with crates (grow them under your feet). On the wall, bring a
crate up after you and grow it at the foot of the last stamen: it falls inward and leans on the
platform under the Heart. Climb it and take the Heart.

Local origin: promenade floor, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Heartbloom'

C = (0.0, -20.0)      # center of the well
WALL = 4.3            # calyx wall
CORE_Y = 7.8          # platform under the Heart
CORE_R = 2.0
HEART_Y = 14.3
SPIRE_R = 7.2         # the stamen's base, from the well's center (north)
SPIRE_H = 6.7
K = math.cos(math.radians(22.5))


def octagon(apothem, cx=C[0], cz=C[1]):
    r = apothem / K
    return [(cx + r * math.cos(math.radians(22.5 + 45 * k)), cz + r * math.sin(math.radians(22.5 + 45 * k))) for k in range(8)]


def octo_ring(b, a_in, a_out, y0, y1, mat, bevel=0.03, collide=True):
    """An octagonal annulus between two apothems, as eight quads (convex hull colliders)."""
    pin, pout = octagon(a_in), octagon(a_out)
    for k in range(8):
        q = [pin[k], pout[k], pout[(k + 1) % 8], pin[(k + 1) % 8]]
        b.poly_prism(q, y0, y1, mat=mat, bevel=bevel, collide=collide)


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -30
    b.meta['startCells'] = 0
    E = b.entity

    # ---------------------------------------------------------------- the promenade
    arch.floor(b, -4.5, -6.2, 4.5, 18.5, 0.0, thick=1.2, mat='paving')
    b.underside([(-4.5, -6.2), (4.5, -6.2), (4.5, 18.5), (-4.5, 18.5)], -1.2, 12, seed=71)
    for side in (-1, 1):
        b.balustrade((side * 4.2, 0.0, 18.2), (side * 4.2, 0.0, -5.4), height=1.05, mat='marble')
        for z in (14.0, 7.0, 0.0):
            # stamens: slender spires with a glowing groove, lining the approach
            b.box((side * 5.3, 0.3, z), (1.0, 0.6, 1.0), mat='marble', bevel=0.04)
            b.cyl((side * 5.3, 4.6, z), 0.26, 8.0, mat='marble', segments=16, bevel=0.0, radius_top=0.12)
            b.glow_strip((side * 5.3 - side * 0.27, 3.2, z), (0.03, 4.8, 0.06), color='glow_cyan')
            b.box((side * 5.3, 0.9, z), (0.8, 0.12, 0.8), mat='steel', bevel=0.02, collide=False)
        b.box((side * 4.75, -0.6, 6.0), (0.5, 1.0, 25.0), mat='wall', bevel=0.03, collide=False)

    # ---------------------------------------------------------------- the ring and the calyx wall
    octo_ring(b, 6.0, 14.0, -1.2, -0.1, 'wall')
    octo_ring(b, 6.0, 14.0, -0.1, 0.0, 'tiles', bevel=0.01)
    b.underside(octagon(14.0), -1.2, 34, seed=72, stem=True)  # a stalk: the well runs 30 m down inside it
    octo_ring(b, 6.0, 9.0, 0.0, WALL - 0.1, 'wall')
    octo_ring(b, 5.9, 9.1, WALL - 0.1, WALL, 'marble', bevel=0.02)
    # courses on the calyx wall: a plinth outside, a band under the coping on both faces
    octo_ring(b, 8.9, 9.18, -0.02, 0.55, 'marble', bevel=0.02, collide=False)
    octo_ring(b, 8.9, 9.16, WALL - 0.5, WALL - 0.3, 'marble', bevel=0.02, collide=False)
    octo_ring(b, 5.84, 6.1, WALL - 0.5, WALL - 0.3, 'marble', bevel=0.02, collide=False)
    # a rail on the wall's inner edge, open on the north where the stamen falls
    pi = octagon(6.25)
    for k in range(8):
        a, c = pi[k], pi[(k + 1) % 8]
        if (a[1] + c[1]) / 2 < C[1] - 5.0:
            continue
        b.balustrade((a[0], WALL, a[1]), (c[0], WALL, c[1]), height=1.05, mat='marble')
    # the ring's outer rail, open where the promenade arrives
    po = octagon(13.7)
    for k in range(8):
        a, c = po[k], po[(k + 1) % 8]
        mz = (a[1] + c[1]) / 2
        if mz > -8.0:  # the south side: split around the promenade
            b.balustrade((a[0], 0.0, a[1]), (-3.4 if a[0] < 0 else 3.4, 0.0, mz), height=1.05, mat='marble')
            b.balustrade((c[0], 0.0, c[1]), (-3.4 if c[0] < 0 else 3.4, 0.0, mz), height=1.05, mat='marble')
            continue
        b.balustrade((a[0], 0.0, a[1]), (c[0], 0.0, c[1]), height=1.05, mat='marble')
    # the well: its walls go down into light
    octo_ring(b, 5.8, 6.0, -30.0, 0.0, 'wall', collide=False)
    b.cyl((C[0], -30.5, C[1]), 5.9, 1.0, mat='glow_cyan', segments=8, bevel=0.0, collide=False, lm_weight=0.3)
    for k in range(8):
        a = math.radians(45 * k)
        x, z = C[0] + math.cos(a) * 5.75, C[1] + math.sin(a) * 5.75
        b.glow_strip((x, -12.0, z), (0.08, 20.0, 0.08), color='glow_cyan')
    b.point_light((C[0], HEART_Y, C[1]), color=(0.6, 0.92, 1.0), power=4000.0, radius=2.0)
    b.point_light((C[0], -6.0, C[1]), color=(0.5, 0.9, 1.0), power=1500.0, radius=3.0, realtime=False)

    # ---------------------------------------------------------------- the climb
    E('crate', id='c_a', p=(1.6, 0.25, -9.2), level=0, ry=12)
    E('crate', id='c_b', p=(-1.4, 0.25, -8.4), level=0, ry=-20)
    E('crate', id='c_c', p=(6.2, 0.25, -12.6), level=0, ry=35)
    # a landing behind the last stamen: the wall top widens outward on the north, with a rail
    t = math.tan(math.radians(22.5))
    a0, a1 = 9.0, 10.6
    land = [(-a0 * t, C[1] - a0), (a0 * t, C[1] - a0), (a1 * t, C[1] - a1), (-a1 * t, C[1] - a1)]
    b.poly_prism(land, 0.0, WALL - 0.1, mat='wall', bevel=0.03)
    top = [(-9.1 * t, C[1] - 9.1), (9.1 * t, C[1] - 9.1), ((a1 + 0.1) * t, C[1] - a1 - 0.1), (-(a1 + 0.1) * t, C[1] - a1 - 0.1)]
    b.poly_prism(top, WALL - 0.1, WALL, mat='marble', bevel=0.02)
    r_out = a1 - 0.25
    b.balustrade((-r_out * t, WALL, C[1] - r_out), (r_out * t, WALL, C[1] - r_out), height=1.05, mat='marble')
    for sx in (-1, 1):
        b.balustrade((sx * r_out * t, WALL, C[1] - r_out), (sx * 9.35 * t, WALL, C[1] - 9.35), height=1.05, mat='marble')

    # the last stamen: a column on the wall's north side. Grown lattice at its foot tips it inward, and
    # it comes to rest with its front face on the rim of the platform under the Heart.
    sz = C[1] - SPIRE_R
    pivot_z = sz + 0.55
    lean = math.degrees(math.atan2((C[1] - CORE_R) - pivot_z, CORE_Y - WALL))
    E('toppler', id='spire', p=(C[0], WALL, sz), height=SPIRE_H, width=1.1, dir=(0.0, 1.0), endAngle=round(lean, 2))
    b.box((C[0], WALL + 0.01, sz), (1.5, 0.02, 1.5), mat='steel', bevel=0.005, collide=False)
    b.cyl((C[0], CORE_Y - 0.25, C[1]), CORE_R, 0.5, mat='marble', segments=48, bevel=0.03)
    b.cyl((C[0], CORE_Y + 0.01, C[1]), CORE_R - 0.4, 0.04, mat='paving', segments=48, bevel=0.0, collide=False)
    b.cyl((C[0], CORE_Y - 1.1, C[1]), 1.2, 1.2, mat='marble', segments=32, bevel=0.03, collide=False, radius_top=1.9)
    E('heart', id='heart', p=(C[0], HEART_Y, C[1]), r=3.3)

    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.5), r=3.2, echo='g_arrive')
    E('zone', id='z_core', p=(C[0], CORE_Y, C[1]), r=2.2, card='core', echo='g_core')
    E('zone', id='z_wall', p=(C[0], WALL, C[1]), r=9.2, h=2.0, grounded=True, echo='g_wall')
    # the Gardener's last note, on the west side of the wall
    b.box((C[0] - 8.2, WALL + 0.35, C[1]), (0.6, 0.7, 0.6), mat='marble', bevel=0.03)
    E('pickup', id='seed', kind='seed', p=(C[0] - 8.2, WALL + 1.1, C[1]))
