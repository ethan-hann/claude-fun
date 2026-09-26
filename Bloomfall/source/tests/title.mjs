// Candidate title shots. SHOTS env: JSON list of [x,y,z,lx,ly,lz]
const shots = JSON.parse(process.env.SHOTS || '[]');
export const steps = [
  { name: 'title', code: `(()=>{ __director.showTitle(); __game.paused = true; return 'ok'; })()` },
  ...shots.map((c, i) => ({ name: 'shot' + i, shot: true, code: `(()=>{ window.__titleCam = ${JSON.stringify(c)}; for (let k=0;k<3;k++){ __director.update(1/60); } __game.renderFrame(1/60); return 'ok'; })()` })),
];
