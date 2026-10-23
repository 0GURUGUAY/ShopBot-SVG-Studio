import { makeAbsolute, parseSVG } from 'svg-path-parser';
import ClipperLib from 'clipper-lib';

export type Pt = { x: number; y: number };
export type Contour = { points: Pt[]; closed: boolean; label: string };
export type SvgResult = { contours: Contour[]; width: number; height: number; warnings: string[] };

const num = (v: string | null, fallback = 0) => { if (!v) return fallback; const n = Number.parseFloat(v); return Number.isFinite(n) ? n : fallback; };
function lengthMm(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const m = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(mm|cm|in|px|pt|pc)?$/i);
  if (!m) return fallback;
  const n = Number(m[1]); const unit = (m[2] || 'px').toLowerCase();
  const factor: Record<string, number> = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96, pt: 25.4 / 72, pc: 25.4 / 6 };
  return n * factor[unit];
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function dedupe(points: Pt[]): Pt[] { return points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1e-7); }
function flattenPath(d: string, tolerance: number): { points: Pt[]; closed: boolean }[] {
  const cmds = makeAbsolute(parseSVG(d));
  const paths: { points: Pt[]; closed: boolean }[] = [];
  let pts: Pt[] = []; let current: Pt = { x: 0, y: 0 }; let start: Pt = current;
  const finish = (closed: boolean) => { const p = dedupe(pts); if (p.length >= 2) paths.push({ points: p, closed }); pts = []; };
  const add = (p: Pt) => { pts.push(p); current = p; };
  for (const c of cmds) {
    if (c.code === 'M') { if (pts.length) finish(false); current = { x: c.x, y: c.y }; start = current; pts = [current]; }
    else if (c.code === 'L') add({ x: c.x, y: c.y });
    else if (c.code === 'H') add({ x: c.x, y: current.y });
    else if (c.code === 'V') add({ x: current.x, y: c.y });
    else if (c.code === 'C') {
      const p0 = current, p1 = { x: c.x1, y: c.y1 }, p2 = { x: c.x2, y: c.y2 }, p3 = { x: c.x, y: c.y };
      const n = Math.max(4, Math.min(200, Math.ceil((dist(p0, p1) + dist(p1, p2) + dist(p2, p3)) / Math.max(tolerance, 0.05))));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; add({ x: u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x, y: u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y }); }
    } else if (c.code === 'Q') {
      const p0 = current, p1 = { x: c.x1, y: c.y1 }, p2 = { x: c.x, y: c.y };
      const n = Math.max(4, Math.min(200, Math.ceil((dist(p0, p1) + dist(p1, p2)) / Math.max(tolerance, 0.05))));
      for (let i = 1; i <= n; i++) { const t=i/n,u=1-t; add({x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x,y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y}); }
    } else if (c.code === 'Z') { if (dist(current, start) > 1e-7) pts.push(start); finish(true); current = start; }
    else if (c.code === 'A' || c.code === 'S' || c.code === 'T') throw new Error(`Commande SVG ${c.code} non prise en charge pour l'instant. Convertis-la en courbes Bézier/segments dans ton logiciel vectoriel.`);
  }
  if (pts.length) finish(false);
  return paths;
}
function simplifyOpenPath(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const first = points[0], last = points[points.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  let farthestIndex = -1, farthestDistance = tolerance * tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
    const nearest = { x: first.x + projection * dx, y: first.y + projection * dy };
    const distance = dist(point, nearest);
    if (distance > farthestDistance) { farthestDistance = distance; farthestIndex = i; }
  }
  if (farthestIndex < 0) return [first, last];
  return [
    ...simplifyOpenPath(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1),
    ...simplifyOpenPath(points.slice(farthestIndex), tolerance)
  ];
}
export function simplifyPoints(points: Pt[], tolerance: number): Pt[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || points.length < 3) return points.slice();
  const closed = dist(points[0], points[points.length - 1]) <= 1e-7;
  if (!closed) return simplifyOpenPath(points, tolerance);
  const ring = points.slice(0, -1);
  if (ring.length < 3) return points.slice();
  let pivot = 1;
  for (let i = 2; i < ring.length; i++) {
    if (dist(ring[0], ring[i]) > dist(ring[0], ring[pivot])) pivot = i;
  }
  const firstArc = simplifyOpenPath(ring.slice(0, pivot + 1), tolerance);
  const secondArc = simplifyOpenPath([...ring.slice(pivot), ring[0]], tolerance);
  const simplified = [...firstArc, ...secondArc.slice(1, -1), ring[0]];
  return simplified.length >= 4 ? simplified : points.slice();
}
function transformPoint(p: Pt, el: Element): Pt {
  // Apply basic translate/scale transforms from the element and ancestors, from outermost to innermost.
  const chain: Element[] = []; let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== 'svg') { chain.unshift(node); node = node.parentElement; }
  let x=p.x,y=p.y;
  for (const e of chain) {
    const tr=e.getAttribute('transform') || '';
    const re=/(translate|scale)\s*\(([^)]*)\)/g; let m: RegExpExecArray | null;
    while ((m=re.exec(tr))) { const a=m[2].trim().split(/[ ,]+/).map(Number); if (m[1]==='translate') { x += a[0] || 0; y += a[1] || 0; } else { x *= a[0] ?? 1; y *= a[1] ?? a[0] ?? 1; } }
  }
  return {x,y};
}
export function parseSvg(text: string, tolerance = 0.2): SvgResult {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName.toLowerCase() !== 'svg') throw new Error('Le fichier ne semble pas être un SVG valide.');
  const svg = doc.documentElement;
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
  const vbW = vb.length === 4 && vb[2] > 0 ? vb[2] : 0; const vbH = vb.length === 4 && vb[3] > 0 ? vb[3] : 0;
  const width = lengthMm(svg.getAttribute('width'), vbW ? vbW * 25.4 / 96 : 100);
  const height = lengthMm(svg.getAttribute('height'), vbH ? vbH * 25.4 / 96 : 100);
  const sx = vbW ? width / vbW : 25.4 / 96; const sy = vbH ? height / vbH : 25.4 / 96;
  const contours: Contour[] = []; const warnings: string[] = [];
  const els = Array.from(svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon'));
  els.forEach((el, idx) => {
    const tag=el.tagName.toLowerCase(); let raw: {points:Pt[];closed:boolean}[]=[];
    if (tag==='path') raw=flattenPath(el.getAttribute('d') || '', tolerance / Math.max(sx, sy));
    else if (tag==='rect') {
      const x=num(el.getAttribute('x')),y=num(el.getAttribute('y')),w=num(el.getAttribute('width')),h=num(el.getAttribute('height'));
      if (w>0&&h>0) raw=[{points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}],closed:true}];
    } else if (tag==='circle'||tag==='ellipse') {
      const cx=num(el.getAttribute('cx')),cy=num(el.getAttribute('cy')),rx=tag==='circle'?num(el.getAttribute('r')):num(el.getAttribute('rx')),ry=tag==='circle'?rx:num(el.getAttribute('ry'));
      if(rx>0&&ry>0){const n=Math.max(24,Math.min(720,Math.ceil(2*Math.PI*Math.max(rx,ry)/Math.max(tolerance/Math.max(sx,sy),.05))));const points=Array.from({length:n+1},(_,i)=>({x:cx+rx*Math.cos(i*2*Math.PI/n),y:cy+ry*Math.sin(i*2*Math.PI/n)}));raw=[{points,closed:true}];}
    } else if (tag==='line') raw=[{points:[{x:num(el.getAttribute('x1')),y:num(el.getAttribute('y1'))},{x:num(el.getAttribute('x2')),y:num(el.getAttribute('y2'))}],closed:false}];
    else if (tag==='polyline'||tag==='polygon') {const nums=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);const points:Pt[]=[];for(let i=0;i+1<nums.length;i+=2)points.push({x:nums[i],y:nums[i+1]});if(tag==='polygon'&&points.length)points.push(points[0]);raw=[{points,closed:tag==='polygon'}];}
    raw.forEach((p,j)=>{
      const points=p.points.map(q=>{const t=transformPoint(q,el);return {x:(t.x-(vbW?vb[0]:0))*sx,y:(t.y-(vbH?vb[1]:0))*sy};});
      // SVG y points down; convert to Cartesian y-up. Preview and machine use same normalized frame.
      const normalized=points.map(q=>({x:q.x,y:height-q.y}));
      if(normalized.length>=2)contours.push({points:dedupe(normalized),closed:p.closed,label:`${tag} ${idx+1}${raw.length>1?`/${j+1}`:''}`});
    });
  });
  if (!contours.length) warnings.push('Aucun contour reconnu. Vérifie que le SVG contient des formes vectorielles simples.');
  if (svg.querySelector('text,image,use,foreignObject')) warnings.push('Le SVG contient du texte, une image ou des références externes : ces éléments ne sont pas convertis en parcours.');
  if (svg.querySelector('[transform]')) warnings.push('Des transformations SVG sont présentes. Vérifie attentivement les dimensions et la position dans l’aperçu.');
  return {contours,width,height,warnings};
}

