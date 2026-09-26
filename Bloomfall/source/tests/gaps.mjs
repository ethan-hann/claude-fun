// See-through gaps: paint the sky magenta, render every island from a grid of standing spots in
// eight directions, and flag tall, thin slits of sky between solid surfaces. Run with tools/scan.mjs;
// candidate frames are saved with the slit boxed in red.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body) => ({ name, code: `(()=>{ ${body} })()` });
const scan = (i) => s(`island_${i}`, `
  const g=__game, d=__director, R=g.r.renderer, cam=g.r.camera;
  if (d.index!==${i}) { d.startAt(${i}, true); d.ui.fade(0,0); T.step(0.3); }
  const isl=g.islands[${i}], b=isl.bounds;
  const w=320, h=180, RT=g.r.composer.inputBuffer.constructor, rt=new RT(w,h,{type:1009});
  const dome=g.r.sky.dome, old=dome.material, mag=old.clone();
  mag.fragmentShader='void main(){ gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }'; mag.needsUpdate=true; dome.material=mag;
  const asp=cam.aspect, pos=cam.position.clone(), q=cam.quaternion.clone();
  cam.aspect=w/h; cam.updateProjectionMatrix();
  const V=T.V, buf=new Uint8Array(w*h*4), out=[]; let views=0;
  const isM=(x,y)=>{ const o=((h-1-y)*w+x)*4; return buf[o]>240&&buf[o+1]<20&&buf[o+2]>240; };
  for (let x=b.min.x+1.5; x<b.max.x; x+=3) for (let z=b.min.z+1.5; z<b.max.z; z+=3) {
    const hit=g.phys.castRay(V(x,b.max.y+2,z), V(0,-1,0), b.max.y-b.min.y+4, 0x0001);
    if (!hit) continue;
    const fy=b.max.y+2-hit.toi; if (hit.normal.y<0.7) continue;
    const up=g.phys.castRay(V(x,fy+0.2,z), V(0,1,0), 1.8, 0x0001); if (up) continue;
    for (let k=0;k<8;k++) {
      const yaw=k*Math.PI/4;
      cam.position.set(x, fy+1.6, z); cam.rotation.set(0, yaw, 0, 'YXZ'); cam.updateMatrixWorld(true); g.r.sky.update(cam);
      R.setRenderTarget(rt); R.render(g.r.scene, cam); R.setRenderTarget(null); R.readRenderTargetPixels(rt,0,0,w,h,buf); views++;
      // vertical slits: thin magenta runs (1-4 px) with solid on both sides, stacked in a column
      const col=new Int16Array(w), best=new Int16Array(w), where=new Int16Array(w);
      for (let y=0;y<h;y++) {
        const mark=new Uint8Array(w);
        let xs=0; while (xs<w) { if(!isM(xs,y)){xs++;continue;} let xe=xs; while(xe+1<w&&isM(xe+1,y)) xe++; if(xs>0&&xe<w-1&&xe-xs<4){ const c=(xs+xe)>>1; mark[c]=1; if(c>0)mark[c-1]=1; if(c<w-1)mark[c+1]=1; } xs=xe+1; }
        for (let c=0;c<w;c++){ col[c]=mark[c]?col[c]+1:0; if(col[c]>best[c]){best[c]=col[c]; where[c]=y;} }
      }
      let bc=-1; for (let c=0;c<w;c++) if (best[c]>=30 && (bc<0||best[c]>best[bc])) bc=c;
      if (bc>=0) {
        const img=new Uint8ClampedArray(w*h*4);
        for (let y=0;y<h;y++) for (let xx=0;xx<w;xx++){ const o=((h-1-y)*w+xx)*4, p=(y*w+xx)*4; const m=isM(xx,y); const l=Math.min(255,(buf[o]+buf[o+1]+buf[o+2])/3*1.6); img[p]=m?255:l; img[p+1]=m?0:l; img[p+2]=m?255:l; img[p+3]=255; }
        const y1=where[bc], y0=y1-best[bc]; for (let y=Math.max(0,y0);y<=y1;y++) for (const xx of [bc-4,bc+4]) if(xx>=0&&xx<w){ const p=(y*w+xx)*4; img[p]=255; img[p+1]=0; img[p+2]=0; }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').putImageData(new ImageData(img,w,h),0,0);
        const tag='i${i}_'+x.toFixed(1)+'_'+z.toFixed(1)+'_'+k; window.__scan=(window.__scan||{}); window.__scan[tag]=cv.toDataURL('image/png');
        out.push({tag, local:[+(x-isl.origin.x).toFixed(1), +(fy-isl.origin.y).toFixed(1), +(z-isl.origin.z).toFixed(1)], yaw:k*45, col:bc, rows:best[bc]});
      }
    }
  }
  dome.material=old; mag.dispose(); rt.dispose(); cam.aspect=asp; cam.updateProjectionMatrix(); cam.position.copy(pos); cam.quaternion.copy(q);
  return {views, found:out.length, out:out.slice(0,40)};`);
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.newGame(); d.ui.fade(0,0); T.step(0.5); return 'ok';`),
  ...[0, 1, 2, 3, 4, 5].map(scan),
];
