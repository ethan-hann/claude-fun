import * as THREE from 'three';

// Dust: a soft puff of stone dust where something heavy lands. Particles drift out and up,
// then settle and fade.

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff { points: THREE.Points; vel: Float32Array; t: number; life: number }

export class Dust {
  private puffs: Puff[] = [];
  private tex = puffTexture();
  constructor(private scene: THREE.Scene) {}

  burst(at: THREE.Vector3, size = 1, count = 70): void {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6 * size;
      pos[i * 3] = at.x + Math.cos(a) * r;
      pos[i * 3 + 1] = at.y + Math.random() * 0.3;
      pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      const sp = (1.2 + Math.random() * 2.6) * size;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = (0.4 + Math.random() * 1.6) * size;
      vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: this.tex, color: new THREE.Color(0.78, 0.7, 0.6), size: 1.1 * size, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.puffs.push({ points, vel, t: 0, life: 3.2 });
  }

  update(dt: number): void {
    for (let k = this.puffs.length - 1; k >= 0; k--) {
      const p = this.puffs[k];
      p.t += dt;
      const pos = p.points.geometry.attributes.position as THREE.BufferAttribute;
      const drag = Math.exp(-dt * 2.2);
      for (let i = 0; i < pos.count; i++) {
        p.vel[i * 3] *= drag;
        p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * drag - 0.25 * dt;
        p.vel[i * 3 + 2] *= drag;
        pos.setXYZ(i, pos.getX(i) + p.vel[i * 3] * dt, pos.getY(i) + p.vel[i * 3 + 1] * dt, pos.getZ(i) + p.vel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      const m = p.points.material as THREE.PointsMaterial;
      const k01 = p.t / p.life;
      m.opacity = 0.55 * Math.min(1, p.t * 6) * (1 - k01);
      m.size = 1.1 + k01 * 1.8;
      if (p.t >= p.life) {
        this.scene.remove(p.points);
        p.points.geometry.dispose();
        m.dispose();
        this.puffs.splice(k, 1);
      }
    }
  }
}
