"""Island IV: the Weighhouse.

1. The counterweight lift. The lift and a counterweight pan hang from one gantry: the heavier
   side sinks. Stand on the lift and make the counterweight heavier (it sits behind screens, on
   a perforated pan, so only the Graft reaches it). The lift carries you up to the entrance.
   The forecourt breaks away once you are inside.
2. The great scale. Pan A sits low under a heavy crate; pan B hangs high and empty. Only a crate
   can weigh pan B down, and the only crates are in the forecourt, which falls once you are inside:
   bring one up on the lift. Carry it out along the catwalk and drop it onto pan B. Then stand on
   pan A, take its crate's space and give it to your crate through B's perforated floor. Pan A
   rises to the exit gallery.
   The memory rides on pan B: the catwalk reaches it while the pan hangs high.

Local origin: forecourt floor, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Weighhouse'

WALL_T = 0.8
FACADE_Z = -7.0
NORTH_Z = -35.0
TOP = 13.0          # wall top
LANDING = 6.0       # entrance balcony, lift top and the south gallery
EXIT = 6.35         # west gallery: 1.3 m above pan A at the top of its travel
LIFT_TOP = (0.02, 6.02)
PAN_TOP = (0.05, 5.05)


def giant_weight(b, x, z, y, r=0.55, h=0.8):
    """A cast-iron counterweight on a marble plinth (decoration)."""
    b.box((x, y + 0.2, z), (r * 2 + 0.5, 0.4, r * 2 + 0.5), mat='marble', bevel=0.03)
    b.cyl((x, y + 0.4 + h / 2, z), r, h, mat='rust', segments=28, bevel=0.03, radius_top=r * 0.82)
    b.cyl((x, y + 0.4 + h + 0.09, z), r * 0.34, 0.18, mat='steel', segments=16, bevel=0.01, collide=False)


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -26
    b.meta['startCells'] = 0
    E = b.entity

    # ---------------------------------------------------------------- the forecourt (breaks away)
    with b.chunk('forecourt'):
        lift_hole = (-6.12, -6.22, -3.08, -3.18)
        shaft_hole = (-9.52, -6.47, -7.08, -4.03)
        arch.floor(b, -10.0, -6.6, 10.0, 18.5, 0.0, thick=1.2, mat='paving', holes=[lift_hole, shaft_hole])
        b.box((-4.6, -0.36, -4.7), (3.04, 0.08, 3.04), mat='steel', bevel=0.01, collide=True)  # lift pit floor
        b.box((-8.3, -0.36, -5.25), (2.44, 0.08, 2.44), mat='steel', bevel=0.01, collide=True)  # counterweight pit
        outline = [(-10.0, -6.6), (10.0, -6.6), (10.0, 14.0), (6.0, 18.5), (-6.0, 18.5), (-10.0, 14.0)]
        b.underside(outline, -1.2, 16, seed=51)
        for side in (-1, 1):
            b.balustrade((side * 9.7, 0.0, 13.6), (side * 9.7, 0.0, -2.8), height=1.05, mat='marble')
            b.balustrade((side * 9.6, 0.0, 14.2), (side * 6.2, 0.0, 18.2), height=1.05, mat='marble')
        # the counterweight shaft: screens on three sides, the facade behind
        for sx, sz, w, d in ((-6.9, -5.25, 0.02, 2.7), (-9.7, -5.25, 0.02, 2.7), (-8.3, -3.9, 2.8, 0.02)):
            b.screen((sx, 3.5, sz), (w, 7.0, d))
        for x, z in ((-6.9, -3.9), (-9.7, -3.9)):
            b.box((x, 3.55, z), (0.22, 7.1, 0.22), mat='steel', bevel=0.02)
        b.box((-8.3, 7.1, -3.9), (3.0, 0.16, 0.22), mat='steel', bevel=0.02)
        b.box((-6.9, 7.1, -5.25), (0.22, 0.16, 2.7), mat='steel', bevel=0.02)
        b.box((-9.7, 7.1, -5.25), (0.22, 0.16, 2.7), mat='steel', bevel=0.02)
        # the gantry: a beam with two pulleys over the lift and the counterweight
        b.box((-10.05, 4.75, -4.8), (0.36, 9.5, 0.36), mat='steel', bevel=0.03)
        b.box((-6.7, 4.75, -3.3), (0.3, 9.5, 0.3), mat='steel', bevel=0.03)
        b.box((-6.85, 9.62, -4.8), (7.0, 0.4, 0.42), mat='steel', bevel=0.03, collide=False)
        b.box((-6.7, 9.1, -4.05), (0.24, 0.24, 1.6), mat='steel', bevel=0.02, collide=False)
        for x, z in ((-4.6, -4.7), (-8.3, -4.9)):
            b.box((x, 9.25, -4.8), (0.16, 0.5, 0.5), mat='plates', bevel=0.02, collide=False)
            b.cyl((x, 9.05, -4.8), 0.34, 0.2, mat='rust', segments=20, bevel=0.02, collide=False)
        b.box((-3.3, 9.2, -5.7), (0.3, 0.3, 1.9), mat='steel', bevel=0.02, collide=False)  # strut to the facade
        # dressing: iron weights on plinths, a lamp, a planter, rubble
        giant_weight(b, 6.2, 9.0, 0.0)
        arch.bust(b, 7.2, -5.4, 0.0, ry=-0.5)
        arch.bust(b, 8.4, 12.4, 0.0, ry=-2.4)
        giant_weight(b, 7.4, 6.4, 0.0, r=0.42, h=0.6)
        giant_weight(b, -6.8, 10.6, 0.0, r=0.62, h=0.9)
        arch.planter(b, 5.6, -1.6, 0.0, r=1.4, h=0.55, tree='dead_quiver_trunk', tree_scale=1.8, tree_rot=0.9)
        arch.lamp_post(b, -3.2, 14.6, 0.0, power=80.0)
        arch.lamp_post(b, 3.4, 2.4, 0.0, power=80.0)
        arch.rubble(b, 1.8, 0.0, 11.5, 1.2, 7, seed=52, mat='marble', max_size=0.5, collide=False)
        for x in (-2.0, 2.0):
            b.box((x, 0.25, 7.6), (2.2, 0.5, 0.6), mat='marble', bevel=0.04)
        # the lift and its counterweight: pan A is the lift, pan B the counterweight
        lift_mid = (LIFT_TOP[0] + LIFT_TOP[1]) / 2 - 0.15
        rng = (LIFT_TOP[1] - LIFT_TOP[0]) / 2
        E('balance', id='lift', pans=[
            {'p': [-4.6, lift_mid, -4.7], 'size': [3.0, 3.0], 'screen': False, 'hook': [-4.6, 8.85, -4.8]},
            {'p': [-8.3, lift_mid, -5.25], 'size': [2.4, 2.4], 'screen': True, 'hook': [-8.3, 8.85, -4.8]},
        ], range=rng, start=-rng, speed=1.4)
        E('crate', id='c_lift', p=(-4.1, LIFT_TOP[0] + 0.5, -4.3), level=1, ry=8)
        E('crate', id='c_cw', p=(-8.3, LIFT_TOP[1] + 0.25, -5.25), level=0, ry=0)
        E('crate', id='c_f', p=(3.0, 0.5, 4.2), level=1, ry=-14)

    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.5), r=3.2, echo='d_arrive')
    E('zone', id='z_lift', p=(-3.4, 0.0, -1.4), r=3.6, card='heavier', takeback=True)
    E('zone', id='z_door', p=(0.0, LANDING, -5.2), r=2.4, echo='d_door')

    # ---------------------------------------------------------------- the Weighhouse
    b.underside([(-12.1, -6.5), (12.1, -6.5), (12.1, -35.5), (-12.1, -35.5)], -1.2, 20, seed=53)
    pit_a = (-6.86, -25.86, -3.14, -22.14)
    pit_b = (3.14, -25.86, 6.86, -22.14)
    arch.floor(b, -12.0, -35.4, 12.0, -6.6, 0.0, thick=1.2, mat='tiles', holes=[pit_a, pit_b])
    for x in (-5.0, 5.0):
        b.box((x, -0.36, -24.0), (3.72, 0.08, 3.72), mat='steel', bevel=0.01)
    # walls: south and north run full width and stand 4 cm proud of the east and west walls.
    # Classic dress: plinth course, cornice, pilasters and stone surrounds, inside and out.
    dress = dict(style='classic', trim='marble', pilaster_every=4.0, frames=True)
    arch.wall(b, -12.04, FACADE_Z, 12.04, FACADE_Z, 0.0, TOP, thick=WALL_T, mat='wall',
              openings=[(10.44, 13.64, LANDING, LANDING + 4.0, 'door'), (3.54, 6.54, 7.2, 11.4), (17.54, 20.54, 7.2, 11.4)], **dress)
    arch.wall(b, -12.04, NORTH_Z, 12.04, NORTH_Z, 0.0, TOP, thick=WALL_T, mat='wall',
              openings=[(1.04, 4.04, EXIT, EXIT + 3.5, 'door'), (17.84, 20.24, 7.2, 11.4)], **dress)
    # west wall: tall windows over the gallery let the low sun in
    arch.wall(b, -11.6, -6.64, -11.6, -35.36, 0.0, TOP, thick=WALL_T, mat='wall',
              openings=[(4.2, 6.6, 7.6, 11.8), (11.2, 13.6, 7.6, 11.8), (18.2, 20.6, 7.6, 11.8)], **dress)
    arch.wall(b, 11.6, -6.64, 11.6, -35.36, 0.0, TOP, thick=WALL_T, mat='wall',
              openings=[(8.2, 10.6, 7.6, 11.8), (15.2, 17.6, 7.6, 11.8)], **dress)
    # the Weighhouse's emblem over the entrance: a balance in a stone roundel
    b.cyl((0.0, 11.35, -6.5), 1.15, 0.24, mat='marble', segments=48, bevel=0.03, collide=False).rotation_euler = (math.radians(90), 0, 0)
    b.box((0.0, 11.75, -6.33), (1.5, 0.09, 0.06), mat='steel', bevel=0.01, collide=False)
    b.box((0.0, 11.35, -6.35), (0.09, 0.9, 0.05), mat='steel', bevel=0.01, collide=False)
    for sx in (-0.62, 0.62):
        b.box((sx, 11.45, -6.34), (0.03, 0.55, 0.05), mat='steel', bevel=0.0, collide=False)
        b.box((sx, 11.15, -6.33), (0.42, 0.06, 0.06), mat='steel', bevel=0.01, collide=False)
    b.box((0.0, TOP + 0.3, -21.0), (24.3, 0.6, 29.0), mat='concrete', bevel=0.05)
    # the lantern: a stone drum with tall slits, a cornice and a stepped cap
    lt = TOP + 0.6
    b.box((0.0, lt + 1.6, -21.0), (6.0, 3.2, 6.0), mat='wall', bevel=0.04, collide=False)
    for sx, sz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for k in (-1, 0, 1):
            x = sx * 3.02 + (sz * k * 1.6 if sz else 0)
            z = -21.0 + sz * 3.02 + (sx * k * 1.6 if sx else 0)
            b.glow_strip((x, lt + 1.7, z), (0.04 if sx else 0.34, 1.9, 0.34 if sx else 0.04), color='glow_warm')
    b.box((0.0, lt + 3.35, -21.0), (6.6, 0.3, 6.6), mat='marble', bevel=0.03, collide=False)
    for i, w in enumerate((5.4, 4.2, 3.0, 1.6)):
        b.box((0.0, lt + 3.7 + i * 0.36, -21.0), (w, 0.36, w), mat='marble', bevel=0.03, collide=False)
    b.cyl((0.0, lt + 5.4, -21.0), 0.1, 1.4, mat='steel', segments=8, bevel=0.0, collide=False)
    # the entrance balcony outside, on two columns
    b.box((0.0, LANDING - 0.25, -5.2), (6.0, 0.5, 2.8), mat='marble', bevel=0.04)
    for x in (-2.6, 2.6):
        arch.column(b, x, -4.3, 0.0, LANDING - 0.5, r=0.26, mat='marble')
    b.balustrade((2.85, LANDING, -3.95), (2.85, LANDING, -6.4), height=1.05, mat='marble')
    b.balustrade((2.7, LANDING, -3.95), (-1.3, LANDING, -3.95), height=1.05, mat='marble')

    # the south gallery inside: from the entrance east to the top of the stairs
    b.box((4.1, LANDING - 0.25, -8.7), (14.2, 0.5, 2.6), mat='marble', bevel=0.04)
    b.balustrade((-2.9, LANDING, -7.6), (-2.9, LANDING, -9.8), height=1.05, mat='marble')
    b.balustrade((-2.8, LANDING, -9.85), (3.95, LANDING, -9.85), height=1.05, mat='marble')
    b.balustrade((6.05, LANDING, -9.85), (8.4, LANDING, -9.85), height=1.05, mat='marble')
    # the catwalk: from the south gallery out over pan B, open at its end. It is how weight gets
    # onto pan B while the pan hangs high.
    b.box((5.0, LANDING - 0.15, -15.925), (1.8, 0.3, 11.85), mat='marble', bevel=0.03)
    for x in (4.18, 5.82):
        b.railing((x, LANDING, -10.1), (x, LANDING, -21.7), height=1.05, post_every=1.9, mat='steel')
    for z in (-14.0, -19.4):
        arch.column(b, 5.0, z, 0.0, LANDING - 0.3, r=0.2, mat='marble')
    b.glow_strip((5.0, LANDING - 0.32, -15.9), (0.06, 0.04, 11.4), color='glow_warm')
    for x in (-1.5, 3.0, 7.5):
        b.box((x, LANDING - 0.85, -8.0), (0.5, 0.7, 1.4), mat='marble', bevel=0.03, collide=False)  # corbels
    # the stairs down the east wall: 30 steps of 0.2 m
    n = 30
    for i in range(n):
        top = LANDING - 0.2 * (i + 1)
        z = -10.0 - 0.6 * i - 0.3
        if top > 0.001:
            b.box((9.9, top / 2, z), (2.6, top, 0.6), mat='marble', bevel=0.012)
    rail_len = math.hypot(18.0, 6.0)
    b.box((8.65, LANDING / 2 + 1.0, -19.0), (0.16, 0.12, rail_len), mat='steel', bevel=0.02, rot=(-math.atan2(6.0, 18.0), 0.0, 0.0))
    for i in range(0, 30, 5):
        top = LANDING - 0.2 * (i + 1)
        b.box((8.65, top + 0.5, -10.3 - 0.6 * i), (0.1, 1.0, 0.1), mat='steel', bevel=0.01, collide=False)

    # the great scale: a marble column, the beam is the game's
    b.box((0.0, 0.3, -24.0), (1.8, 0.6, 1.8), mat='marble', bevel=0.04)
    b.cyl((0.0, 3.2, -24.0), 0.42, 5.2, mat='marble', segments=24, bevel=0.0)
    b.box((0.0, 5.95, -24.0), (1.1, 0.5, 1.1), mat='marble', bevel=0.04)
    pan_mid = (PAN_TOP[0] + PAN_TOP[1]) / 2 - 0.15
    prng = (PAN_TOP[1] - PAN_TOP[0]) / 2
    E('balance', id='scale', pans=[
        {'p': [-5.0, pan_mid, -24.0], 'size': [3.6, 3.6], 'screen': True},
        {'p': [5.0, pan_mid, -24.0], 'size': [3.6, 3.6], 'screen': True},
    ], range=prng, start=-prng, speed=1.2, beam={'p': [0.0, pan_mid + 4.4, -24.0]})
    E('crate', id='c_a', p=(-5.3, PAN_TOP[0] + 1.0, -23.7), level=2, ry=4)
    E('pickup', id='seed', kind='seed', p=(5.9, PAN_TOP[1] + 0.6, -24.9))
    E('zone', id='z_inside', p=(3.0, LANDING, -8.7), size=(12.0, 2.4), h=3.0, grounded=True)
    E('zone', id='z_hall', p=(0.0, 0.0, -20.0), r=6.0, card='weigh', takeback=True)

    # the west gallery and the way out
    b.box((-9.3, EXIT - 0.25, -25.3), (3.8, 0.5, 18.6), mat='marble', bevel=0.04)
    b.balustrade((-7.55, EXIT, -16.3), (-7.55, EXIT, -21.4), height=1.05, mat='marble')
    b.balustrade((-7.55, EXIT, -26.6), (-7.55, EXIT, -34.4), height=1.05, mat='marble')
    b.balustrade((-7.5, EXIT, -16.1), (-11.1, EXIT, -16.1), height=1.05, mat='marble')
    for z in (-18.0, -24.0, -30.0):
        b.box((-10.6, EXIT - 0.85, z), (1.0, 0.7, 0.5), mat='marble', bevel=0.03, collide=False)
    # the ledger wall: cabinets along the north wall, a great dial above
    for x in (-3.5, 0.0, 3.5, 7.0):
        b.box((x, 1.6, -34.2), (3.0, 3.2, 0.8), mat='rust', bevel=0.04)
        b.box((x, 3.26, -34.1), (3.2, 0.12, 1.0), mat='marble', bevel=0.02)
    b.cyl((2.0, 9.0, -34.52), 2.6, 0.16, mat='marble', segments=64, bevel=0.03, collide=False)
    b.cyl((2.0, 9.0, -34.42), 2.2, 0.06, mat='plates', segments=64, bevel=0.01, collide=False)
    b.box((2.0, 9.75, -34.34), (0.12, 1.6, 0.04), mat='steel', bevel=0.0, collide=False)
    b.box((2.5, 8.85, -34.33), (1.1, 0.1, 0.04), mat='steel', bevel=0.0, collide=False)
    arch.bust(b, 9.6, -31.2, 0.0, ry=-math.pi / 2)
    arch.bust(b, -9.6, -31.2, 0.0, ry=math.pi / 2)
    # lamps hanging in the hall and along the galleries
    for x, z in ((-5.0, -15.0), (1.6, -15.0), (0.0, -30.0)):
        b.cyl((x, TOP - 2.6, z), 0.03, 5.2, mat='steel', segments=8, bevel=0.0, collide=False)
        b.cyl((x, TOP - 5.25, z), 0.55, 0.12, mat='plates', segments=24, bevel=0.01, collide=False)
        b.glow_strip((x, TOP - 5.34, z), (0.7, 0.04, 0.7), color='glow_warm')
        b.point_light((x, TOP - 5.6, z), color=(1.0, 0.6, 0.32), power=160.0, radius=0.3)
    b.glow_strip((4.1, LANDING - 0.52, -9.95), (13.8, 0.04, 0.06), color='glow_warm')
    b.glow_strip((-7.45, EXIT - 0.52, -25.3), (0.06, 0.04, 18.2), color='glow_warm')

    # ---------------------------------------------------------------- the bloom terrace (north)
    terrace = [(-12.0, -35.4), (-4.0, -35.4), (-4.0, -41.0), (-6.0, -45.0), (-10.0, -45.0), (-12.0, -41.0)]
    b.poly_prism(terrace, EXIT - 1.2, EXIT - 0.1, mat='wall', bevel=0.04)
    b.poly_prism(terrace, EXIT - 0.1, EXIT, mat='paving', bevel=0.01)
    b.underside(terrace, EXIT - 1.2, 10, seed=54)
    b.balustrade((-4.3, EXIT, -35.8), (-4.3, EXIT, -40.8), height=1.05, mat='marble')
    b.balustrade((-11.7, EXIT, -35.8), (-11.7, EXIT, -40.8), height=1.05, mat='marble')
    b.cyl((-8.0, EXIT + 0.15, -40.6), 1.9, 0.3, mat='marble', segments=48, bevel=0.03)
    E('bloom', id='bloom', p=(-8.0, EXIT + 0.3, -40.6))
    E('zone', id='z_bloom', p=(-8.0, EXIT + 0.3, -40.6), r=1.7, bloom=True)
    arch.lamp_post(b, -4.9, -36.4, EXIT, power=70.0)
