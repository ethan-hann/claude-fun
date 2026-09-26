// See-through gaps: render every island's view distance from a grid of standing spots in eight
// directions, and flag tall, thin strips that are much farther away than the surfaces on both
// sides (a slit between two walls, whatever shows through it). Run with tools/scan.mjs; candidate
// frames are saved with the strip marked in red.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body) => ({ name, code: `(()=>{ ${body} })()` });
const scan = (i) => s(`island_${i}`, `
  const g=__game, d=__director, R=g.r.renderer, cam=g.r.camera;
  if (d.index!==${i}) { d.startAt(${i}, true); d.ui.fade(0,0); T.step(0.3); }
  const isl=g.islands[${i}], b=isl.bounds;
  const w=320, h=180, RT=g.r.composer.inputBuffer.constructor, rt=new RT(w,h,{type:1015});
  const SM=g.r.sky.dome.material.constructor;
  const distMat=new SM({ vertexShader:'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader:'varying float vD; void main(){ gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }', side:2 });
  const asp=cam.aspect, pos=cam.position.clone(), q=cam.quaternion.clone();
  cam.aspect=w/h; cam.updateProjectionMatrix();
  const V=T.V, buf=new Float32Array(w*h*4), out=[]; let views=0;
  const D=(x,y)=>buf[((h-1-y)*w+x)*4];
  for (let x=b.min.x+1.5; x<b.max.x; x+=3) for (let z=b.min.z+1.5; z<b.max.z; z+=3) {
    const hit=g.phys.castRay(V(x,b.max.y+2,z), V(0,-1,0), b.max.y-b.min.y+4, 0x0001);
    if (!hit) continue;
    const fy=b.max.y+2-hit.toi; if (hit.normal.y<0.7) continue;
    const up=g.phys.castRay(V(x,fy+0.2,z), V(0,1,0), 1.8, 0x0001); if (up) continue;
    for (let k=0;k<8;k++) {
      const yaw=k*Math.PI/4;
      cam.position.set(x, fy+1.6, z); cam.rotation.set(0, yaw, 0, 'YXZ'); cam.updateMatrixWorld(true); g.r.sky.update(cam);
      g.r.scene.overrideMaterial=distMat; R.setRenderTarget(rt); R.clear(); R.render(g.r.scene, cam); R.setRenderTarget(null); g.r.scene.overrideMaterial=null;
      R.readRenderTargetPixels(rt,0,0,w,h,buf); views++;
      // vertical slits: narrow runs (up to 16 px) much farther away than the surfaces on both sides,
      // stacked in a column at least six times taller than wide (doors and arcades are wider)
      const col=new Int16Array(w), wsum=new Float32Array(w), best=new Int16Array(w), where=new Int16Array(w), bw=new Float32Array(w);
      for (let y=0;y<h;y++) {
        const mark=new Uint8Array(w), mw=new Uint8Array(w);
        for (let xs=1; xs<w-1; xs++) {
          const near=Math.max(D(xs-1,y), 0.05);
          if (!(D(xs,y) > near*1.6+1.0)) continue;
          let xe=xs; while (xe+1<w-1 && D(xe+1,y) > near*1.6+1.0) xe++;
          const right=D(xe+1,y);
          if (right*1.6+1.0 < D(xe,y) && xe-xs<16 && Math.abs(right-near) < 0.35*Math.max(right,near)+0.3) {
            const c=(xs+xe)>>1; for(let k=-2;k<=2;k++) if(c+k>=0&&c+k<w){ mark[c+k]=1; mw[c+k]=xe-xs+1; }
          }
          xs=xe;
        }
        for (let c=0;c<w;c++){ if(mark[c]){ col[c]++; wsum[c]+=mw[c]; } else { col[c]=0; wsum[c]=0; } if(col[c]>best[c]){best[c]=col[c]; where[c]=y; bw[c]=wsum[c]/col[c];} }
      }
      let bc=-1; for (let c=0;c<w;c++) if (best[c]>=25 && best[c]>=6*bw[c] && (bc<0||best[c]>best[bc])) bc=c;
      if (bc>=0) {
        const img=new Uint8ClampedArray(w*h*4);
        for (let y=0;y<h;y++) for (let xx=0;xx<w;xx++){ const p=(y*w+xx)*4; const l=255*Math.max(0,1-Math.log2(1+D(xx,y))/7); img[p]=l; img[p+1]=l; img[p+2]=l; img[p+3]=255; }
        const y1=where[bc], y0=y1-best[bc]; for (let y=Math.max(0,y0);y<=y1;y++) for (const xx of [bc-4,bc+4]) if(xx>=0&&xx<w){ const p=(y*w+xx)*4; img[p]=255; img[p+1]=0; img[p+2]=0; }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').putImageData(new ImageData(img,w,h),0,0);
        const tag='i${i}_'+x.toFixed(1)+'_'+z.toFixed(1)+'_'+k; window.__scan=(window.__scan||{}); window.__scan[tag]=cv.toDataURL('image/png');
        out.push({tag, width:+bw[bc].toFixed(1), local:[+(x-isl.origin.x).toFixed(1), +(fy-isl.origin.y).toFixed(1), +(z-isl.origin.z).toFixed(1)], yaw:k*45, col:bc, rows:best[bc]});
      }
    }
  }
  distMat.dispose(); rt.dispose(); cam.aspect=asp; cam.updateProjectionMatrix(); cam.position.copy(pos); cam.quaternion.copy(q);
  return {views, found:out.length, out:out.slice(0,40)};`);
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.newGame(); d.ui.fade(0,0); T.step(0.5); return 'ok';`),
  ...[0, 1, 2, 3, 4, 5].map(scan),
];
