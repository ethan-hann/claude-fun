import * as THREE from 'three';
import { Renderer, Quality } from './engine/renderer';
import { loadIslandVisual } from './engine/level';
import { fogUniforms } from './engine/materials';

// Debug viewer: ?view=<island>&cam=x,y,z,yawDeg,pitchDeg&q=high
export async function runViewer(params: URLSearchParams): Promise<void> {
  const r = new Renderer();
  document.body.appendChild(r.renderer.domElement);
  r.quality = (params.get('q') as Quality) || 'high';
  if (params.has('tm')) (window as any).__toneMode = Number(params.get('tm'));
  if (params.has('lm')) (window as any).__lmDebug = Number(params.get('lm'));
  if (params.has('grade')) (window as any).__grade = params.get('grade')!.split(',').map(Number);
  await r.init();
  const keys = (params.get('view') || 'a_vault').split(',');
  for (const k of keys) {
    const isl = await loadIslandVisual(k);
    r.scene.add(isl.group);
  }
  const cam = (params.get('cam') || '0,1.6,10,0,-5').split(',').map(Number);
  r.camera.position.set(cam[0], cam[1], cam[2]);
  r.camera.rotation.order = 'YXZ';
  r.camera.rotation.set(THREE.MathUtils.degToRad(cam[4]), THREE.MathUtils.degToRad(cam[3]), 0);
  r.focus.copy(r.camera.position);
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  fogUniforms.uFogDensity.value = num('fog', fogUniforms.uFogDensity.value);
  fogUniforms.uFogHeightDensity.value = num('hfog', fogUniforms.uFogHeightDensity.value);
  r.exposure = num('exp', r.exposure);
  r.scene.environmentIntensity = num('env', r.scene.environmentIntensity);
  (window as any).__viewer = { r, THREE, fogUniforms };
  let last = performance.now();
  let frames = 0;
  const loop = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    r.render(dt);
    frames++;
    (window as any).__frames = frames;
    requestAnimationFrame(loop);
  };
  loop();
}
