# The Tithe

A Souls-like set in Halcyon, a perfect city where everything is connected. You are the one who pays for it.

Open `the-tithe.html` in a desktop browser with WebGL. It loads Three.js from the jsDelivr CDN and its fonts from Google Fonts, so it needs a network connection. Headphones help.

This file covers only what the game tells you in its opening and tutorial. [LORE.md](LORE.md) describes the world, also without spoilers. [SPOILERS.md](SPOILERS.md) covers everything else. Read it after you finish.

### Premise

Golden threads bind every citizen of Halcyon to every other. The city calls this the Concord. Joy is shared. Pain is not. Every hurt in the city runs down the threads into one person, chosen and chained in a well beneath the streets. That person is the Tithe.

For thirty years the Tithe has been you. Tonight the threads fray.

### Goal

Three people chose you to be the Tithe. Climb out of the Well, find them, and kill them. The pause menu keeps their names and says where each one waits.

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Left click | Light attack. Press again in rhythm for a three-hit combo. |
| Right click | Heavy attack. Slow, strong, and it keeps swinging through light hits. |
| Space | Roll. You cannot be hurt for most of the roll. Standing still steps back instead. |
| Shift | Sprint |
| Q or middle click | Lock on. Scroll or press Tab to switch targets. |
| F | Bind, once you have learned it. Costs one Grief. |
| R | Drink Nectar to heal |
| E | Interact, rest at a Vigil, read inscriptions |
| Esc | Pause |

A gamepad works too. The sticks move and look. RB and RT attack. B rolls, and holding it sprints. R3 locks on, LB binds, X drinks, A interacts, Start pauses.

### Everything is connected

- Golden threads link enemies into groups. You can see them.
- When a linked enemy dies, its pain runs down every thread tied to it. Each enemy at the other end takes 40 percent of its health as damage and staggers. If that kills it, its own threads fire too, so a whole group can collapse from one kill.
- Linked enemies wake up together.
- Later in the game you learn Bind (F). It ties your target to the enemy nearest it with your own red thread. It costs one of the two red diamonds of Grief under your stamina. Grief fills as you deal damage and as you take it.

### Souls-like systems

- Attacks, rolls, and sprinting spend stamina, the gold bar. Enemies telegraph their swings. Roll through them, then punish.
- Vigils are checkpoints. Resting heals you and refills your Nectar, and every enemy you killed stands up again. You can travel between the Vigils you have lit.
- Enemies drop Sorrow. Spend it at a Vigil to raise Vigor (health), Endurance (stamina), or Might (damage).
- When you die you drop your Sorrow where you fell. Reach it before you die again, or it is gone.
- Nectar heals 45 percent of your health. You start with three.
- The game saves in your browser as you play. Continue on the title screen picks it up.

### Tutorial

The game opens in the Undercroft, the well beneath the city. Each room teaches one thing: tearing free, taking your weapon, locking on and attacking, rolling, resting, and linked enemies. Short cards explain each one when you need it. Tick "Skip the tutorial" on the title screen to start at the Undercroft's Vigil with no cards.

### Sound

Everything you hear is synthesized live with WebAudio. Threads snap like plucked strings. The city hums a calm chord that nobody is singing. The Undercroft has its own drone and dripping water.

### Settings

Mouse sensitivity, volume, interface size, inverted look, and a low graphics mode that turns off bloom and lowers shadow detail for slower machines. The interface grows with the window, so it stays readable on large displays.

### What I had to fix

The first pass was complete and playable. It took four follow-up prompts.

- **A lore document.** Claude wrote [LORE.md](LORE.md), with screenshots taken from the game.
- **Spoilers.** The next two prompts pointed out spoilers, first in LORE.md and then in this README. Claude moved the boss fights, hidden items, and endings into [SPOILERS.md](SPOILERS.md). Both files now stay clear of them.

The fourth prompt was the first human playtest. It listed nine problems, and Claude fixed all nine:

- **Rolls spun.** Each roll ended with the character turning a full circle backward. Animation blends now take the short way around.
- **Death particles lingered.** Dead enemies kept giving off particles after their bodies sank away. Six seconds after a kill, 13 were still active. Now none are.
- **Z-fighting.** Claude built a detector that renders the world from 34 viewpoints and flags flickering pixels. It found flicker on the Gate of Descent, on the stained glass and a ceiling ledge in the Choir, and along the edges of the Gardens terraces. Each one is fixed. Spots outside those views were not checked. The fountains also had gold lids that hid their water. They are open basins now.
- **Citizens in trees.** Four citizens on the Promenade stood inside trees, flower beds, or a building. Claude moved them, then tested all 30 citizens against solid objects. None overlap now.
- **Waddling.** The walk and run looked like a penguin. The knees bent while a foot was on the ground and straightened as the leg swung forward. The steps came about twice as fast as a real jog. The new gait bends each knee as the leg swings, lengthens the stride with speed, and leans into the run. Enemies use it too.
- **Rolls did not dodge.** Attacks still landed through well-timed rolls, and one boss attacked almost nonstop. Rolls now protect you from their first frame. Area attacks hurt only where they are drawn. Attacks no longer keep hitting or turn to follow you after the swing. One boss struck 0.18 seconds into his first swing, too fast to react to. His strikes now have a readable windup. The boss who attacked nonstop now pauses after each attack.
- **Difficulty.** Late in the game, regular enemies died in one or two hits, while one boss healed almost as fast as a player could hurt her. Enemies in the Gardens and the Choir now have more health, hit harder, and drop more Sorrow. That boss now heals far less.
- **Bind came too early.** It is now learned later in the game instead of in the tutorial.
- **A tiny HUD.** On a 2560x1440 display the HUD text was too small to read. The HUD and menus now scale with the window, to about 1.9 times the old size at 2560x1440. Settings also has an Interface size slider.
