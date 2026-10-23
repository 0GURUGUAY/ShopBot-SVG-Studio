// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { offsetClosedContour, parseSvg, type Contour } from '../src/geometry';
import { estimateCutTimeMinutes, generateSbp, getToolpaths, validate, type Settings } from '../src/sbp';
const settings:Settings={bitDiameter:3.175,totalDepth:6,passDepth:2,safeZ:10,feedXY:1200,feedZ:300,slowFinalPass:false,cutSide:'centerline',machineWidth:500,machineHeight:500,stockWidth:200,stockHeight:100,stockThickness:18,offsetRight:10,offsetBottom:10,rotation:0};
const rect=`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="10" y="10" width="30" height="20"/></svg>`;
describe('SVG → SBP baseline',()=>{
 it('reads SVG physical dimensions and closed rectangles',()=>{const r=parseSvg(rect);expect(r.width).toBeCloseTo(100);expect(r.height).toBeCloseTo(50);expect(r.contours).toHaveLength(1);expect(r.contours[0].closed).toBe(true);});
 it('parses relative Bézier path commands and closes the contour',()=>{
  const r=parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path d="M5 5 c0 10 10 10 10 0 z"/></svg>`);
  expect(r.contours).toHaveLength(1);
  expect(r.contours[0].closed).toBe(true);
  expect(r.contours[0].points[0]).toEqual(r.contours[0].points[r.contours[0].points.length-1]);
 });
 it('rejects open contours for cutting',()=>{const r=parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm"><line x1="1" y1="1" x2="20" y2="20"/></svg>`);expect(validate(r.contours,settings).errors.some(e=>e.includes('ouvert'))).toBe(true);});
 it('generates metric absolute moves and successive depth passes',()=>{const r=parseSvg(rect);const code=generateSbp(r.contours,settings);expect(code).toContain('SA');expect(code).toContain('MZ,-2');expect(code).toContain('MZ,-4');expect(code).toContain('MZ,-6');expect(code).toContain('JZ,10');});
 it('adds a cut-height comment immediately before every depth change',()=>{
  const code=generateSbp(parseSvg(rect).contours,settings);
  const depthLines=code.split('\r\n').filter(line=>line.startsWith('MZ,'));
  const heightComments=code.split('\r\n').filter(line=>line.startsWith("' ----------------- Hauteur de coupe :"));
  expect(heightComments).toEqual(depthLines.map(line=>`' ----------------- Hauteur de coupe : ${line.slice(3)} mm`));
 });
 it('splits the final depth slice and halves both feed rates only for its last half',()=>{
  const code=generateSbp(parseSvg(rect).contours,{...settings,slowFinalPass:true});
  expect(code.match(/^MZ,/gm)).toHaveLength(4);
  expect(code).toContain('MZ,-5');
  expect(code).toContain('MZ,-6');
  expect(code).toContain('MS,10,10,2.5');
  expect(code).toContain('MS,20,20,5');
  expect(code.indexOf('MS,10,10,2.5')).toBeLessThan(code.indexOf('MZ,-6'));
  expect(code.indexOf('MZ,-6')).toBeLessThan(code.lastIndexOf('MS,20,20,5'));
 });
 it('splits a partial final depth slice evenly',()=>{
  const code=generateSbp(parseSvg(rect).contours,{...settings,totalDepth:5.5,slowFinalPass:true});
  expect(code).toContain('MZ,-4.75');
  expect(code).toContain('MZ,-5.5');
 });
 it('blocks invalid settings',()=>{expect(()=>generateSbp(parseSvg(rect).contours,{...settings,passDepth:0})).toThrow(/profondeur par passe/);});
 it('retracts to safe Z before finishing with exactly JH then C7',()=>{
  const code=generateSbp(parseSvg(rect).contours,settings);
  expect(code.endsWith("' End of program\r\nJZ,10\r\nJH\r\nC7\r\n")).toBe(true);
  expect(code.match(/^C7\r?$/gm)).toHaveLength(1);
 });
 it('rejects executable lines in project comments',()=>{
  expect(()=>generateSbp(parseSvg(rect).contours,settings,['MZ,-999'])).toThrow(/Commentaire/);
  expect(()=>generateSbp(parseSvg(rect).contours,settings,["' comment\r\nMZ,-999"])).toThrow(/Commentaire/);
 });
 it('starts with the exact requested routine before any generated motion',()=>{
  const code=generateSbp(parseSvg(rect).contours,settings);
  expect(code.split('\r\n').slice(0,4)).toEqual(['VC, 3.175,,,25.4,0,10,25.4,0,0,0,Z,8','JH,',"C6, 'mise en route du moteur",'PAUSE']);
  expect(code.indexOf('\r\nPAUSE\r\n')).toBeLessThan(code.indexOf('\r\nSA\r\n'));
  expect(code.match(/^C6,/gm)).toHaveLength(1);
  expect(code).not.toContain('Spindle is NOT started automatically');
 });
 it.each([3.175,4,6,8,5.9])('uses the selected tool diameter %s in VC without changing other parameters',bitDiameter=>{
  const code=generateSbp(parseSvg(rect).contours,{...settings,bitDiameter});
  expect(code.split('\r\n')[0]).toBe(`VC, ${bitDiameter},,,25.4,0,10,25.4,0,0,0,Z,8`);
 });
 it('simplifies smooth curves to reduce generated movement lines',()=>{
  const circle=`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>`;
  const contour=parseSvg(circle).contours[0];
  const code=generateSbp([contour],{...settings,totalDepth:2,passDepth:2});
  expect((code.match(/^M2,/gm)||[]).length).toBeLessThan(contour.points.length/3);
 });
});


