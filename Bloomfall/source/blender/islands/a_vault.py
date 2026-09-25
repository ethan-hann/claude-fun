"""Island I: the Seed Vault and the Cloister (tutorial).

The Tender wakes in a sealed bunker at the south end, walks north through four rooms (look and
move, jump, carry and plate, crate as a step), comes out onto a landing above the cloister, takes
the Graft, and learns Take, Give and weight on the way to the bloom at the north tip.

Local origin: courtyard floor level, y = 0. The player walks toward -Z.
"""
import math
import arch

TITLE = 'The Seed Vault'

OUTLINE = [(-5.9, 29.5), (5.9, 29.5), (6.4, 2.0), (12.4, -7.0), (12.8, -24.5), (9.6, -30.5), (9.6, -43.0),
           (5.0, -51.5), (-5.0, -51.5), (-9.6, -43.0), (-9.6, -30.5), (-12.8, -24.5), (-12.4, -7.0), (-6.4, 2.0)]

WALL_H = 3.6  # bunker room height
ROOF = 4.6


def build(b):
    b.lm_size = 2048
    b.meta['killY'] = -26
    b.meta['startCells'] = 0

    # ---------------------------------------------------------------- island body
    # Floor slab of the whole island (holes: trench, bulkhead slot)
    trench = (-1.25, 13.0, 1.25, 15.0)
    bulk_slot = (-1.6, -24.25, 1.6, -23.75)
    arch.floor(b, -6.4, -8.0, 6.4, 29.5, 0.0, thick=1.0, mat='concrete', holes=[trench])
    # courtyard tiles
    arch.floor(b, -12.4, -24.0, 12.4, -8.0, 0.0, thick=1.0, mat='paving')
    arch.floor(b, -9.6, -30.0, 9.6, -24.0, 0.0, thick=1.0, mat='paving', holes=[bulk_slot])
    b.underside(OUTLINE, -1.0, 22, seed=11)
    # fill the corners of the outline the rectangular floors do not reach
    for sx in (-1, 1):
        b.poly_prism([(sx * 6.4, 2.0), (sx * 12.4, -7.0), (sx * 12.4, -8.0), (sx * 6.4, -8.0)], -1.0, 0.0, mat='paving', bevel=0.02)
        b.poly_prism([(sx * 9.6, -24.0), (sx * 12.8, -24.0), (sx * 12.8, -24.5), (sx * 9.6, -30.5)], -1.0, 0.0, mat='paving', bevel=0.02)
    # island rim: a low broken parapet along the long sides of the bunker tail
    for side in (-1, 1):
        b.box((side * 6.15, 0.25, 15.5), (0.5, 0.5, 27.5), mat='concrete', bevel=0.04)

    # ---------------------------------------------------------------- the bunker (seed vault)
    # outer shell: walls 0.8 thick, rooms inside. Rooms (x range, z range):
    #   pod bay   x -4.5..4.5  z 18..27
    #   corridor  x -1.25..1.25 z 10..18
    #   plate rm  x -4.5..4.5  z 1..10
    #   exit rm   x -3.5..3.5  z -8..1   (ledge y=2 for z -8..-4, ceiling 5.2)
    T = 0.8
    # pod bay
    arch.wall(b, -5.26, 27.0, 5.26, 27.0, 0, ROOF - 0.04, thick=T, mat='wall')  # south wall (z=27)
    # west wall of the pod bay has a broken window looking at the sunset: sill 1.45 m
    arch.wall(b, -4.9, 27.36, -4.9, 17.64, 0, WALL_H, thick=T, mat='wall', openings=[(2.16, 7.36, 1.45, 3.3)])
    arch.wall(b, 4.9, 27.36, 4.9, 17.64, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, -5.26, 18.0, -1.25, 18.0, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, 1.25, 18.0, 5.26, 18.0, 0, WALL_H, thick=T, mat='wall')
    b.box((0, WALL_H + 0.5, 22.5), (10.6, 1.0, 10.2), mat='concrete', bevel=0.05)  # roof slab
    # broken window: jagged edges and rubble outside and inside
    arch.rubble(b, -4.2, 0.0, 22.5, 1.4, 9, seed=3, mat='concrete', max_size=0.55, collide=False)
    arch.rubble(b, -5.6, 0.0, 22.0, 1.0, 6, seed=4, mat='concrete', max_size=0.5, collide=False)
    b.box((-4.9, 3.25, 19.9), (0.8, 0.5, 0.8), mat='wall', bevel=0.06, rot=(0.0, 0.0, 0.35), collide=False)
    b.box((-4.95, 3.1, 25.0), (0.85, 0.6, 0.9), mat='wall', bevel=0.06, rot=(0.25, 0.0, -0.3), collide=False)
    # pods: the Tender's (open, facing north) and a row of dead ones along the walls
    arch.seed_pod(b, 0.0, 25.8, 0.0, ry=math.pi, open_=True, lit=True)
    for i, z in enumerate((19.8, 22.2, 24.6)):
        arch.seed_pod(b, 3.8, z, 0.0, ry=-math.pi / 2, open_=(i != 1), lit=(i == 0))
    for z in (19.5,):
        arch.seed_pod(b, -3.8, z, 0.0, ry=math.pi / 2, open_=False, lit=False)
    # conduit along the east wall
    arch.pipe_run(b, (4.25, 3.1, 18.4), (4.25, 3.1, 26.6), r=0.1)
    arch.pipe_run(b, (4.25, 2.8, 18.4), (4.25, 2.8, 26.6), r=0.06)
    b.glow_strip((0, 0.08, 21.0), (1.8, 0.03, 0.08), color='glow_warm')
    b.point_light((0.0, 3.2, 21.5), color=(1.0, 0.55, 0.25), power=60.0, radius=0.3)

    # corridor with the collapsed trench (jump)
    arch.wall(b, -1.65, 18.0, -1.65, 10.0, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, 1.65, 18.0, 1.65, 10.0, 0, WALL_H, thick=T, mat='wall')
    b.box((0, WALL_H + 0.5, 14.0), (4.1, 1.0, 8.0), mat='concrete', bevel=0.05)
    # trench: floor gone, 1 m deep, rough edges
    b.box((0, -1.1, 14.0), (2.5, 0.2, 2.0), mat='rock', bevel=0.05)
    arch.rubble(b, 0.0, -1.0, 14.0, 0.9, 7, seed=8, mat='concrete', max_size=0.45, collide=False)
    b.box((0, -0.35, 12.95), (2.5, 0.7, 0.3), mat='concrete', bevel=0.08, rot=(0.12, 0.0, 0.0))
    arch.pipe_run(b, (0.0, 3.35, 17.8), (0.0, 3.35, 10.2), r=0.12)
    for z in (11.0, 16.8):
        b.glow_strip((-1.24, 0.3, z), (0.04, 0.05, 1.2), color='glow_warm')
        b.glow_strip((1.24, 0.3, z), (0.04, 0.05, 1.2), color='glow_warm')
    b.point_light((0.0, 3.0, 11.2), color=(1.0, 0.5, 0.22), power=45.0, radius=0.2)

    # plate room
    arch.wall(b, -5.26, 10.0, -1.25, 10.0, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, 1.25, 10.0, 5.26, 10.0, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, -4.9, 10.36, -4.9, 0.64, 0, WALL_H, thick=T, mat='wall')
    arch.wall(b, 4.9, 10.36, 4.9, 0.64, 0, WALL_H, thick=T, mat='wall')
    # north wall with the door opening (door 2.4 wide x 3 tall)
    arch.wall(b, -5.26, 1.0, 5.26, 1.0, 0, WALL_H, thick=T, mat='wall', openings=[(4.06, 6.46, 0.0, 3.0)])
    b.box((0, WALL_H + 0.5, 5.5), (10.6, 1.0, 9.8), mat='concrete', bevel=0.05)
    # door frame
    b.box((-1.33, 1.5, 1.0), (0.3, 3.0, 1.0), mat='plates', bevel=0.03)
    b.box((1.33, 1.5, 1.0), (0.3, 3.0, 1.0), mat='plates', bevel=0.03)
    b.box((0, 3.14, 1.0), (3.0, 0.32, 1.0), mat='plates', bevel=0.03)
    # plate base ring (the moving top is the game's)
    b.cyl((-3.0, 0.02, 7.8), 1.02, 0.06, mat='steel', segments=48, bevel=0.01, collide=False)
    b.glow_strip((0, 3.3, 5.5), (0.1, 0.04, 6.0), color='glow_warm')
    b.point_light((0.0, 3.1, 5.5), color=(1.0, 0.6, 0.3), power=70.0, radius=0.3)
    # stacked supply crates (static) for scale
    b.box((3.6, 0.45, 9.1), (1.2, 0.9, 1.2), mat='rust', bevel=0.04)
    b.box((3.7, 1.25, 9.2), (0.9, 0.7, 0.9), mat='rust', bevel=0.04, rot_y=0.3)

    # exit room: ledge 2 m high along its north side, taller ceiling
    arch.wall(b, -4.3, 1.0, -4.3, -8.76, 0, 5.2, thick=T, mat='wall')
    arch.wall(b, 4.3, 1.0, 4.3, -8.76, 0, 5.2, thick=T, mat='wall')
    b.box((0, 1.1, -6.0), (7.0, 2.2, 4.0), mat='concrete', bevel=0.04)  # ledge block (top y=2.2)
    b.box((0, 2.22, -4.1), (7.0, 0.04, 0.12), mat='steel', bevel=0.0, collide=False)
    # north wall: exit opening on the ledge level
    arch.wall(b, -4.66, -8.4, 4.66, -8.4, 0, 5.2, thick=T, mat='wall', openings=[(3.36, 5.96, 2.16, 4.8)])
    b.box((0, 5.7, -3.7), (9.4, 1.0, 9.8), mat='concrete', bevel=0.05)
    b.glow_strip((-3.45, 2.3, -6.0), (0.04, 0.05, 3.6), color='glow_cyan')
    b.glow_strip((3.45, 2.3, -6.0), (0.04, 0.05, 3.6), color='glow_cyan')
    b.point_light((0.0, 4.4, -2.0), color=(0.55, 0.8, 1.0), power=55.0, radius=0.3)

    # ribbed concrete facade on the bunker's north face, with the exit opening
    arch.wall(b, -4.9, -8.95, 4.9, -8.95, 0, 6.2, thick=0.3, mat='ribbed', openings=[(3.6, 6.2, 2.16, 4.8)])

    # ---------------------------------------------------------------- landing and stairs
    b.box((0, 1.1, -9.8), (5.2, 2.2, 3.6), mat='marble', bevel=0.04)  # landing top y=2.2
    b.balustrade((-2.6, 2.2, -8.6), (-2.6, 2.2, -11.6), height=1.0, mat='marble')
    b.balustrade((2.6, 2.2, -8.6), (2.6, 2.2, -11.6), height=1.0, mat='marble')
    for i in range(11):
        h = 2.2 - 0.2 * (i + 1)
        z = -11.6 - 0.32 * i - 0.16
        if h > 0.001:
            b.box((0, h / 2, z), (4.2, h, 0.32), mat='marble', bevel=0.012)

    # ---------------------------------------------------------------- cloister courtyard
    # arcades east and west: columns carrying a roof beam; some fallen
    for side in (-1, 1):
        x = side * 9.6
        b.box((side * 12.1, 2.2, -16.0), (0.6, 4.4, 16.6), mat='wall', bevel=0.04)  # outer wall
        for i, z in enumerate((-9.5, -13.2, -16.9, -20.6)):
            if side == 1 and i == 2:
                # fallen column lying across the arcade floor
                b.cyl((x + 0.6, 0.38, z - 0.2), 0.34, 3.2, mat='marble', segments=20, bevel=0.0, collide=True)
                continue
            arch.column(b, x, z, 0.0, 4.2, r=0.33, mat='marble')
        b.box((x, 4.4, -15.2), (0.9, 0.5, 12.6), mat='marble', bevel=0.04)  # architrave
        b.box((side * 10.85, 4.75, -15.2), (3.1, 0.3, 12.6), mat='concrete', bevel=0.04)  # arcade roof
    # the fallen column's missing roof piece (a hole in the east roof) is suggested by rubble
    arch.rubble(b, 10.5, 0.0, -17.2, 1.3, 7, seed=21, mat='marble', max_size=0.5, collide=False)
    # north wall with the arch (bulkhead gate)
    arch.wall(b, -12.36, -24.0, 12.36, -24.0, 0, 4.4, thick=0.8, mat='wall', openings=[(10.76, 13.96, 0.0, 3.3)],
              style='classic', pilaster_every=3.0)
    for x in (-3.6, 3.6):
        arch.bust(b, x, -22.8, 0.0, ry=math.pi if x > 0 else 0.0)
    b.box((-1.75, 1.75, -24.0), (0.4, 3.5, 1.0), mat='marble', bevel=0.03)
    b.box((1.75, 1.75, -24.0), (0.4, 3.5, 1.0), mat='marble', bevel=0.03)
    b.box((0, 3.55, -24.0), (3.9, 0.4, 1.0), mat='marble', bevel=0.03)
    # dead tree planter and the Graft pedestal
    arch.planter(b, 0.0, -17.5, 0.0, r=2.2, h=0.55, tree='dead_quiver_trunk', tree_scale=2.4, tree_rot=0.6)
    b.box((4.2, 0.5, -15.6), (0.9, 1.0, 0.9), mat='marble', bevel=0.04)
    b.box((4.2, 1.03, -15.6), (1.1, 0.06, 1.1), mat='steel', bevel=0.01)
    b.glow_strip((4.2, 0.2, -15.13), (0.6, 0.05, 0.04), color='glow_cyan')
    # benches
    for side in (-1, 1):
        b.box((side * 5.8, 0.25, -19.5), (0.6, 0.5, 2.4), mat='marble', bevel=0.04)
    # the bunker's north facade frames the courtyard's south side
    b.box((-5.1, 2.3, -8.6), (0.8, 4.6, 0.8), mat='wall', bevel=0.04)
    b.box((5.1, 2.3, -8.6), (0.8, 4.6, 0.8), mat='wall', bevel=0.04)
    for side in (-1, 1):
        b.box((side * 9.08, 2.2, -8.3), (6.56, 4.4, 0.6), mat='wall', bevel=0.04)

    # ---------------------------------------------------------------- garden walk and terrace
    for side in (-1, 1):
        arch.wall(b, side * 9.2, -24.4, side * 9.2, -30.0, 0, 2.6, thick=0.8, mat='wall', style='classic', pilaster_every=2.6)
    # terrace block: top y = 2, from z -30 to the north tip
    terrace = [(-9.6, -30.0), (9.6, -30.0), (9.6, -43.0), (5.0, -51.5), (-5.0, -51.5), (-9.6, -43.0)]
    b.poly_prism(terrace, 0.0, 2.2, mat='wall', bevel=0.04)
    b.poly_prism(terrace, 2.2, 2.3, mat='paving', bevel=0.01)
    b.box((0, 2.33, -30.15), (18.8, 0.08, 0.3), mat='marble', bevel=0.02, collide=False)
    # heavy plate base
    b.cyl((-3.2, 2.32, -35.2), 1.22, 0.06, mat='steel', segments=48, bevel=0.01, collide=False)
    # gate wall across the terrace at z = -40 with a 3 m opening
    arch.wall(b, -9.6, -40.0, 9.6, -40.0, 2.3, 6.5, thick=0.8, mat='wall', openings=[(7.95, 11.25, 0.0, 3.8)],
              style='classic', pilaster_every=3.0)
    for x in (-3.4, 3.4):
        arch.bust(b, x, -38.8, 2.3, ry=0.4 if x > 0 else -0.4)
    for x in (-8.4, 8.4):
        arch.urn(b, x, -31.1, 2.3, s=1.1)
        arch.urn(b, x * 1.3, -9.4, 0.0, s=1.2)
    b.box((-1.85, 4.2, -40.0), (0.5, 3.8, 1.1), mat='plates', bevel=0.03)
    b.box((1.85, 4.2, -40.0), (0.5, 3.8, 1.1), mat='plates', bevel=0.03)
    # terrace balustrades
    b.balustrade((-9.3, 2.3, -30.4), (-9.3, 2.3, -39.6), mat='marble')
    b.balustrade((9.3, 2.3, -30.4), (9.3, 2.3, -39.6), mat='marble')
    # the bloom platform at the tip: a round dais with the bridge mount
    b.cyl((0, 2.45, -46.5), 2.4, 0.3, mat='marble', segments=48, bevel=0.03)
    for side in (-1, 1):
        b.balustrade((side * 9.3, 2.3, -40.4), (side * 5.0, 2.3, -51.2), mat='marble')
    # a letter left on a plinth at the terrace's west edge, looking out over the gap
    b.box((-6.9, 2.65, -43.8), (0.6, 0.7, 0.6), mat='marble', bevel=0.03)
    lamp = arch.lamp_post
    lamp(b, -7.5, -34.0, 2.3)
    lamp(b, 7.5, -45.0, 2.3)
    lamp(b, -7.0, -12.0, 0.0, power=90.0)

    # ---------------------------------------------------------------- entities
    E = b.entity
    E('spawn', p=(0.0, 0.36, 25.75), yaw=0)
    E('zone', id='z_wake', p=(0.0, 0.0, 24.0), r=3.0, card='look', echo='wake')
    E('zone', id='z_move', p=(0.0, 0.0, 21.0), r=3.5, card='move')
    E('zone', id='z_jump', p=(0.0, 0.0, 16.6), r=1.8, card='jump')
    E('zone', id='z_carry', p=(0.0, 0.0, 8.0), r=4.0, card='carry')
    E('zone', id='z_step', p=(0.0, 0.0, -1.5), r=3.2, card='step')
    E('zone', id='z_landing', p=(0.0, 2.2, -10.0), r=2.5, echo='landing')
    E('zone', id='z_graft', p=(4.2, 0.0, -15.6), r=3.2, card='graft')
    E('zone', id='z_take', p=(0.0, 0.0, -21.8), r=2.6, card='take')
    E('zone', id='z_give', p=(0.0, 0.0, -27.2), r=3.0, card='give')
    E('zone', id='z_weight', p=(0.0, 2.3, -34.0), r=4.5, card='weight')
    E('zone', id='z_bloom', p=(0.0, 2.6, -46.5), r=2.0, bloom=True)

    E('crate', id='c_plate', p=(2.9, 0.5, 6.9), level=1, ry=12)
    E('plate', id='plate1', p=(-3.0, 0.05, 7.8), r=0.95, threshold=4)
    E('door', id='door1', p=(0.0, 0.0, 1.0), size=(2.4, 3.0, 0.36), openIf=['plate1'], mode='up', travel=2.95, closeSpeed=3.4)
    E('crate', id='c_step', p=(-2.0, 0.5, -1.2), level=1, ry=-8)

    E('pickup', id='graft', kind='graft', p=(4.2, 1.1, -15.6))
    E('pickup', id='seed', kind='seed', p=(-6.9, 3.4, -43.8))
    E('bulkhead', id='bulk1', p=(0.0, 0.0, -24.0), size=(3.1, 3.3, 0.45), level=1)
    E('crate', id='c_garden', p=(3.0, 0.25, -26.6), level=0, ry=20)
    E('crate', id='c_heavy', p=(3.4, 2.8, -34.0), level=1, ry=-15)
    E('plate', id='plate2', p=(-3.2, 2.35, -35.2), r=1.15, threshold=16)
    E('door', id='gate', p=(0.0, 2.3, -40.0), size=(3.3, 3.8, 0.4), openIf=['plate2'], mode='up', travel=3.7)
    E('bloom', id='bloom', p=(0.0, 2.6, -46.5))
