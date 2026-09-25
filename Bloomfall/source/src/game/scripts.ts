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
  // Island III: the abutment falls away once the player takes the span they crossed.
  let cFallen = false;
  let cSaved: { spawn: any; yaw: number; cells: number } | null = null;
  const cIsland = () => d.game.islands.find((i) => i.key === 'c_viaduct')!;
  const localZ = (key: string) => d.game.player.pos.z - d.game.islands.find((i) => i.key === key)!.origin.z;
  return {
    c_viaduct: {
      reset() {
        cFallen = false;
        if (cSaved) { const i = cIsland(); i.spawn.copy(cSaved.spawn); i.spawnYaw = cSaved.yaw; i.startCells = cSaved.cells; }
      },
      graft(kind, target) {
        if (cFallen || kind !== 'take' || !target.id.endsWith('.s_a')) return;
        const zone = d.game.entities.get('c_viaduct.z_pier1') as Zone | undefined;
        if (!zone?.active) return;
        cFallen = true;
        const isl = cIsland();
        if (!cSaved) cSaved = { spawn: isl.spawn.clone(), yaw: isl.spawnYaw, cells: isl.startCells };
        // from now on a reset starts on the pier, with the span's cell in hand
        isl.spawn.set(isl.origin.x, isl.origin.y + 0.05, isl.origin.z - 4.4);
        isl.spawnYaw = 0;
        isl.startCells = 1;
        setTimeout(() => {
          if (!cFallen) return;
          isl.detachChunk('abutment');
          d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 10)), 6, 0.7);
        }, 700);
      },
      hints: () => {
        const z = localZ('c_viaduct');
        if (!cFallen && z > -3) return [
          'The span to the lookout holds a cell of space. Every unfolded span does.',
          'Take that cell and give it to the folded span at the gap.',
          'Visit the lookout before you fold its span.',
        ];
        if (z > -36) return [
          'The span you crossed still holds its cell. Take it back from the far side.',
          'Give the cell to the pillar and ride it up.',
          'Once you are up, the pillar is behind you. Take it back too.',
          'Bring the crate from the middle pier. You will need it at the shrine.',
        ];
        return [
          'The ram pushes whatever sits in its channel through the slot.',
          'The plate needs 16. A large crate weighs 16, but a large crate will not fit through the slot.',
          'Your Graft reaches through the screen. Grow the crate once it is inside.',
          'Inside, you can hold two cells. The crate on the plate holds two.',
        ];
      },
    },
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
