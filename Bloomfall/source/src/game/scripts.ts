import * as THREE from 'three';
import type { Director } from './director';
import type { Zone, Plate } from './entities';
import { FREE_SIZES } from './lattice';
import type { Lattice, FreeLattice } from './lattice';
import { G } from './physics';

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
  // Island II waits to drop the garden until the space up top is enough for the yard: two cells, in
  // the Graft or in lattice on the terrace. Otherwise the island could not be finished.
  const bUpperSpace = () => {
    const isl = bIsland();
    let n = d.game.graft.cells;
    for (const l of isl.lattices) if (l.free && !l.disabled && l.body.translation().y > isl.origin.y + 4.0) n += l.level;
    return n;
  };
  // Island IV: the forecourt breaks away once the player is inside; the memory rides pan B.
  let dFallen = false;
  let dSaved: { spawn: any; yaw: number } | null = null;
  const dIsland = () => d.game.islands.find((i) => i.key === 'd_weighhouse')!;
  // It waits until a crate has come inside too: pan B can only be weighed down with one.
  const dCrateInside = () => {
    const isl = dIsland();
    return isl.lattices.some((l) => l.free && !l.disabled && !l.id.endsWith('.c_a')
      && ((l as FreeLattice).held || l.body.translation().z < isl.origin.z - 7.3));
  };
  // Island V: the south terrace falls once the player is across; the memory rides the first column.
  let eFallen = false;
  let eSaved: { spawn: any; yaw: number } | null = null;
  const eIsland = () => d.game.islands.find((i) => i.key === 'e_colonnade')!;
  // Island VII: once the player has stood on the calyx wall, a fall puts them back on the wall.
  let gSaved: { spawn: any; yaw: number } | null = null;
  const gIsland = () => d.game.islands.find((i) => i.key === 'g_heart')!;
  const gRestore = () => { if (gSaved) { const i = gIsland(); i.spawn.copy(gSaved.spawn); i.spawnYaw = gSaved.yaw; } };
  const bTryFall = () => {
    if (bFallen) return;
    if (bUpperSpace() < 2) { d.echoOnce('b_short', 0.4); return; }
    bFallen = true;
    const isl = bIsland();
    if (!bSpawn) bSpawn = { p: isl.spawn.clone(), yaw: isl.spawnYaw };
    setTimeout(() => {
      if (!bFallen) return;
      // the space went back down in the meantime: wait again
      if (bUpperSpace() < 2) { bFallen = false; return; }
      isl.spawn.set(isl.origin.x, isl.origin.y + 4.3, isl.origin.z - 14.2);
      isl.spawnYaw = 0;
      isl.detachChunk('garden');
      d.game.shake = Math.max(d.game.shake, 0.45); d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 3)), 6, 0.7);
      d.echoOnce('b_fall', 2.0);
    }, 700);
  };
  const dTryFall = () => {
    if (dFallen) return;
    if (!dCrateInside()) { d.echoOnce('d_short', 0.4); return; }
    dFallen = true;
    const isl = dIsland();
    if (!dSaved) dSaved = { spawn: isl.spawn.clone(), yaw: isl.spawnYaw };
    setTimeout(() => {
      if (!dFallen) return;
      if (!dCrateInside()) { dFallen = false; return; }
      isl.spawn.set(isl.origin.x + 1.0, isl.origin.y + 6.05, isl.origin.z - 8.7);
      isl.spawnYaw = 0;
      isl.detachChunk('forecourt');
      d.game.shake = Math.max(d.game.shake, 0.45); d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 4)), 6, 0.7);
    }, 1500);
  };
  return {
    e_colonnade: {
      reset() {
        eFallen = false;
        if (eSaved) { const i = eIsland(); i.spawn.copy(eSaved.spawn); i.spawnYaw = eSaved.yaw; }
      },
      zone(id) {
        if (id !== 'z_mid' || eFallen) return;
        eFallen = true;
        const isl = eIsland();
        if (!eSaved) eSaved = { spawn: isl.spawn.clone(), yaw: isl.spawnYaw };
        isl.spawn.set(isl.origin.x, isl.origin.y + 0.05, isl.origin.z - 6.5);
        isl.spawnYaw = 0;
        setTimeout(() => {
          if (!eFallen) return;
          isl.detachChunk('south');
          d.game.shake = Math.max(d.game.shake, 0.45); d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 8)), 6, 0.7);
        }, 2500);
      },
      update() {
        const col = d.game.entities.get('e_colonnade.t1') as any;
        const seed = d.game.entities.get('e_colonnade.seed') as any;
        if (!col || !seed || seed.taken) return;
        seed.pos.copy(col.pointAt(col.height + 0.35));
      },
      hints: () => {
        const z = localZ('e_colonnade');
        if (z > -4) return [
          'Growing lattice pushes whatever stands in its way.',
          'Shrink the crate, set it against the base of the column, then grow it again.',
          'The column falls away from you, across the chasm.',
        ];
        if (z > -24) return [
          'The plate is in the pit under the grate. Only the channel from the fountain leads in.',
          'A medium orb will not fit through the slot at the bottom of the channel. A small one will.',
          'Roll the orb down, then give it space through the grate until it weighs 16. That takes two cells.',
          'The gate is a screen. Your Graft reaches through it to what stands behind.',
        ];
        return [
          'A fallen column can be a ramp.',
          'Push the column from the side away from the plinth, so it falls against the plinth\'s edge.',
          'The crate or the bollard, whichever still holds space, can grow against the column.',
        ];
      },
    },
    d_weighhouse: {
      reset() {
        dFallen = false;
        if (dSaved) { const i = dIsland(); i.spawn.copy(dSaved.spawn); i.spawnYaw = dSaved.yaw; }
      },
      zone(id) {
        if (id === 'z_inside') dTryFall();
      },
      update() {
        if (!dFallen && (d.game.entities.get('d_weighhouse.z_inside') as Zone | undefined)?.active) dTryFall();
        const scale = d.game.entities.get('d_weighhouse.scale') as any;
        const seed = d.game.entities.get('d_weighhouse.seed') as any;
        if (!scale || !seed || seed.taken) return;
        const t = scale.pans[1].body.translation();
        seed.pos.set(t.x + 0.9, t.y + 0.6, t.z - 0.9);
      },
      hints: () => {
        const z = localZ('d_weighhouse');
        if (!dFallen && z > -6.6) return [
          'The heavier side sinks. The lift will only rise if the counterweight outweighs it.',
          'The lift counts you, and anything resting on it.',
          'Your Graft reaches the counterweight through the screens.',
          'A large crate weighs 16. You can hold two cells: that is two steps of growth.',
          'The forecourt falls once you are inside. Take a crate in with you.',
        ];
        return [
          'Pan A is low because of the large crate on it. Pan B is empty.',
          'Only a crate can weigh pan B down. The catwalk from the south gallery ends over it.',
          'Stand on pan A. Take the large crate\'s space and give it to the crate on pan B, through the pan\'s floor.',
          'When pan B outweighs pan A, pan A rises. Stay on it.',
          ...(dFallen ? [] : ['The forecourt waits until a crate comes inside with you. The one that rode up on the lift will do.']),
        ];
      },
    },
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
          d.game.shake = Math.max(d.game.shake, 0.45); d.audio.rumble(isl.origin.clone().add(new (isl.origin.constructor as any)(0, 0, 10)), 6, 0.7);
        }, 700);
      },
      hints: () => {
        const z = localZ('c_viaduct');
        if (!cFallen && z > -3) return [
          'The span to the lookout holds a cell of space. Every unfolded span does.',
          'Take that cell and give it to the folded span at the gap.',
          'Visit the lookout before you fold its span.',
        ];
        if (z > -31) return [
          'The span you crossed still holds its cell. Take it back from the far side.',
          'Give the cell to the pillar and ride it up.',
          'Once you are up, the pillar is behind you. Take it back too.',
          'Bring the crate from the middle pier. You will need it at the shrine.',
        ];
        if (z > -37.4) return [
          'The shrine deck is 2 m above the span. Too high to climb.',
          'The sunken pillar rises 5 m, to the deck, and carries whatever stands on it.',
          'The span has to stay out while you cross, and your Graft holds one cell. The crate you carry holds one too.',
          'Take the crate with you onto the pillar. Take the crate\'s space and give it to the pillar.',
        ];
        return [
          'The ram pushes whatever sits in its channel through the slot.',
          'The plate needs 16. A large crate weighs 16, but a large crate will not fit through the slot.',
          'Your Graft reaches through the screen. Grow the crate once it is inside.',
          'Everything behind you holds space you no longer need: the span, the ram, the sunken pillar.',
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
        if (id === 'z_top') bTryFall();
      },
      update() {
        if (bFallen) return;
        const z = d.game.entities.get('b_terraces.z_top') as Zone | undefined;
        if (z?.active) bTryFall();
      },
      hints: () => bFallen ? [
        'The plate holds the gate open. The medium crate is heavy enough to hold it.',
        'The gate is a screen. Your Graft reaches through it. Bodies do not.',
        'The ledge in the yard is 3.3 m. From a large crate you reach 3.5 m. A large crate takes two cells.',
        'Stand on the yard crate at the ledge and give it the cell you brought up. Then take the plate crate\'s cell through the screen and give it too.',
      ] : (d.game.entities.get('b_terraces.z_top') as Zone | undefined)?.active ? [
        'The garden waits while the space up here is short of what the yard needs: two cells.',
        'Reach down from the edge and take one more cell from a bollard or a crate in the garden.',
      ] : [
        'The wall is 4.3 m. Standing on a large crate you reach 3.5 m. On a medium crate stacked on a large one, 4.5 m.',
        'Lattice lifts whatever stands on it. Stand on a small crate and give it space.',
        'Carry the second crate while you ride. Set it on top, stand on it, and grow it too.',
        'Four bollards hold one cell each. The climb takes three. The garden falls once you are up, with anything left in it.',
        'Take the fourth cell before you step onto the terrace, and keep it in your Graft.',
      ],
    },
    f_observatory: {
      // A lens that falls into the haze comes back to the last place it rested on solid ground at
      // floor level, not to the far stage it started on.
      update() {
        const isl = d.game.islands.find((i) => i.key === 'f_observatory');
        if (!isl) return;
        for (const id of ['lens_w', 'lens_e', 'lens_n']) {
          const l = d.game.lattices.get(`f_observatory.${id}`) as FreeLattice | undefined;
          if (!l || l.held || l.anim) continue;
          const p = l.position();
          const v = l.body.linvel();
          if (Math.abs(p.y - isl.origin.y) > 2.5 || Math.hypot(v.x, v.y, v.z) > 0.1) continue;
          if (!d.game.phys.castRay(p, new THREE.Vector3(0, -1, 0), l.size / 2 + 0.1, G.STATIC, l.collider)) continue;
          l.spawnPos.set(p.x, p.y - l.size / 2 + FREE_SIZES[l.initialLevel] / 2, p.z);
        }
      },
      hints: () => {
        const isl = d.game.islands.find((i) => i.key === 'f_observatory');
        const at = (id: string) => {
          const l = d.game.lattices.get(`f_observatory.${id}`);
          return l && isl ? l.body.translation() : null;
        };
        const o = isl?.origin;
        const w = at('lens_w'), e = at('lens_e'), n = at('lens_n');
        const out: string[] = [];
        if (o && w && w.x - o.x < -18.4) out.push(
          'West: two cells climb any number of pillars. Give both to the pillar under you, drop to the next, and take them back from the one behind.',
          'West: the span you crossed holds a cell. Borrow it, and give it back when you leave.');
        if (o && e && e.x - o.x > 18.4) out.push(
          'East: the chamber stays open while its plate holds 16. Something else has to weigh 16 before the lens can leave.',
          'East: the crate\'s own cell unfolds the short span. Carry the small crate in.');
        const col = d.game.entities.get('f_observatory.col') as any;
        if (o && n && n.z - o.z < -42.4) {
          if (col && col.state !== 'standing') out.push(
            'North: the fallen column is a bridge. Jump onto it from the end of the span and walk across.',
            'North: the cage opens while its plate holds 4.');
          else out.push(
            'North: the crate beside the column is out of reach from the plaza. Walk out on the span first, but not to its end: the column falls there.',
            'North: the column falls away from whatever grows beside it.');
        }
        out.push(
          'Each span takes one cell. Once you are back, you can take a span back from the plaza and use its cell elsewhere.',
          'A lens fits its cradle only while it is small. Set it down beside an empty cradle, and the cradle draws it in.');
        return out;
      },
    },
    g_heart: {
      reset: gRestore,
      resetIsland: gRestore,
      zone(id) {
        if (id !== 'z_wall') return;
        const isl = gIsland();
        if (!gSaved) gSaved = { spawn: isl.spawn.clone(), yaw: isl.spawnYaw };
        isl.spawn.set(isl.origin.x, isl.origin.y + 4.35, isl.origin.z - 12.4);
        isl.spawnYaw = 0;
      },
      hints: () => {
        const spire = d.game.entities.get('g_heart.spire') as any;
        const isl = d.game.islands.find((i) => i.key === 'g_heart');
        const up = isl ? d.game.player.feet.y - isl.origin.y > 4.0 : false;
        if (spire && spire.state !== 'standing') return [
          'The fallen stamen is a ramp. Jump onto it near its foot and climb to the platform under the Heart.',
          'On the platform, look up at the Heart and hold Take.',
        ];
        if (!up) return [
          'The wall is 4.3 m. Stand on a crate and grow it while you carry another, as on the Terraces.',
          'Stack near the wall. You will want that top crate again.',
        ];
        return [
          'The stamen on the north side of the wall stands over the well. Lattice growing at its foot tips it in.',
          'You need a crate up here. From the wall\'s edge you can reach down to the top of your stack and pick up a medium crate.',
          'No crate in reach? Go down, and throw a small crate up onto the wall, or stack again with the third crate.',
        ];
      },
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
