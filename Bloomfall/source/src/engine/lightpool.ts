import * as THREE from 'three';

// A fixed set of point lights shared by every light source in the world. Each frame the pool
// takes the sources nearest the camera. The light count never changes, so shaders never
// recompile when islands come and go, and every fragment pays for at most `size` lights.

export interface LightSource {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
}

export class LightPool {
  private lights: THREE.PointLight[] = [];
  private sources = new Set<LightSource>();

  constructor(scene: THREE.Scene, size = 8) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  add(position: THREE.Vector3, color: THREE.Color, intensity: number, distance: number): LightSource {
    const s = { position: position.clone(), color: color.clone(), intensity, distance };
    this.sources.add(s);
    return s;
  }

  remove(s: LightSource): void { this.sources.delete(s); }

  update(eye: THREE.Vector3): void {
    const near: { s: LightSource; d: number }[] = [];
    for (const s of this.sources) {
      if (s.intensity <= 0) continue;
      const d = s.position.distanceTo(eye) - s.distance;
      if (d < 40) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const e = near[i];
      if (!e) { l.intensity = 0; return; }
      l.position.copy(e.s.position);
      l.color.copy(e.s.color);
      l.intensity = e.s.intensity;
      l.distance = e.s.distance;
    });
  }
}