describe('estimated cutting time',()=>{
 const contours=()=>parseSvg(rect).contours;
 it('sums XY cutting and safe-Z plunges over all three passes',()=>{
  expect(estimateCutTimeMinutes(contours(),settings)).toBeCloseTo(3*100/1200+(12+14+16)/300);
 });
 it('counts a partial final pass at its actual depth',()=>{
  expect(estimateCutTimeMinutes(contours(),{...settings,totalDepth:5.5})).toBeCloseTo(3*100/1200+(12+14+15.5)/300);
 });
 it('includes both split passes and halves XY and Z feeds on the last one',()=>{
  expect(estimateCutTimeMinutes(contours(),{...settings,slowFinalPass:true})).toBeCloseTo(5*100/1200+(12+14+15+2*16)/300);
 });
 it('handles a single split pass',()=>{
  expect(estimateCutTimeMinutes(contours(),{...settings,totalDepth:1,slowFinalPass:true})).toBeCloseTo(3*100/1200+(10.5+2*11)/300);
 });
 it('adds all contours and responds to feed changes',()=>{
  const single=estimateCutTimeMinutes(contours(),settings);
  expect(estimateCutTimeMinutes([...contours(),...contours()],settings)).toBeCloseTo(2*single);
  expect(estimateCutTimeMinutes(contours(),{...settings,feedXY:2400,feedZ:600})).toBeCloseTo(single/2);
 });
 it('uses compensated toolpath lengths',()=>{
  const s={...settings,cutSide:'outside' as const,totalDepth:2};
  const path=getToolpaths(contours(),s)[0].points;
  const length=path.reduce((sum,p,i)=>i===0?sum:sum+Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y),0);
  expect(estimateCutTimeMinutes(contours(),s)).toBeCloseTo(length/1200+12/300);
  expect(estimateCutTimeMinutes(contours(),s)).toBeGreaterThan(estimateCutTimeMinutes(contours(),{...s,cutSide:'centerline'}));
 });
 it.each([{passDepth:0},{feedXY:0},{feedZ:NaN}])('rejects invalid settings instead of estimating them: %j',invalid=>{
  expect(()=>estimateCutTimeMinutes(contours(),{...settings,...invalid})).toThrow();
 });
});

describe('compensation de contour',()=>{
 const ccw:Contour={label:'rectangle CCW',closed:true,points:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50},{x:0,y:0}]};
 const cw:Contour={label:'rectangle CW',closed:true,points:[...ccw.points].reverse()};
 const bounds=(pts:{x:number;y:number}[])=>({minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))});
 it('expands an exterior contour by 3 mm regardless of path direction',()=>{
  for(const contour of [ccw,cw]){const b=bounds(offsetClosedContour(contour,3));expect(b.minX).toBeCloseTo(-3,2);expect(b.maxX).toBeCloseTo(103,2);expect(b.minY).toBeCloseTo(-3,2);expect(b.maxY).toBeCloseTo(53,2);}
 });
 it('shrinks an interior contour by 3 mm regardless of path direction',()=>{
  for(const contour of [ccw,cw]){const b=bounds(offsetClosedContour(contour,-3));expect(b.minX).toBeCloseTo(3,2);expect(b.maxX).toBeCloseTo(97,2);expect(b.minY).toBeCloseTo(3,2);expect(b.maxY).toBeCloseTo(47,2);}
 });
});
