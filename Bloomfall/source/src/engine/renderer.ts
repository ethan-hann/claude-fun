import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, SMAAEffect, SMAAPreset, NoiseEffect, BlendFunction, BrightnessContrastEffect, HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { Sky, sunDirection, SUN_COLOR, SUN_INTENSITY } from './sky';
import { setMaxAnisotropy, fogUniforms } from './materials';
import { DynamicShadow } from './dynshadow';
import world from '../../shared/world.json';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

interface Preset {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  shadowRadius: number;
  ao: false | 'Performance' | 'Low' | 'Medium' | 'High';
  aoHalf: boolean;
  bloom: boolean;
  smaa: boolean;
  anisotropy: number;
}

export const PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 1024, shadowRadius: 1, ao: false, aoHalf: true, bloom: true, smaa: false, anisotropy: 2 },
  medium: { pixelRatio: 1.0, shadows: true, shadowSize: 1024, shadowRadius: 2, ao: 'Performance', aoHalf: true, bloom: true, smaa: true, anisotropy: 4 },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, shadowRadius: 2.5, ao: 'Medium', aoHalf: false, bloom: true, smaa: true, anisotropy: 8 },
  ultra: { pixelRatio: 2.0, shadows: true, shadowSize: 4096, shadowRadius: 3, ao: 'High', aoHalf: false, bloom: true, smaa: true, anisotropy: 16 },
};

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sky: Sky;
  sun: SunLight;
  composer!: EffectComposer;
  quality: Quality = 'high';
  exposure = 1.0;
  private ao: N8AOPostPass | null = null;
  private bloom!: BloomEffect;
  private toneMap!: ToneMappingEffect;
  private vignette!: VignetteEffect;
  private effectPass!: EffectPass;
  private smaaPass: EffectPass | null = null;
  private renderPass!: RenderPass;
  dynShadow: DynamicShadow;
  focus = new THREE.Vector3();

  constructor(canvas?: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // tone mapping happens in post
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 3000);
    this.sky = new Sky(r);
    this.scene.add(this.sky.dome);

    this.sun = new SunLight(SUN_COLOR, SUN_INTENSITY);
    this.sun.position.copy(sunDirection()).multiplyScalar(100);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun);
    this.dynShadow = new DynamicShadow(sunDirection(), 2048, 24);
  }

  async init(): Promise<void> {
    await this.sky.load();
    fogUniforms.uFogBrightness.value = world.sky.strength;
    this.scene.environment = this.sky.envMap;
    this.scene.environmentIntensity = world.sky.strength;
    this.buildComposer();
    window.addEventListener('resize', () => this.resize());
  }

  private buildComposer(): void {
    const r = this.renderer;
    const preset = PRESETS[this.quality];
    this.composer?.dispose();
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.ao = null;
    if (preset.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      ao.configuration.gammaCorrection = false;
      ao.configuration.aoRadius = 1.6;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = preset.aoHalf;
      ao.configuration.depthAwareUpsampling = true;
      ao.setQualityMode(preset.ao);
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 2.5, luminanceSmoothing: 0.6, intensity: 0.55, radius: 0.7 });
    this.toneMap = new ToneMappingEffect({ mode: (window as any).__toneMode ?? ToneMappingMode.AGX });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.48 });
    const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    noise.blendMode.opacity.value = 0.035;
    const grade = (window as any).__grade ?? [0.12, 0.1];
    const contrast = new BrightnessContrastEffect({ brightness: 0, contrast: grade[0] });
    const sat = new HueSaturationEffect({ saturation: grade[1] });
    const effects = preset.bloom ? [this.bloom, this.toneMap, contrast, sat, this.vignette, noise] : [this.toneMap, contrast, sat, this.vignette, noise];
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);
    this.smaaPass = null;
    if (preset.smaa) {
      this.smaaPass = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
      this.composer.addPass(this.smaaPass);
    }
    this.applyPreset();
  }

  private applyPreset(): void {
    const preset = PRESETS[this.quality];
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    r.shadowMap.enabled = preset.shadows;
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
    this.sun.shadow.radius = preset.shadowRadius;
    this.dynShadow?.setSize(preset.shadowSize);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
    setMaxAnisotropy(Math.min(preset.anisotropy, r.capabilities.getMaxAnisotropy()));
    this.resize();
    // Materials must recompile when shadow settings change.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
    });
  }

  setQuality(q: Quality): void {
    if (q === this.quality && this.composer) return;
    this.quality = q;
    this.buildComposer();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  render(dt: number): void {
    this.sky.update(this.camera);
    this.dynShadow.update(this.renderer, this.scene, this.focus, PRESETS[this.quality].shadows);
    this.renderer.toneMappingExposure = this.exposure;
    this.composer.render(dt);
  }

  info(): { calls: number; triangles: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }
}
