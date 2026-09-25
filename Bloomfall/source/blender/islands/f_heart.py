"""Island VI: the Heartbloom.

The Graft never runs dry here. A promenade leads to a ring around a bright well; the Heart floats
over the well. Climb the calyx wall with crates (grow them under your feet), cross to the pillar
in the well and raise it as far as it goes, jump to the platform under the Heart, and take it.

Local origin: promenade floor, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Heartbloom'

C = (0.0, -20.0)      # centre of the well
WALL = 4.3            # calyx wall
CORE_Y = 10.3         # platform under the Heart
HEART_Y = 16.8
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
    b.underside(octagon(14.0), -1.2, 16, seed=72)
    octo_ring(b, 6.0, 9.0, 0.0, WALL - 0.1, 'wall')
    octo_ring(b, 5.9, 9.1, WALL - 0.1, WALL, 'marble', bevel=0.02)
    # courses on the calyx wall: a plinth outside, a band under the coping on both faces
    octo_ring(b, 8.9, 9.18, -0.02, 0.55, 'marble', bevel=0.02, collide=False)
    octo_ring(b, 8.9, 9.16, WALL - 0.5, WALL - 0.3, 'marble', bevel=0.02, collide=False)
    octo_ring(b, 5.84, 6.1, WALL - 0.5, WALL - 0.3, 'marble', bevel=0.02, collide=False)
    # a rail on the wall's inner edge, open on the east where the pillar rises
    pi = octagon(6.25)
    for k in range(8):
        a, c = pi[k], pi[(k + 1) % 8]
        if (a[0] + c[0]) / 2 > 5.0:
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
    E('pillar', id='p', p=(4.5, WALL, C[1]), size=(2.0, 2.0), heights=[0.0, 1.5, 3.0, 4.5, 6.0], level=0, depth=34.0)
    b.cyl((C[0], CORE_Y - 0.25, C[1]), 2.0, 0.5, mat='marble', segments=48, bevel=0.03)
    b.cyl((C[0], CORE_Y + 0.01, C[1]), 1.6, 0.04, mat='paving', segments=48, bevel=0.0, collide=False)
    b.cyl((C[0], CORE_Y - 1.1, C[1]), 1.2, 1.2, mat='marble', segments=32, bevel=0.03, collide=False, radius_top=1.9)
    E('heart', id='heart', p=(C[0], HEART_Y, C[1]), r=3.3)

    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.5), r=3.2, echo='f_arrive')
    E('zone', id='z_inf', p=(0.0, 0.0, 2.0), r=4.0, card='infinite')
    E('zone', id='z_core', p=(C[0], CORE_Y, C[1]), r=2.2, card='core', echo='f_core')
    # the Gardener's last note, on the far side of the wall
    b.box((0.0, WALL + 0.35, C[1] - 8.2), (0.6, 0.7, 0.6), mat='marble', bevel=0.03)
    E('pickup', id='seed', kind='seed', p=(0.0, WALL + 1.1, C[1] - 8.2))
