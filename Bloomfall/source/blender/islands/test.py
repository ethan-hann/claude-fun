"""Pipeline test island."""
TITLE = 'Test'


def build(b):
    b.lm_size = 1024
    # floor slab and underside
    outline = [(-12, -12), (12, -12), (13, 0), (12, 12), (-12, 12), (-13, 0)]
    b.poly_prism(outline, -1.0, 0.0, mat='tiles', bevel=0.05)
    b.underside(outline, -1.0, 14, seed=3)
    # walls
    b.box((0, 2, -11), (20, 4, 0.8), mat='wall', bevel=0.04)
    b.box((-11, 2, -3), (0.8, 4, 12), mat='ribbed', bevel=0.04)
    b.box((6, 1.5, -6), (3, 3, 3), mat='marble', bevel=0.05)
    b.cyl((-5, 2.5, 4), 0.5, 5, mat='marble', segments=24)
    b.cyl((-2, 2.5, 4), 0.5, 5, mat='marble', segments=24)
    b.stairs((4, 0, 4), (0, -1), 6, 0.2, 0.35, 3.0, mat='concrete')
    b.railing((-8, 0, 10), (8, 0, 10))
    b.balustrade((-12, 0, -8), (-12, 0, 8))
    b.glow_strip((0, 3.6, -10.55), (8, 0.08, 0.08), color='glow_cyan')
    b.prop('dead_tree_trunk', (8, 0, 6), rot_y=0.5, scale=1.0, decimate=0.2, collider=('cyl', 0.4, 4))
    b.entity('crate', id='c1', p=(0, 0.5, 2), size=1)
    b.entity('spawn', p=(0, 0, 8), yaw=0)