function signedArea(points: Pt[]): number { let a=0;for(let i=0;i<points.length-1;i++)a+=points[i].x*points[i+1].y-points[i+1].x*points[i].y;return a/2; }
export function offsetClosedContour(contour: Contour, offsetMm: number): Pt[] {
  if (!contour.closed) throw new Error('La compensation exige un contour fermé.');
  const points=contour.points.slice(); if(points.length<4)throw new Error('Contour fermé trop court.');
  // Clipper uses integer coordinates; 1000 units/mm provides 0.001 mm resolution.
  const scale=1000; const path=points.slice(0,-1).map(p=>({X:Math.round(p.x*scale),Y:Math.round(p.y*scale)}));
  const area=signedArea(contour.points); if(Math.abs(area)<1e-6)throw new Error('Contour de surface nulle ou auto-intersecté.');
  const co=new ClipperLib.ClipperOffset(2,0.25*scale); const out: any[]=[];
  // ClipperOffset requires a consistent winding for predictable inside/outside offsets.
  // Normalize every closed contour to positive signed area before applying the requested
  // signed distance. The previous implementation multiplied the offset by the input
  // orientation, which made an outside cut shrink whenever the SVG path ran backwards.
  if (area < 0) path.reverse();
  co.AddPath(path,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
  // Positive = expand (outside cut); negative = shrink (inside cut).
  co.Execute(out, offsetMm*scale);
  if(!out.length)throw new Error('La compensation a supprimé le contour (fraise trop grande ou géométrie trop étroite).');
  if(out.length>1)throw new Error('La compensation produit plusieurs contours. V1 bloque ce cas pour éviter un parcours incomplet.');
  const result=(out[0] as Array<{X:number;Y:number}>).map(p=>({x:p.X/scale,y:p.Y/scale}));
  result.push(result[0]); return result;
}
export function getBounds(contours: Contour[]) { const ps=contours.flatMap(c=>c.points);if(!ps.length)return{x:0,y:0,width:0,height:0};const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);return{x:minX,y:minY,width:maxX-minX,height:maxY-minY}; }
