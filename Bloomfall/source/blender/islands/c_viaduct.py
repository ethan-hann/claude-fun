"""Island III: the Viaduct.

1. Spans. The only space on the abutment is in the span to the lookout. Take it and give it to
   the span across the first gap.
2. Take what is behind you. From the pier, take the span you crossed (the abutment falls away)
   and give it to the pillar. Ride it up to the upper deck.
3. Leapfrog. Take the pillar back, extend the next span, cross. Bring the crate from the middle
   pier, take that span back, extend the last one.
4. The shrine. A ram pushes the crate through a slot into a screened alcove, onto a heavy plate.
   Take the ram back and grow the crate through the screen: the gate opens.
5. The second cell. Inside, the Graft learns to hold two. Take both cells out of the crate, raise
   the pillar two steps and climb to the bloom.

Local origin: arrival deck, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Viaduct'

UP = 2.8          # upper deck, middle pier and shrine deck
SHRINE_S = -44.0  # shrine south wall
SHRINE_N = -56.0  # shrine north wall
MEZZ = UP + 4.3   # mezzanine top: needs the pillar at its second step


def deck_rim(b, x, z0, z1, y, mat='marble'):
    """Cornice along a deck edge (decorative, no collider)."""
    b.box((x, y - 0.28, (z0 + z1) / 2), (0.36, 0.3, abs(z1 - z0)), mat=mat, bevel=0.03, collide=False, lm_weight=0.5)


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -30
    b.meta['startCells'] = 0
    E = b.entity

    # ---------------------------------------------------------------- the abutment and the lookout
    with b.chunk('abutment'):
        arch.floor(b, -4.5, 4.0, 4.5, 18.5, 0.0, thick=1.2, mat='paving')
        arch.viaduct_pier(b, 0.0, 11.0, -1.2, w=7.2, d=12.0)
        # the broken end the old viaduct once continued from, and the stub of the arch over the gap
        arch.arch_ring(b, 0.0, 18.5, 27.5, -9.2, 6.4, ring=1.1, start=0.72, end=1.0)
        arch.arch_ring(b, 0.0, -3.0, 4.0, -5.8, 6.4, ring=1.0, start=0.0, end=0.3)
        for side in (-1, 1):
            deck_rim(b, side * 4.6, 4.0, 18.5, 0.0)
        b.balustrade((4.3, 0.0, 18.2), (4.3, 0.0, 4.4), height=1.05, mat='marble')
        b.balustrade((-4.3, 0.0, 18.2), (-4.3, 0.0, 11.1), height=1.05, mat='marble')
        b.balustrade((-4.3, 0.0, 7.9), (-4.3, 0.0, 4.4), height=1.05, mat='marble')
        arch.lamp_post(b, 3.3, 15.6, 0.0, power=80.0)
        arch.urn(b, -3.6, 5.2, 0.0, s=1.2)
        arch.urn(b, 3.6, 5.2, 0.0, s=1.2)
        arch.rubble(b, -2.8, 0.0, 16.8, 1.1, 6, seed=41, mat='marble', max_size=0.45, collide=False)
        # the lookout: a round balcony on its own column, with a memory on a plinth
        b.cyl((-11.2, -0.6, 9.5), 2.5, 1.2, mat='marble', segments=40, bevel=0.03)
        b.cyl((-11.2, -1.35, 9.5), 2.62, 0.3, mat='marble', segments=40, bevel=0.03, collide=False)
        b.cyl((-11.2, -18.0, 9.5), 1.3, 33.0, mat='wall', segments=24, bevel=0.0, collide=False, lm_weight=0.4)
        for a0 in (60, 150, 240):
            a1 = a0 + 70
            p0 = (-11.2 + math.cos(math.radians(a0)) * 2.3, 0.0, 9.5 + math.sin(math.radians(a0)) * 2.3)
            p1 = (-11.2 + math.cos(math.radians(a1)) * 2.3, 0.0, 9.5 + math.sin(math.radians(a1)) * 2.3)
            b.balustrade(p0, p1, height=1.0, mat='marble')
        b.box((-12.2, 0.45, 9.5), (0.6, 0.9, 0.6), mat='marble', bevel=0.04)
        E('pickup', id='seed', kind='seed', p=(-12.2, 1.3, 9.5))
        # the span to the lookout starts extended: the island's first cell of space
        E('span', id='s_look', p=(-4.5, 0.0, 9.5), dir=(-1.0, 0.0), width=2.2, lengths=[0.6, 4.2], level=1)
        # the span across the first gap starts folded
        E('span', id='s_a', p=(0.0, 0.0, 4.0), dir=(0.0, -1.0), width=2.4, lengths=[0.6, 7.0], level=0)

    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.5), r=3.2, echo='c_arrive')
    E('zone', id='z_span', p=(0.0, 0.0, 6.6), r=3.0, card='span')

    # ---------------------------------------------------------------- pier one and the pillar
    p1_hole = (-1.03, -9.93, 1.03, -7.87)
    arch.floor(b, -3.5, -10.0, 3.5, -3.0, 0.0, thick=1.2, mat='paving', holes=[p1_hole])
    arch.viaduct_pier(b, 0.0, -6.5, -1.2, w=6.2, d=5.6)
    arch.arch_ring(b, 0.0, -3.0, 4.0, -5.8, 6.4, ring=1.0, start=0.78, end=1.0)
    for side in (-1, 1):
        deck_rim(b, side * 3.6, -3.0, -10.0, 0.0)
        b.balustrade((side * 3.3, 0.0, -3.4), (side * 3.3, 0.0, -9.7), height=1.05, mat='marble')
    b.box((0.0, -0.62, -8.9), (2.3, 1.2, 2.3), mat='steel', bevel=0.02, collide=False, lm_weight=0.3)  # shaft liner
    E('pillar', id='p1', p=(0.0, 0.0, -8.9), size=(2.0, 2.0), heights=[0.0, 1.5], level=0, depth=3.0)
    E('zone', id='z_pillar', p=(0.0, 0.0, -6.0), r=3.0, card='pillar')
    E('zone', id='z_pier1', p=(0.0, 0.0, -6.5), size=(7.0, 7.0), h=3.0, grounded=True)

    # ---------------------------------------------------------------- the upper deck
    b.poly_prism([(-3.5, -10.0), (3.5, -10.0), (3.5, -20.0), (-3.5, -20.0)], -1.2, UP - 0.1, mat='wall', bevel=0.04)
    b.poly_prism([(-3.5, -10.0), (3.5, -10.0), (3.5, -20.0), (-3.5, -20.0)], UP - 0.1, UP, mat='paving', bevel=0.01)
    b.box((0.0, UP - 0.2, -9.93), (7.3, 0.3, 0.2), mat='marble', bevel=0.02, collide=False)  # cornice over pier one
    arch.viaduct_pier(b, 0.0, -15.0, -1.2, w=6.2, d=8.0)
    for side in (-1, 1):
        deck_rim(b, side * 3.6, -10.0, -20.0, UP)
        b.balustrade((side * 3.3, UP, -10.4), (side * 3.3, UP, -19.7), height=1.05, mat='marble')
    arch.lamp_post(b, -2.8, -12.2, UP, power=80.0)
    for x in (-2.55, 2.55):
        arch.bust(b, x, -18.7, UP, ry=math.pi / 2 if x < 0 else -math.pi / 2)
    arch.arch_ring(b, 0.0, -26.0, -20.0, UP - 7.6, 6.0, ring=1.0, start=0.0, end=0.32)
    E('span', id='s_b', p=(0.0, UP, -20.0), dir=(0.0, -1.0), width=2.4, lengths=[0.6, 6.0], level=0)
    E('zone', id='z_upper', p=(0.0, UP, -15.0), r=4.0, takeback=True)

    # ---------------------------------------------------------------- the middle pier (the crate)
    b.poly_prism([(-3.0, -26.0), (3.0, -26.0), (3.0, -31.0), (-3.0, -31.0)], UP - 1.2, UP - 0.1, mat='wall', bevel=0.04)
    b.poly_prism([(-3.0, -26.0), (3.0, -26.0), (3.0, -31.0), (-3.0, -31.0)], UP - 0.1, UP, mat='paving', bevel=0.01)
    arch.viaduct_pier(b, 0.0, -28.5, UP - 1.2, w=5.0, d=4.0)
    arch.arch_ring(b, 0.0, -26.0, -20.0, UP - 7.6, 6.0, ring=1.0, start=0.7, end=1.0)
    arch.arch_ring(b, 0.0, -37.0, -31.0, UP - 7.6, 6.0, ring=1.0, start=0.0, end=0.25)
    for side in (-1, 1):
        deck_rim(b, side * 3.1, -26.0, -31.0, UP)
        b.balustrade((side * 2.8, UP, -26.4), (side * 2.8, UP, -30.7), height=1.05, mat='marble')
    arch.rubble(b, -1.6, UP, -27.2, 0.8, 5, seed=43, mat='marble', max_size=0.4, collide=False)
    E('crate', id='c_m', p=(1.1, UP + 0.5, -28.6), level=1, ry=12)
    E('span', id='s_c', p=(0.0, UP, -31.0), dir=(0.0, -1.0), width=2.4, lengths=[0.6, 6.0], level=0)

    # ---------------------------------------------------------------- the shrine deck
    p2_hole = (-3.53, -51.93, -1.47, -49.87)
    inside = (-4.6, -52.0, 4.6, -44.4)
    arch.floor(b, -7.0, -57.0, 7.0, -37.0, UP - 0.1, thick=UP + 1.1, mat='wall', holes=[p2_hole], bevel=0.04)
    arch.floor(b, -7.0, -57.0, 7.0, -37.0, UP, thick=0.1, mat='paving', holes=[inside], bevel=0.01)
    arch.floor(b, -4.6, -52.0, 4.6, -44.4, UP, thick=0.1, mat='tiles', holes=[p2_hole], bevel=0.01)
    arch.viaduct_pier(b, 0.0, -47.0, -1.2, w=12.0, d=18.0)
    arch.arch_ring(b, 0.0, -37.0, -31.0, UP - 7.6, 6.0, ring=1.0, start=0.72, end=1.0)
    for side in (-1, 1):
        deck_rim(b, side * 7.1, -37.0, -57.0, UP)
        b.balustrade((side * 6.8, UP, -37.4), (side * 6.8, UP, -43.4), height=1.05, mat='marble')
    b.balustrade((-6.8, UP, -37.3), (-1.4, UP, -37.3), height=1.05, mat='marble')
    b.balustrade((6.8, UP, -37.3), (4.4, UP, -37.3), height=1.05, mat='marble')
    arch.planter(b, -4.8, -40.2, UP, r=1.2, h=0.5, tree='dead_quiver_trunk', tree_scale=1.5, tree_rot=2.2)
    arch.lamp_post(b, -1.9, -40.6, UP, power=90.0)
    arch.bust(b, -3.9, -42.9, UP, ry=0.3)
    arch.urn(b, 6.2, -41.8, UP, s=1.2)
    arch.urn(b, -6.2, -46.0, UP, s=1.2)

    # the ram's channel: a steel strip in the floor from the ram to the slot
    b.box((3.4, UP + 0.005, -40.8), (1.5, 0.01, 6.4), mat='steel', bevel=0.0, collide=False, lm_weight=0.3)
    b.box((3.4, UP + 0.55, -37.45), (1.8, 1.1, 0.4), mat='plates', bevel=0.03)  # the ram's housing
    E('piston', id='ram', p=(3.4, UP + 0.56, -39.2), size=(1.4, 0.88, 3.0), dir=(0.0, -1.0), travel=5.05, level=0, speed=2.2)

    # ---------------------------------------------------------------- the shrine
    H = 6.4
    # south wall: the gate (x -1.2..1.2) and the alcove front (x 2.2..4.6) are openings
    arch.wall(b, -5.0, SHRINE_S, 5.0, SHRINE_S, UP, UP + H, thick=0.8, mat='wall', style='classic',
              openings=[(3.8, 6.2, 0.0, 3.0), (7.2, 9.6, 0.0, 3.6)])
    arch.wall(b, -5.0, SHRINE_S - 0.36, -5.0, SHRINE_N + 0.36, UP, UP + H, thick=0.8, mat='wall', style='classic', pilaster_every=3.0)
    arch.wall(b, 5.0, SHRINE_S - 0.36, 5.0, SHRINE_N + 0.36, UP, UP + H, thick=0.8, mat='wall', style='classic', pilaster_every=3.0)
    # north wall: open above the mezzanine for the bloom's bridge
    arch.wall(b, -5.36, SHRINE_N, 5.36, SHRINE_N, UP, UP + H, thick=0.8, mat='wall', style='classic',
              openings=[(2.36, 8.36, 4.3, 6.4)])
    b.box((0.0, UP + H + 0.2, -48.0), (10.8, 0.4, 8.8), mat='concrete', bevel=0.04)  # roof over the south half
    # gate frame and the alcove front: a screen above the slot the ram pushes through
    b.box((-1.33, UP + 1.5, SHRINE_S), (0.3, 3.0, 1.0), mat='plates', bevel=0.03)
    b.box((1.33, UP + 1.5, SHRINE_S), (0.3, 3.0, 1.0), mat='plates', bevel=0.03)
    b.box((0.0, UP + 3.14, SHRINE_S), (3.0, 0.32, 1.0), mat='plates', bevel=0.03)
    b.box((3.4, UP + 1.2, SHRINE_S), (2.4, 0.14, 0.3), mat='steel', bevel=0.02, collide=False)  # slot lintel
    b.screen((3.4, UP + 2.43, SHRINE_S), (2.36, 2.32, 0.02))
    b.collider_box((3.4, UP + 1.2, SHRINE_S), (2.4, 0.14, 0.3), kind='screen')  # the lintel stops bodies, not the Graft
    b.box((3.4, UP + 3.64, SHRINE_S), (2.4, 0.1, 0.3), mat='steel', bevel=0.02)
    # the alcove: screens toward the shrine's inside, a heavy plate on its floor
    b.screen((2.2, UP + 1.8, -45.5), (0.02, 3.6, 3.0))
    b.box((2.2, UP + 3.64, -45.5), (0.3, 0.1, 3.0), mat='steel', bevel=0.02)
    b.box((2.2, UP + 1.85, -47.0), (0.3, 3.7, 0.3), mat='steel', bevel=0.02)
    b.screen((3.5, UP + 1.8, -47.0), (2.3, 3.6, 0.02))
    b.box((3.5, UP + 3.64, -47.0), (2.6, 0.1, 0.3), mat='steel', bevel=0.02)
    b.cyl((3.4, UP + 0.02, -46.0), 1.02, 0.06, mat='steel', segments=48, bevel=0.01, collide=False)  # plate base
    b.glow_strip((4.55, UP + 3.0, -45.5), (0.05, 0.05, 2.6), color='glow_cyan')
    E('plate', id='plate_h', p=(3.4, UP + 0.05, -46.0), r=0.95, threshold=16)
    E('door', id='gate', p=(0.0, UP, SHRINE_S), size=(2.4, 3.0, 0.3), openIf=['plate_h'], mode='up', travel=2.9, closeSpeed=2.4)
    E('zone', id='z_shrine', p=(0.0, UP, -40.5), r=4.5, takeback=True)

    # inside: the second cell on a pedestal, the pillar, the mezzanine with the bloom
    b.box((-1.2, UP + 0.5, -48.4), (0.8, 1.0, 0.8), mat='marble', bevel=0.04)
    b.box((-1.2, UP + 1.03, -48.4), (1.0, 0.06, 1.0), mat='steel', bevel=0.01)
    b.glow_strip((-1.2, UP + 0.2, -47.98), (0.5, 0.05, 0.04), color='glow_cyan')
    E('pickup', id='cell', kind='upgrade', p=(-1.2, UP + 1.35, -48.4), capacity=2, echo='c_upgrade')
    mezz = [(-4.6, -52.0), (4.6, -52.0), (4.6, SHRINE_N + 0.4), (-4.6, SHRINE_N + 0.4)]
    b.poly_prism(mezz, UP - 0.1, MEZZ - 0.1, mat='wall', bevel=0.04)
    b.poly_prism(mezz, MEZZ - 0.1, MEZZ, mat='paving', bevel=0.01)
    b.box((0.0, MEZZ - 0.2, -51.9), (9.2, 0.3, 0.2), mat='marble', bevel=0.02, collide=False)
    b.box((-2.5, UP - 0.62, -50.9), (2.3, 1.2, 2.3), mat='steel', bevel=0.02, collide=False, lm_weight=0.3)
    E('pillar', id='p2', p=(-2.5, UP, -50.9), size=(2.0, 2.0), heights=[0.0, 1.5, 3.0], level=0, depth=3.6)
    b.cyl((0.0, MEZZ + 0.15, -54.0), 2.0, 0.3, mat='marble', segments=48, bevel=0.03)
    E('bloom', id='bloom', p=(0.0, MEZZ + 0.3, -54.0))
    E('zone', id='z_bloom', p=(0.0, MEZZ + 0.3, -54.0), r=1.8, bloom=True)
    arch.lamp_post(b, 3.6, -53.6, MEZZ, power=70.0)
    b.point_light((0.0, UP + 5.0, -48.0), color=(1.0, 0.62, 0.35), power=90.0, radius=0.3)
    b.glow_strip((0.0, UP + H - 0.1, -44.5), (6.0, 0.05, 0.08), color='glow_warm')
