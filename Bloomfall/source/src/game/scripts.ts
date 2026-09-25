import type { Director } from './director';
import type { Zone, Plate } from './entities';
import type { Lattice } from './lattice';

// Per-island behavior beyond the generic entities: story beats, collapses, hints.
export interface IslandScript {
  reset?(): void;
  arrive?(fromBridge: boolean): void;
  zone?(id: string, z: Zone): void;
  plate?(p: Plate, on: boolean): void;
  graft?(kind: 'give' | 'take', target: Lattice): void;
  bloom?(): void;
  update?(dt: number): void;
  resetIsland?(): void;
  hints?(): string[];
}

export function islandScripts(d: Director): Record<string, IslandScript> {
  // Island II: the garden breaks away once the player stands on the terrace.
  let bFallen = false;
  let bSpawn: { p: any; yaw: number } | null = null;
  const bIsland = () => d.game.islands.find((i) => i.key === 'b_terraces')!;
  return {
    b_terraces: {
      reset() {
        bFallen = false;
        if (bSpawn) { bIsland().spawn.copy(bSpawn.p); bIsland().spawnYaw = bSpawn.yaw; }
      },
      zone(id) {
        if (id !== 'z_top' || bFallen) return;
        bFallen = true;
        const isl = bIsland();
        if (!bSpawn) bSpawn = { p: isl.spawn.clone(), yaw: isl.spawnYaw };
        setTimeout(() => {
          if (!bFallen) return;
          isl.spawn.set(isl.origin.x, isl.origin.y + 4.3, isl.origin.z - 14.2);
          isl.spawnYaw = 0;
          isl.detachChunk('garden');
          d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 3)), 6, 0.7);
          d.echoOnce('b_fall', 2.0);
        }, 700);
      },
      hints: () => bFallen ? [
        'The plate holds the gate open. The medium crate is heavy enough to hold it.',
        'The gate is a screen. Your Graft reaches through it. Bodies do not.',
        'Once you are through, the crate on the plate is only holding space you need. Take it back through the screen.',
      ] : [
        'The wall is 4.3 m. Standing on a large crate you reach 3.5 m. On a medium crate stacked on a large one, 4.5 m.',
        'Lattice lifts whatever stands on it. Stand on a small crate and give it space.',
        'Carry the second crate while you ride. Set it on top, stand on it, and grow it too.',
        'Three bollards hold one cell each. You can take from them while standing on a crate.',
      ],
    },
    a_vault: {
      hints: () => {
        const g = d.game.graft;
        if (!g.owned) return ['Carry the crate onto the plate. The door stays open while the plate holds it.', 'The second crate is a step. Set it against the ledge.'];
        return [
          'Take the space out of the lattice wall in the arch. It sinks into the floor.',
          'Give that space to the small crate. A medium crate is a step up to the terrace.',
          'The heavy plate needs 16. Grow the medium crate on the terrace into a large one while it sits on the plate.',
          'Your Graft is empty? Take the space back from the crate you climbed. You can reach it from the terrace.',
        ];
      },
    },
  };
}
