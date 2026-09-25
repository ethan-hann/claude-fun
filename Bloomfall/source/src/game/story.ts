// All words the game shows. Keys in {braces} render as key caps: {E}, {LMB}, {RMB}, {Space}...

export const CHAPTERS: Record<string, { numeral: string; name: string }> = {
  a_vault: { numeral: 'I', name: 'The Seed Vault' },
  b_terraces: { numeral: 'II', name: 'The Terraces' },
  c_viaduct: { numeral: 'III', name: 'The Viaduct' },
  d_weighhouse: { numeral: 'IV', name: 'The Weighhouse' },
  e_colonnade: { numeral: 'V', name: 'The Colonnade' },
  f_heart: { numeral: 'VI', name: 'The Heartbloom' },
};

export interface Card { title: string; body: string }

export const CARDS: Record<string, Card> = {
  look: { title: 'Look', body: 'Move the mouse to look around.' },
  move: { title: 'Move', body: '{W}{A}{S}{D} to walk. Hold {Shift} to run.' },
  jump: { title: 'Jump', body: '{Space} to jump. The floor ahead has fallen in.' },
  carry: { title: 'Carry', body: '{E} picks up a crate. {E} again sets it down. A door stays open while its plate holds enough weight.' },
  step: { title: 'Climb', body: 'Set the crate against the ledge. Jump onto the crate, then jump again.' },
  graft: { title: 'The Graft', body: '{E} to take the Graft.' },
  take: { title: 'Take', body: 'Aim at lattice, the dark metal with glowing seams. {RMB} takes its space. It shrinks, and your Graft fills.' },
  give: { title: 'Give', body: '{LMB} gives space back. The lattice grows. Your Graft can only give what it has taken.' },
  weight: { title: 'Weight', body: 'Bigger lattice weighs more. Small weighs 1, medium 4, large 16. You weigh 4. The notches on a plate show how much it needs.' },
  reset: { title: 'Stuck?', body: 'Hold {R} to reset this island.' },
  takeback: { title: 'Out of space', body: 'Your Graft is empty. Space has to come from somewhere. Take it back from lattice you no longer need, even far away.' },
  throw: { title: 'Throw', body: '{F} throws what you carry.' },
  ride: { title: 'Grow under your feet', body: 'Lattice lifts whatever stands on it as it grows. That includes you, and anything you carry.' },
  span: { title: 'Spans', body: 'A span is anchored lattice. Give it space and it unfolds across the gap. Take the space and it folds back.' },
  pillar: { title: 'Pillars', body: 'A pillar rises one step for each cell you give it, and carries whatever stands on it.' },
  capacity: { title: 'A second cell', body: 'Your Graft now holds two cells of space.' },
  heavier: { title: 'Counterweight', body: 'The heavier side sinks. The lighter side rises.' },
  topple: { title: 'Downfall', body: 'Lattice pushes as it grows. Some things only stand until something pushes them.' },
  infinite: { title: 'The Heart', body: 'Here your Graft never runs dry. {LMB} as often as you like.' },
  core: { title: 'The core', body: 'Hold {RMB} on the core.' },
};

export interface EchoLine { text: string; hold?: number }

export const ECHOES: Record<string, EchoLine[]> = {
  wake: [
    { text: 'Tender. Wake up.' },
    { text: 'If you can hear this, the Heartbloom did not stop.' },
    { text: 'I am sorry to wake you into this.' },
  ],
  landing: [
    { text: 'This is the cloister of the Seed Vault.' },
    { text: 'I left your Graft by the tree.' },
  ],
  graft: [
    { text: 'Your Graft moves space. It takes space out of lattice and gives it back.' },
    { text: 'It cannot make space. It cannot destroy it.' },
    { text: 'That was the law. We broke it.' },
  ],
  bloom_a: [
    { text: 'Look at it. Calyx.' },
    { text: 'The sky went dark long ago. Every other star fell past the edge of the sky.' },
    { text: 'So we made our own room. We bloomed new space from nothing, for ten thousand years.' },
    { text: 'Then the Heartbloom would not stop.' },
    { text: 'Go to the Heart, Tender. Fold it shut.' },
  ],
  b_arrive: [
    { text: 'Every street is wider than it was yesterday.' },
    { text: 'Every friend is farther away.' },
  ],
  b_fall: [
    { text: 'Do not look back. Nothing behind you is coming with us.' },
  ],
  c_arrive: [
    { text: 'We tried to hold the districts together with bridges.' },
    { text: 'The space between them grew faster than we could build.' },
  ],
  c_upgrade: [
    { text: 'A second cell. Your Graft can hold more now.' },
    { text: 'It will need to.' },
  ],
  d_arrive: [
    { text: 'The Weighhouse. Here we measured out space, room by room, life by life.' },
    { text: 'There was never enough. So we made more.' },
  ],
  e_arrive: [
    { text: 'The Colonnade fell last spring.' },
    { text: 'There is no spring anymore. There is only this evening, and it does not end.' },
  ],
  f_arrive: [
    { text: 'The Heart makes space faster than the city can fall apart.' },
    { text: 'Here your Graft cannot run dry. Give freely.' },
    { text: 'Then take it all.' },
  ],
  f_core: [
    { text: 'Fold it shut, Tender.' },
    { text: 'Let Calyx fall inward. Let it be small again.' },
  ],
};

export const EPILOGUE = [
  'Calyx fell inward, like a flower closing for the night.',
  'Every street, every tower, every empty room folded into a seed small enough to hold.',
  'It drifts now, somewhere in the dark.',
  'It is waiting for a sky with stars.',
];

export const SEEDS: Record<string, { title: string; text: string }> = {
  a_vault: {
    title: 'A letter, unsent',
    text: 'My daughter\'s school drifted past the river district this morning. She waved at me across the gap. It was a hundred meters. Tonight it is two hundred.',
  },
  b_terraces: {
    title: 'Council minutes',
    text: 'Motion to bloom one more district. More room for everyone. Carried, 212 to 3. Nobody asked what we would do with the room.',
  },
  c_viaduct: {
    title: 'An engineer\'s note',
    text: 'We built the bridges out of lattice so they could stretch. They stretched. Then they tore.',
  },
  d_weighhouse: {
    title: 'The last ledger entry',
    text: 'Household 4,117,202. Requested: one more room. Granted.',
  },
  e_colonnade: {
    title: 'A concert program',
    text: 'The last concert was in the Colonnade. The orchestra sat so far apart that the music arrived in pieces.',
  },
  f_heart: {
    title: 'The Gardener',
    text: 'If a Tender finds this: the Heart cannot be stopped from outside. It can only be taken, all at once, by something willing to hold it.',
  },
};
