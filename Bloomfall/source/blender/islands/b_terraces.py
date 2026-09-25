"""Island II: the Terraces.

1. The sunken garden. A 4.3 m retaining wall; two small crates and three lattice bollards.
   Grow a crate while standing on it to ride it up, carrying the second crate; stack and ride again.
   When you reach the upper terrace the garden breaks away and falls.
2. The screened gate. A plate holds the gate open. The only crate that can hold it is also the only
   space left: pass through, then take its space back through the screen.

Local origin: arrival floor, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Terraces'

WALL = 4.3  # retaining wall height: needs a medium crate on a large one


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -26
    b.meta['startCells'] = 0

    # ---------------------------------------------------------------- the garden (breaks away)
    with b.chunk('garden'):
        garden_outline = [(-5.0, 17.5), (5.0, 17.5), (6.0, 10.0), (10.4, 8.5), (10.8, -11.8), (-10.8, -11.8), (-10.4, 8.5), (-6.0, 10.0)]
        b.poly_prism(garden_outline, -1.2, -0.1, mat='concrete', bevel=0.04)
        arch.floor(b, -4.5, 10.0, 4.5, 17.0, 0.0, thick=0.1, mat='paving')  # arrival pad
        # the paving follows the outline's cut corners, inside the balustrades
        b.poly_prism([(-9.6, -11.8), (9.6, -11.8), (9.6, 8.1), (4.5, 10.0), (-4.5, 10.0), (-9.6, 8.1)], -0.1, 0.0,
                     mat='paving', bevel=0.02)
        b.underside(garden_outline, -1.2, 16, seed=31)
        # low balustrades along the garden's open sides
        b.balustrade((-9.9, 0.0, 8.0), (-9.9, 0.0, -11.4), height=1.05, mat='marble')
        b.balustrade((9.9, 0.0, 8.0), (9.9, 0.0, -11.4), height=1.05, mat='marble')
        b.balustrade((-4.8, 0.0, 10.4), (-9.6, 0.0, 8.4), height=1.05, mat='marble')
        b.balustrade((4.8, 0.0, 10.4), (9.6, 0.0, 8.4), height=1.05, mat='marble')
        # planters with dead trees, leaf litter, benches
        arch.planter(b, -6.2, 5.2, 0.0, r=1.6, h=0.5, tree='dead_quiver_trunk', tree_scale=2.0, tree_rot=1.2)
        arch.planter(b, 6.4, -7.2, 0.0, r=1.5, h=0.5, tree='dead_quiver_trunk', tree_scale=1.7, tree_rot=2.6)
        b.box((5.6, 0.25, 4.0), (0.6, 0.5, 2.4), mat='marble', bevel=0.04)
        b.box((-5.4, 0.25, -6.0), (2.4, 0.5, 0.6), mat='marble', bevel=0.04)
        # the old stairs up the wall: broken off halfway (the reason you need the Graft)
        for i in range(6):
            h = 0.36 * (i + 1)
            b.box((-7.9, h / 2, -9.2 - 0.34 * i), (2.2, h, 0.34), mat='marble', bevel=0.015)
        arch.rubble(b, -7.6, 0.0, -6.8, 1.6, 10, seed=5, mat='marble', max_size=0.55, collide=False)
        # a broken column (the memory seed rests on it: 3.0 m, reachable from a large crate)
        b.cyl((7.2, 1.5, 5.6), 0.42, 3.0, mat='marble', segments=20, bevel=0.0)
        b.box((7.2, 3.04, 5.6), (1.0, 0.08, 1.0), mat='marble', bevel=0.02)
        arch.lamp_post(b, -3.0, 9.0, 0.0, power=80.0)
        arch.bust(b, -8.6, -1.0, 0.0, ry=math.pi / 2)
        arch.bust(b, 8.6, 2.5, 0.0, ry=-math.pi / 2)
        # bollard sockets (the bollards themselves are lattice)
        for x, z in ((-5.6, -3.6), (5.8, -5.2), (0.4, 2.2)):
            b.box((x, 0.03, z), (1.1, 0.06, 1.1), mat='steel', bevel=0.01, collide=False)

    # ---------------------------------------------------------------- the retaining wall and terrace
    b.box((0.0, (WALL - 0.1) / 2, -12.4), (21.9, WALL - 0.1, 1.2), mat='marble', bevel=0.05)  # retaining wall
    b.box((0.0, WALL - 0.03, -12.42), (22.1, 0.14, 1.36), mat='marble', bevel=0.02)  # coping, 4 cm proud of the floor
    upper = [(-10.8, -12.2), (10.8, -12.2), (10.8, -24.0), (8.0, -34.5), (-8.0, -34.5), (-10.8, -24.0)]
    b.poly_prism(upper, -1.0, WALL - 0.1, mat='wall', bevel=0.04)
    b.poly_prism(upper, WALL - 0.1, WALL, mat='paving', bevel=0.01)
    b.underside(upper, -1.0, 20, seed=32)
    # parapets on the terrace's open sides
    b.balustrade((-10.5, WALL, -13.2), (-10.5, WALL, -19.6), height=1.1, mat='marble')
    b.balustrade((10.5, WALL, -13.2), (10.5, WALL, -19.6), height=1.1, mat='marble')

    # the screened gate wall across the terrace at z = -20
    G = WALL  # terrace floor height
    arch.wall(b, -10.8, -20.0, 10.8, -20.0, G, G + 4.4, thick=0.8, mat='wall', openings=[(9.2, 12.4, 0.0, 3.6)],
              style='classic', pilaster_every=3.2)
    # the gate frame: posts stand 5 cm inside the opening, the lintel just above it
    b.box((-1.75, G + 1.81, -20.0), (0.4, 3.62, 1.1), mat='plates', bevel=0.03)
    b.box((1.75, G + 1.81, -20.0), (0.4, 3.62, 1.1), mat='plates', bevel=0.03)
    b.box((0.0, G + 3.83, -20.0), (4.0, 0.42, 1.1), mat='plates', bevel=0.03)
    b.cyl((-4.0, G + 0.02, -15.4), 1.02, 0.06, mat='steel', segments=48, bevel=0.01, collide=False)  # plate base
    # the yard behind the gate: walls high enough that the garden cannot be seen from it
    for sx in (-1, 1):
        arch.wall(b, sx * 10.8, -20.4, sx * 10.8, -24.0, G, G + 4.4, thick=0.8, mat='wall', style='classic')
        arch.wall(b, sx * 10.8, -24.0, sx * 8.0, -34.5, G, G + 4.4, thick=0.8, mat='wall', style='classic', pilaster_every=3.4)
        arch.urn(b, sx * 9.7, -13.6, G, s=1.2)
    # buttresses on the garden face of the retaining wall
    for x in (-3.0, 3.0, 7.0):
        b.box((x, (WALL - 0.3) / 2, -11.66), (0.9, WALL - 0.3, 0.32), mat='marble', bevel=0.04)
        b.box((x, WALL - 0.22, -11.6), (1.1, 0.16, 0.44), mat='marble', bevel=0.03, collide=False)
    # the ledge at the back of the yard: 2.3 m (needs a medium crate)
    ledge = [(-9.0, -27.0), (9.0, -27.0), (8.2, -34.3), (-8.2, -34.3)]
    b.poly_prism(ledge, G, G + 2.2, mat='marble', bevel=0.04)
    b.poly_prism(ledge, G + 2.2, G + 2.3, mat='paving', bevel=0.01)
    b.box((0.0, G + 2.34, -27.05), (17.8, 0.08, 0.3), mat='marble', bevel=0.02)
    # the bloom dais on the ledge
    b.cyl((0.0, G + 2.45, -31.0), 2.2, 0.3, mat='marble', segments=48, bevel=0.03)
    arch.lamp_post(b, -6.5, -30.0, G + 2.3, power=90.0)
    arch.lamp_post(b, 6.5, -16.0, G, power=90.0)
    # yard detail
    arch.planter(b, -7.0, -24.6, G, r=1.2, h=0.5, tree=None)
    arch.rubble(b, 6.6, G, -25.4, 1.2, 7, seed=9, mat='wall', max_size=0.5, collide=False)

    # ---------------------------------------------------------------- entities
    E = b.entity
    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.0), r=3.0, echo='b_arrive')
    E('zone', id='z_ride', p=(0.0, 0.0, -8.5), r=4.5, card='ride')
    # standing on the terrace, clear of the edge: the garden falls
    E('zone', id='z_top', p=(0.0, G, -16.4), size=(20.8, 6.4), h=3.0, grounded=True)
    E('zone', id='z_bloom', p=(0.0, G + 2.6, -31.0), r=1.8, bloom=True)
    E('bloom', id='bloom', p=(0.0, G + 2.6, -31.0))

    with b.chunk('garden'):
        E('crate', id='c_a', p=(1.8, 0.25, 3.6), level=0, ry=10)
        E('crate', id='c_b', p=(-2.2, 0.25, 4.4), level=0, ry=-25)
        E('bulkhead', id='bol1', p=(-5.6, 0.0, -3.6), size=(0.8, 1.0, 0.8), level=1)
        E('bulkhead', id='bol2', p=(5.8, 0.0, -5.2), size=(0.8, 1.0, 0.8), level=1)
        E('bulkhead', id='bol3', p=(0.4, 0.0, 2.2), size=(0.8, 1.0, 0.8), level=1)
        E('pickup', id='seed', kind='seed', p=(7.2, 3.35, 5.6))

    E('crate', id='c_c', p=(4.2, G + 0.5, -14.8), level=1, ry=15)
    E('plate', id='plate', p=(-4.0, G + 0.05, -15.4), r=0.95, threshold=4)
    E('door', id='gate', p=(0.0, G, -20.0), size=(3.2, 3.6, 0.2), openIf=['plate'], mode='up', travel=3.5, screen=True,
      closeSpeed=2.2)
    E('crate', id='c_d', p=(2.6, G + 0.25, -24.2), level=0, ry=30)
