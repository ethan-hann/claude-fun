# Claude Fun

This repo is just some fun stuff I've made with Claude Code using a single prompt; the canonical "one-shot" and "make no mistakes".

Every folder is a self contained "project". I use project loosely because most of these are single file deliverables.

> [!IMPORTANT]
> I am not a "vibe-coder". All of my projects (even personal ones) follow a strict planning and designing phase before any code ever gets written and I always review code that is produced.
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

Follow-up requests during the session:

```
Add a task to your list to write up a LORE.md file, with screenshots if possible.
```

```
The LORE file should try to not spoil anything. It's mostly to serve as a world building document. Move the spoiler bits to a SPOILER document instead.
```

```
your README still has spoilers btw
```
