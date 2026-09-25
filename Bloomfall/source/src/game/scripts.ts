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
  return {
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
