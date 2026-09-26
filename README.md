# Claude Fun

This repo is just some fun, small browser games I've made with Claude Code using a single prompt[^1].

Every folder is a self contained "project". I use project loosely because most of these are single file deliverables.

> [!IMPORTANT]
> I am not a "vibe-coder" and don't pretend to be. All of my projects (even personal ones) follow a strict planning and designing phase before any code ever gets written and I always review code that is produced.
> 
> That being said, it is fun to just see what Claude is capable of without a bunch of constraints. It is also [potentially very dangerous](https://www.anthropic.com/research/mythos-preview), so do this at your own risk.

Each project below contains a brief description and the prompt used.

## Gaia Engine

A steampunk first-person shooter built on Greek myth. You are the world.

Open [gaia-engine.html](<Gaia Engine/gaia-engine.html>) in a desktop browser with WebGL. It loads Three.js from the jsDelivr CDN, so it needs a network connection. Full README [here](<Gaia Engine/README.md>).

### Prompt:

```
You are an experienced game developer that is an expert at 3d game design. You ship tight, bug-free code.

Your goal is a 3d game with the follow idea:
Genre: FPS
Rule: You Are The World
Setting: Steampunk
Theme: Myth

STANDING RULES:
1) The game must have a goal and an end state.
2) The game should have a small tutorial at start explaining the mechanics.
3) You must use Three.js for 3d rendering.
4) One contained HTML file.
5) No subagents and no workflows.

I will not describe the game any more than that. You will continue until a complete, playable game has been produced. Do not surface design questions to me and do not ask me anything. You make the decisions. You may use any skill needed to help with the design and implementation.
```
#### Model: Opus 5.5 - High

## The Tithe

A Souls-like set in Halcyon, a perfect city where everything is connected. You are the one who pays for it.

Open [the-tithe.html](<The Tithe/the-tithe.html>) in a desktop browser with WebGL. It loads Three.js from the jsDelivr CDN and its fonts from Google Fonts, so it needs a network connection. Full README [here](<The Tithe/README.md>). The world is described in [LORE.md](<The Tithe/LORE.md>), without spoilers.

### Prompt:

```
You are an experienced game developer that is an expert at 3d game design.

Your goal is a 3d game with the following idea:
Genre: Souls-like
Rule: Everything is connected
Setting: Utopia
Theme: Revenge

STANDING RULES:
1) The game must have a goal and an end state.
2) The game should have a small tutorial at start explaining the mechanics.
3) You must use Three.js for 3d rendering.
4) One contained HTML file.
5) No subagents and no workflows.

Keep going until it is finished. Finished means you would be proud to show it, not that it runs.

Check your work by running it, not by reading the code.

Before you stop, use it the way a first-time player would. List the weakest parts of the experience and fix them. Do this at least twice.

Make every decision yourself. Do not ask me anything. When you finish, tell me what you could not verify.
```
#### Model: Opus 5.5 - Max

## Bloomfall

A first-person physics puzzle platformer at the end of time. The last city made room from nothing until it could not stop. Now it is coming apart, and you carry the only tool that can move space.

Open [bloomfall.html](Bloomfall/bloomfall.html) in a desktop browser with WebGL 2. Everything it needs is inside that one file, so it runs offline. Full README [here](Bloomfall/README.md). The world is described in [LORE.md](Bloomfall/LORE.md), without spoilers. The source and the Blender scripts are in [Bloomfall/source](Bloomfall/source).

### Prompt:

```
You are an experienced game developer and technical artist. You are an expert at 3D game design and real-time graphics.

Your goal is a 3D game with the following idea:
Genre: Physics x Puzzle Platformer
Rule: Expanding World
Setting: Distant Future
Theme: Downfall

STANDING RULES:
1) The game must have a goal and an end state.
2) The game must have a small tutorial at the start that explains the mechanics.
3) There must be a feeling of progression.
4) Use Three.js for 3D rendering. Write the game as a TypeScript project built with Vite. The build must output one self-contained HTML file that runs offline. Commit that built file so the game can be played without building.
5) The graphics must look realistic, like a current indie game, not low poly. Aim for real materials, soft light, and atmosphere.
   - Every solid surface uses a full PBR texture set (color, normal, roughness) from CC0 sources such as Poly Haven and ambientCG. No flat colors except on glowing surfaces.
   - Use detailed models, or bevel the edges of simple shapes. Do not use stylized low-poly packs such as Kenney or Quaternius.
   - Light the world with an HDRI environment, soft shadows, ambient occlusion, and tone mapping.
   - Include a graphics quality setting.
6) Use Blender, scripted in Python, to build, clean up, and light the game's assets. Bake lighting into lightmaps for geometry that never moves. Anything that moves or changes uses real-time light and shadows. Commit the Blender scripts so every asset can be rebuilt.
7) You may use CC0 3D models, textures, HDRIs, and animations. Commit only the files the game uses. Keep the built HTML file under 50 MB.
8) Put the game in its own folder with a README.md that explains how to play, without spoilers. Add the game to the root README with this prompt, like the other entries.
9) If the world building is large, create a LORE.md file and a SPOILERS.md file. LORE.md contains world-building facts and screenshots. SPOILERS.md contains everything a new player should not know before playing.
10) No subagents and no workflows.

NOTES FROM A TEST RUN IN THIS ENVIRONMENT:
- Downloads work from npm, Poly Haven, ambientCG, Google Drive, jsDelivr, and raw.githubusercontent.com. Poly Haven (api.polyhaven.com) and ambientCG (ambientcg.com/api/v2/full_json) have JSON APIs that list download links. GitHub web pages and zip downloads are blocked, but git clone of a public repo works.
- `pip install bpy` installs Blender 5.0.1 as a Python module in about 20 seconds. It takes about 1 GB of disk and runs without a screen. Cycles baked two 512x512 lightmaps at 64 samples in about 9 seconds on the CPU. The glTF exporter wrote the lightmap UV map as TEXCOORD_1.
- Cycles bakes into the active UV map. Make the lightmap UV map active before baking, or the lightmap will not line up with its UVs.
- 8-bit PNG lightmaps clip bright light. In the test, 90% of a sunlit floor clipped to pure white. Baking into a float image and saving it as Radiance HDR fixed it. Each 512x512 HDR lightmap was 400 to 560 KB.
- In Three.js, load HDR lightmaps with HDRLoader, then set channel to 1 and flipY to false to match glTF UVs. With the default flipY, one face of a block turned black and its shadow fell on the wrong side.
- A model that loads its textures from separate files renders untextured once the build inlines it. Pack each model and its textures into one .glb first. `npx @gltf-transform/cli copy in.gltf out.glb` does this.
- New Vite projects add dist/ to .gitignore. Commit the built file anyway.
- The test browser is headless Chromium with a software renderer. It cannot measure real frame rate, and heavy effects make screenshots slow. In an earlier game, a 2560x1440 screenshot with bloom timed out. Use renderer.info (draw calls and triangles) to judge cost. WebGPU was available on a page served from localhost, but not on a data: URL.
- Realistic CC0 human models with good animations barely exist. A human character seen up close will look the worst.

Keep going until it is finished. Finished means you would be proud to show it, not that it runs.

Check your work by running it, not by reading the code.

Before you stop, use it the way a first-time player would. Take screenshots from at least ten places. List the weakest parts of the experience, including anything that looks fake or dated, and fix them. Do this at least twice.

Make every decision yourself. Do not ask me anything. When you finish, tell me what you could not verify.
```

[^1]: By single prompt, I mean a single kick-off prompt. I did have to steer each one a little during the work so something somewhat usable and fun was produced. The follow ups are recorded in the individual READMEs.
