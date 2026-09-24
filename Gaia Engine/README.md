# Gaia Engine

A steampunk first-person shooter built on Greek myth. You are the world.

Open `gaia-engine.html` in a desktop browser with WebGL. It loads Three.js from the jsDelivr CDN, so it needs a network connection.

### Premise

You are Gaia, the clockwork earth. Typhon, Father of Monsters, sends his bronze brood to tear out your heart, the Omphalos. You have no body but the land. You walk it as a wandering Eye and fight with the ground itself.

### Goal

- Survive four waves of the brood: bronze harpies, minotaurs, and cyclopes.
- The fifth wave brings Typhon. Break his three chest furnaces, then destroy the crown-core in his head.
- You win when Typhon falls. You lose when the Omphalos reaches 0.

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move the Eye |
| Mouse | Look |
| Space / Shift | Jump / Run |
| Left click | Steam Lance. Heads and glowing eyes take 2.5x damage. Builds heat and vents when it overheats. |
| Right click | Earth Piston. Raises a pillar from the ground you aim at. It crushes, launches, and staggers enemies. Stand on it to launch yourself. Costs 35 Pressure. |
| Q | Tremor. Damages and stuns everything near the Eye. Costs 60 Pressure. |
| F | Earthwalk to the organ under the most threat |
| 1 - 5 | Earthwalk to a chosen organ |
| Esc | Pause |
| M | Music on or off |

### How the world works

- Your organs are the Omphalos and four Pylons. Enemies attack them, and the Pylons feed your Pressure. Each Pylon that falls slows Pressure regeneration.
- The sky reddens and the world's clock ticks faster as the Omphalos weakens.
- Slain beasts return their metal to the heart and heal it a little.
- If your Eye breaks, the Omphalos spends 100 strength to rebuild it.
- Fallen Pylons are rebuilt between waves.

### Music

The score is synthesized live and follows the game: a calm clockwork theme between waves, a driving battle theme, a choir and brass theme for Typhon, and a fanfare or a dirge at the end. A heartbeat rises under the music when the Omphalos drops below 35 percent. Wind, steam vents, turning gears, and a distant clock-tower chime fill the quiet moments.

A short tutorial runs at the start. Press Enter to skip it.
