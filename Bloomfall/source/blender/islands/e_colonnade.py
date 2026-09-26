"""Island V: the Colonnade.

1. Downfall. A tall column stands at the edge of a chasm. Shrink the crate, set it against the
   column's base and grow it again: the column falls across the chasm. Walk over it.
   The south terrace breaks away behind you.
2. The fountain. A heavy plate waits in a pit under a grate. The only way in is the channel
   from the fountain, and only a small orb fits. Shrink the orb, roll it down, then give it
   space through the grate until it weighs 16. The orb's own cell is only half of that: the other
   is behind the gate, which is a screen. Take it through the screen (from the crate or the
   bollard beyond), and the gate opens.
3. The ramp. A column stands before a high plinth. Topple it against the plinth's edge and
   climb it to the bloom. Whichever of the crate and the bollard still holds its cell pushes it.

Local origin: arrival terrace, y = 0. The player walks toward -Z.
Reach rules (floating capsule): the player climbs 1.5 m above what they stand on.
"""
import math
import arch

TITLE = 'The Colonnade'

COL_H = 8.5
PLINTH = 4.3
FOUNT = 2.4
PIT = (4.5, -14.0)  # center of the pit
PIT_D = 2.4


def colonnade_row(b, x, zs, broken=(), y0=0.0):
    for z in zs:
        if z in broken:
            # a stump and its fallen drums
            b.box((x, y0 + 0.175, z), (1.1, 0.35, 1.1), mat='marble', bevel=0.03)
            b.cyl((x, y0 + 1.3, z), 0.45, 1.9, mat='marble', segments=24, bevel=0.02)
            arch.rubble(b, x - 0.6, y0, z + 0.4, 1.3, 5, seed=int(abs(z) * 7), mat='marble', max_size=0.6, collide=False)
            continue
        arch.fluted_column(b, x, z, y0, h=COL_H)


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -26
    b.meta['startCells'] = 0
    E = b.entity

    # ---------------------------------------------------------------- the south terrace (falls)
    with b.chunk('south'):
        arch.floor(b, -7.0, 2.0, 7.0, 18.5, 0.0, thick=1.2, mat='paving')
        b.underside([(-7.0, 2.0), (7.0, 2.0), (7.0, 15.0), (4.0, 18.5), (-4.0, 18.5), (-7.0, 15.0)], -1.2, 14, seed=61)
        for side in (-1, 1):
            b.balustrade((side * 6.7, 0.0, 14.8), (side * 6.7, 0.0, 2.4), height=1.05, mat='marble')
            b.balustrade((side * 6.6, 0.0, 15.3), (side * 4.2, 0.0, 18.2), height=1.05, mat='marble')
            arch.fluted_column(b, side * 5.4, 11.0, 0.0, h=COL_H)
            b.box((side * 5.4, COL_H + 0.4, 11.0), (1.3, 0.8, 1.3), mat='marble', bevel=0.03, collide=False)
        arch.lamp_post(b, -3.4, 15.4, 0.0, power=80.0)
        arch.urn(b, 5.6, 14.6, 0.0, s=1.2)
        arch.urn(b, -5.6, 5.0, 0.0, s=1.2)
        arch.planter(b, 4.3, 5.8, 0.0, r=1.3, h=0.55, tree='dead_quiver_trunk', tree_scale=1.7, tree_rot=1.9)
        arch.rubble(b, -4.4, 0.0, 6.0, 1.2, 6, seed=62, mat='marble', max_size=0.5, collide=False)
        E('toppler', id='t1', p=(0.0, 0.0, 4.0), height=COL_H, width=1.1, dir=(0.0, -1.0), endAngle=90)
        E('crate', id='c_1', p=(2.4, 0.5, 7.6), level=1, ry=16)
        E('pickup', id='seed', kind='seed', p=(0.0, COL_H + 0.4, 4.0))

    E('spawn', p=(0.0, 0.05, 14.5), yaw=0)
    E('arrive', p=(0.0, 0.0, 17.2))
    E('zone', id='z_arrive', p=(0.0, 0.0, 13.5), r=3.2, echo='e_arrive')
    E('zone', id='z_topple', p=(0.0, 0.0, 6.8), r=3.4, card='topple', takeback=True)

    # ---------------------------------------------------------------- the middle: the fountain
    pit_hole = (PIT[0] - 1.42, PIT[1] - 1.42, PIT[0] + 1.42, PIT[1] + 1.42)
    arch.floor(b, -8.0, -24.0, 8.0, -4.0, 0.0, thick=1.2, mat='paving', holes=[pit_hole])
    b.underside([(-8.0, -4.0), (8.0, -4.0), (8.0, -52.0), (-8.0, -52.0)], -1.2, 22, seed=63)
    for side in (-1, 1):
        colonnade_row(b, side * 6.8, (-6.0, -10.0, -14.0, -18.0, -22.0), broken=(-14.0,) if side > 0 else ())
        b.box((side * 6.8, COL_H + 0.4, -14.0), (1.3, 0.8, 17.3), mat='marble', bevel=0.04, collide=False)  # architrave
        b.balustrade((side * 7.7, 0.0, -4.4), (side * 7.7, 0.0, -23.5), height=1.0, mat='marble')
    # the pit: stone lined, a plate on its floor, sloped strips that roll an orb to the middle
    px, pz = PIT
    for dx, dz, w, d in ((-1.32, 0.0, 0.2, 2.84), (1.32, 0.0, 0.2, 2.84), (0.0, -1.32, 2.44, 0.2), (0.0, 1.32, 2.44, 0.2)):
        b.box((px + dx, -PIT_D / 2, pz + dz), (w, PIT_D, d), mat='wall', bevel=0.02)
    b.box((px, -PIT_D - 0.15, pz), (2.8, 0.3, 2.8), mat='wall', bevel=0.02)
    for ang, dx, dz in ((0.0, 1.0, 0.0), (math.pi, -1.0, 0.0), (math.pi / 2, 0.0, 1.0), (-math.pi / 2, 0.0, -1.0)):
        # a 0.4 m strip along each wall, tilted down toward the plate
        rx = -0.35 * dz
        rz = 0.35 * dx
        b.box((px + dx * 1.0, -PIT_D + 0.08, pz + dz * 1.0), (2.4 if dz else 0.4, 0.12, 0.4 if dz else 2.4), mat='wall', bevel=0.01,
              rot=(rx, 0.0, rz))
    b.cyl((px, -PIT_D + 0.003, pz), 1.02, 0.01, mat='steel', segments=48, bevel=0.003, collide=False)  # plate base, flat
    E('plate', id='plate_o', p=(px, -PIT_D + 0.008, pz), r=0.95, threshold=16)
    # the grate over the pit, with a slot on its west side where the channel comes in. A steel bar
    # stops a rolling orb over the slot; a stone hood keeps people out of it.
    b.screen((px + 0.4, -0.02, pz), (2.04, 0.04, 2.44))
    b.box((px - 0.57, 0.17, pz), (0.1, 0.34, 2.44), mat='steel', bevel=0.01)
    b.box((px - 1.0, 1.18, pz), (1.0, 0.56, 2.2), mat='marble', bevel=0.03)
    b.glow_strip((px + 1.23, -0.3, pz), (0.04, 0.05, 2.2), color='glow_cyan')
    # the fountain: a raised basin with stairs, and the channel down to the pit
    b.box((-4.0, FOUNT / 2, -14.0), (3.0, FOUNT, 3.0), mat='marble', bevel=0.04)
    b.box((-4.0, FOUNT + 0.02, -14.0), (2.6, 0.04, 2.6), mat='tiles', bevel=0.01, collide=False)
    # a low rim, open where the stairs arrive (south) and where the channel leaves (east)
    for x0, z0, x1, z1 in ((-5.46, -12.6, -4.9, -12.6), (-3.1, -12.6, -2.5, -12.6), (-5.46, -15.4, -2.5, -15.4),
                           (-5.4, -12.54, -5.4, -15.46), (-2.6, -12.7, -2.6, -13.62), (-2.6, -14.38, -2.6, -15.3)):
        b.box(((x0 + x1) / 2, FOUNT + 0.15, (z0 + z1) / 2), (max(abs(x1 - x0), 0.2), 0.3, max(abs(z1 - z0), 0.2)), mat='marble', bevel=0.02)
    for i in range(8):
        top = 0.3 * (i + 1)
        b.box((-4.0, top / 2, -9.95 - 0.32 * i), (1.8, top, 0.32), mat='marble', bevel=0.012)
    run = px - 1.22 - (-2.5)  # the channel ends on the pit's west wall; the slot is beyond it
    drop = FOUNT - 0.05
    ang = math.atan2(drop, run)
    L = math.hypot(run, drop)
    cx = (-2.5 + px - 1.22) / 2
    cy = (FOUNT + 0.05) / 2
    b.box((cx, cy - 0.12, pz), (L, 0.2, 0.62), mat='marble', bevel=0.02, rot=(0.0, 0.0, -ang))
    for s in (-1, 1):
        b.box((cx, cy + 0.14, pz + s * 0.36), (L, 0.36, 0.1), mat='marble', bevel=0.02, rot=(0.0, 0.0, -ang))
    for t in (0.3, 0.65):
        x = -2.5 + run * t
        h = FOUNT - drop * t - 0.25
        b.box((x, h / 2, pz), (0.3, h, 0.5), mat='marble', bevel=0.02, collide=False)
    E('orb', id='o_1', p=(-4.6, FOUNT + 0.5, -14.6), level=1)
    E('zone', id='z_mid', p=(0.0, 0.0, -8.0), size=(14.0, 6.0), h=3.0, grounded=True)
    E('zone', id='z_fountain', p=(0.0, 0.0, -14.0), r=5.0, takeback=True)
    arch.lamp_post(b, 2.0, -6.2, 0.0, power=80.0)
    arch.lamp_post(b, -2.2, -21.5, 0.0, power=80.0)

    # the gate wall
    arch.wall(b, -8.0, -24.0, 8.0, -24.0, 0.0, 5.6, thick=0.8, mat='wall', openings=[(6.5, 9.5, 0.0, 3.2)],
              style='classic', pilaster_every=3.0)
    arch.bust(b, 5.4, -19.9, 0.0, ry=-0.6)
    arch.bust(b, -5.6, -19.8, 0.0, ry=0.6)
    for x in (-5.8, 5.8):
        arch.bust(b, x, -45.6, 0.0, ry=math.pi / 2 if x < 0 else -math.pi / 2)
    # jambs reach 2 cm below the floor, so their feet never share a plane with the wall's
    b.box((-1.63, 1.59, -24.0), (0.3, 3.22, 1.0), mat='plates', bevel=0.03)
    b.box((1.63, 1.59, -24.0), (0.3, 3.22, 1.0), mat='plates', bevel=0.03)
    b.box((0.0, 3.35, -24.0), (3.6, 0.34, 1.0), mat='plates', bevel=0.03)
    # the gate is a screen: the Graft reaches the north side through it
    E('door', id='gate', p=(0.0, 0.0, -24.0), size=(3.0, 3.2, 0.2), openIf=['plate_o'], mode='up', travel=3.1, closeSpeed=2.4,
      screen=True)

    # ---------------------------------------------------------------- the north: the plinth
    arch.floor(b, -8.0, -52.0, 8.0, -24.0, 0.0, thick=1.2, mat='paving')
    for side in (-1, 1):
        colonnade_row(b, side * 6.8, (-28.0, -32.0, -36.0, -40.0), broken=(-32.0,) if side < 0 else ())
        b.box((side * 6.8, COL_H + 0.4, -34.0), (1.3, 0.8, 13.3), mat='marble', bevel=0.04, collide=False)
        b.balustrade((side * 7.7, 0.0, -24.6), (side * 7.7, 0.0, -51.6), height=1.0, mat='marble')
    b.poly_prism([(-4.5, -44.0), (4.5, -44.0), (4.5, -51.0), (-4.5, -51.0)], 0.0, PLINTH - 0.1, mat='wall', bevel=0.04)
    b.poly_prism([(-4.5, -44.0), (4.5, -44.0), (4.5, -51.0), (-4.5, -51.0)], PLINTH - 0.1, PLINTH, mat='paving', bevel=0.01)
    b.box((0.0, PLINTH - 0.25, -43.93), (9.2, 0.3, 0.2), mat='marble', bevel=0.02, collide=False)
    b.cyl((0.0, PLINTH + 0.15, -48.2), 1.9, 0.3, mat='marble', segments=48, bevel=0.03)
    E('bloom', id='bloom', p=(0.0, PLINTH + 0.3, -48.2))
    E('zone', id='z_bloom', p=(0.0, PLINTH + 0.3, -48.2), r=1.7, bloom=True)
    arch.lamp_post(b, 3.6, -45.0, PLINTH, power=70.0)
    # the leaning column: it rests on the plinth's front edge
    pivot_z = -37.9 - 0.55
    lean = math.degrees(math.atan2(pivot_z + 44.0, PLINTH))  # the column's front face meets the plinth's edge
    E('toppler', id='t2', p=(0.0, 0.0, -37.9), height=COL_H, width=1.1, dir=(0.0, -1.0), endAngle=round(lean, 2))
    E('crate', id='c_n', p=(2.9, 0.5, -30.8), level=1, ry=-12)
    # a bollard on the north side, in sight through the gate
    E('bulkhead', id='bol_n', p=(-3.2, 0.0, -28.4), size=(0.8, 1.0, 0.8), level=1)
    b.box((-3.2, 0.03, -28.4), (1.1, 0.06, 1.1), mat='steel', bevel=0.01, collide=False)
    E('zone', id='z_plinth', p=(0.0, 0.0, -35.0), r=5.0, takeback=True)
    arch.rubble(b, 4.6, 0.0, -27.2, 1.1, 6, seed=64, mat='marble', max_size=0.5, collide=False)
