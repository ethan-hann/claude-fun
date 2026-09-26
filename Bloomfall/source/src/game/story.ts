// All words the game shows. Keys in {braces} render as key caps: {E}, {LMB}, {RMB}, {Space}...

export const CHAPTERS: Record<string, { numeral: string; name: string }> = {
  a_vault: { numeral: 'I', name: 'The Seed Vault' },
  b_terraces: { numeral: 'II', name: 'The Terraces' },
  c_viaduct: { numeral: 'III', name: 'The Viaduct' },
  d_weighhouse: { numeral: 'IV', name: 'The Weighhouse' },
  e_colonnade: { numeral: 'V', name: 'The Colonnade' },
  f_observatory: { numeral: 'VI', name: 'The Observatory' },
  g_heart: { numeral: 'VII', name: 'The Heartbloom' },
};

export interface Card { title: string; body: string }

export const CARDS: Record<string, Card> = {
  look: { title: 'Look', body: 'Move the mouse to look around.' },
  move: { title: 'Move', body: '{W}{A}{S}{D} to walk. Hold {Shift} to run.' },
  jump: { title: 'Jump', body: '{Space} to jump.' },
  carry: { title: 'Carry', body: '{E} picks up a crate. {E} again sets it down.' },
  graft: { title: 'The Graft', body: '{E} to take the Graft.' },
  take: { title: 'Take', body: '{RMB} takes space out of lattice, the dark metal with glowing seams.' },
  give: { title: 'Give', body: '{LMB} gives it back.' },
  weight: { title: 'Weight', body: 'Small lattice weighs 1, medium 4, large 16. You weigh 4.' },
  takeback: { title: 'Out of space', body: 'Your Graft is empty. Take space back from lattice you no longer need, even far away.' },
  ride: { title: 'Grow under your feet', body: 'Lattice lifts whatever stands on it as it grows, you included.' },
  topple: { title: 'Downfall', body: 'Lattice pushes as it grows. Some things only stand until something pushes them.' },
  core: { title: 'The core', body: 'Hold {RMB} on the core.' },
  lens: { title: 'Lenses', body: 'A lens fits its cradle only while it is small.' },
  range: { title: 'Reach', body: 'The Graft reaches about fourteen meters.' },
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
  b_wall: [
    { text: 'This garden will fall the moment you leave it.' },
  ],
  b_short: [
    { text: 'Not yet. There is not enough space up here for the way on.' },
    { text: 'The garden will hold on a little longer. Reach down and take one more cell from it.' },
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
  d_door: [
    { text: 'The forecourt will not hold once you are inside.' },
  ],
  d_short: [
    { text: 'The scale in here needs a crate, and you came in without one.' },
    { text: 'The forecourt will wait. Go back out for one.' },
  ],
  e_arrive: [
    { text: 'The Colonnade fell last spring.' },
    { text: 'There is no spring anymore. There is only this evening, and it does not end.' },
  ],
  f_arrive: [
    { text: 'The Observatory. We built it to look for other lights.' },
    { text: 'In a thousand years it never found one. It kept looking.' },
  ],
  f_dais: [
    { text: 'Its lenses were carried out to the far stages when the city came apart.' },
    { text: 'Bring all three home, and it will find the Heart for you.' },
  ],
  f_gate: [
    { text: 'The way on opens when the instrument can see.' },
  ],
  f_chamber: [
    { text: 'Nothing leaves this room unless something takes its place.' },
  ],
  f_open: [
    { text: 'There. It sees the Heart.' },
    { text: 'It has drifted farther than any bridge we built. Follow the light.' },
  ],
  g_arrive: [
    { text: 'The Heart makes space faster than the city can fall apart.' },
    { text: 'Here your Graft cannot run dry. Give freely.' },
    { text: 'Then take it all.' },
  ],
  g_wall: [
    { text: 'The last stamen still stands on the rim.' },
    { text: 'Everything here leans toward the Heart. Give it a reason to fall.' },
  ],
  g_core: [
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
  f_observatory: {
    title: 'An observer\'s log',
    text: 'Night 3,650,211 of the survey. Nothing past the edge of the sky. Tomorrow we will look again.',
  },
  g_heart: {
    title: 'The Gardener',
    text: 'If a Tender finds this: the Heart cannot be stopped from outside. It can only be taken, all at once, by something willing to hold it.',
  },
};
