# Bloomfall

A first-person physics puzzle platformer. The last city made room from nothing until it could not stop. Now it is coming apart, and you carry the only tool that can move space.

Open [bloomfall.html](bloomfall.html) in a desktop browser with WebGL 2. Everything is inside that one file, so it runs offline. It is about 29 MB and takes a few seconds to load. Headphones help.

This file covers what the game tells you in its opening and tutorial. [LORE.md](LORE.md) describes the world, also without spoilers. [SPOILERS.md](SPOILERS.md) covers the solutions and the ending. Read it after you finish.

### Premise

Calyx is the last city. Its people learned to bloom space: to make new room out of nothing. The city grew for ten thousand years. Then the engine at its center, the Heartbloom, would not stop. The districts are drifting apart under a sunset that never ends.

You are a Tender, a small gardener built to tend the city. A recorded voice wakes you in a seed vault.

### Goal

Cross the drifting islands of Calyx to the Heartbloom. Each island ends at a bloom, a metal flower. Step onto it and a bridge grows to the next island. The island behind you does not wait.

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Run |
| Left click or Z | Give space: the lattice you aim at grows |
| Right click or X | Take space: the lattice you aim at shrinks |
| E | Pick up, set down, use |
| F or middle click | Throw what you carry |
| Hold R | Reset the island |
| H | Hint |
| Esc | Pause |

A gamepad works too. The left stick moves and the right stick looks. Click the left stick to run. A jumps, RT gives, LT takes, X uses, B throws, hold Y to reset, Back shows a hint, and Start pauses.

### The Graft

Early on you find the Graft, a device worn on the forearm.

- Lattice is dark metal with glowing seams. The Graft can move space in and out of it.
- Take (right click) pulls space out of lattice. It shrinks, and one of the Graft's cells fills.
- Give (left click) puts space back. The lattice grows, and a cell empties.
- The Graft cannot make space and cannot destroy it. If your cells are empty, take space from lattice you no longer need, even if it is far away.
- Crates come in three sizes. Small weighs 1, medium weighs 4, and large weighs 16. You weigh 4. You can carry small and medium crates.
- A pressure plate shows how much weight it needs with a ring of notches.
- Lattice lifts whatever stands on it as it grows, including you.
- Perforated screens stop bodies. The Graft reaches straight through them.

You can climb about 1.5 m above whatever you stand on.

### Progression

There are six islands. Each one adds a new kind of lattice or a new way to use what you know. The Graft learns to hold more space as you go. Six memories are hidden along the way. They are optional.

### Saving and chapters

The game saves in your browser each time you reach a new island. Continue on the title screen picks it up. Chapters lets you replay any island you have reached.

### Settings

- Interface size scales all text and the HUD, from 70 to 180 percent.
- Graphics has four levels. Low turns off real-time shadows and ambient occlusion and renders at a lower resolution. Ultra renders at up to twice your screen's resolution with sharper shadows.
- Mouse sensitivity, invert look, field of view, volume, and music.

### Sound

Everything you hear is synthesized live with WebAudio: the wind, the score, the Heartbloom's hum, stone and metal.

### Building from source

The game is a TypeScript project built with Vite. The source is in [source/](source/).

```
cd source
npm install
npm run build        # type-checks, builds, and copies the single file to ../bloomfall.html
```

The islands are built, lit, and baked in Blender from Python. The Blender scripts need Blender 5.0.1 as a Python module (`pip install bpy==5.0.1 numpy pillow`).

```
python3 tools/fetch_assets.py                 # downloads the CC0 textures, sky, and models into .cache/
<bpy python> tools/process_textures.py        # makes the game's WebP texture sets
<bpy python> tools/process_sky.py             # rotates and encodes the sky
<bpy python> blender/build_props.py           # crates, orbs, the Graft, the bloom, the column
<bpy python> blender/build_island.py a_vault  # one island: geometry, colliders, lightmap bake, GLB
```

`build_island.py` accepts `--quick` for a fast, noisy bake while laying out a level, and `--nobake` for geometry only. Each island script is in `blender/islands/`. Static geometry gets a baked lightmap (sky, bounce light, and a sun visibility mask). Everything that moves is lit in real time and casts real-time shadows.

The scripted playthroughs in `tests/` drive the game's real input in headless Chromium and save screenshots:

```
node tools/play.mjs tests/island_a.mjs out/ "manual" 1280 720
```

### Credits

- Textures, sky, and models: [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com), all CC0.
- Fonts: Syne, Sora, and Fraunces, under the SIL Open Font License.
- Libraries: three.js (MIT), Rapier physics (Apache 2.0), postprocessing (Zlib), and N8AO (CC0).
