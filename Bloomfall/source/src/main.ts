import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
async function start() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);
  for (let i = 0; i < 60; i++) world.step();
  const r = new THREE.WebGLRenderer();
  document.body.textContent = 'rapier ok y=' + body.translation().y.toFixed(3) + ' three r' + THREE.REVISION + ' webgl2=' + r.capabilities.isWebGL2;
}
start();
