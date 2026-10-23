import { describe, expect, it } from 'vitest';
import { getBounds, type Contour } from '../src/geometry';
import { initialSettings } from '../src/preferences';
import { generateSbp, getToolpaths, placeContours, validate } from '../src/sbp';

const rectangle:Contour={label:'rectangle',closed:true,points:[{x:5,y:7},{x:35,y:7},{x:35,y:27},{x:5,y:27},{x:5,y:7}]};
const settings={...initialSettings,cutSide:'centerline' as const,offsetRight:10,offsetBottom:15};

describe('placement du dessin et repère machine',()=>{
 it('anchors the nominal drawing from the right and bottom without distortion',()=>{
  const placed=placeContours([rectangle],settings);
  expect(getBounds(placed)).toEqual({x:-40,y:15,width:30,height:20});
  expect(placed[0].points[0]).toEqual({x:-40,y:15});
  expect(rectangle.points[0]).toEqual({x:5,y:7});
 });
 it('exports X up and Y left from the bottom-right stock corner',()=>{
  const code=generateSbp([rectangle],settings);
  expect(code).toContain('J2,15,40\r\n');
  expect(code).toContain('M2,15,10\r\nM2,35,10\r\nM2,35,40\r\nM2,15,40');
  expect(code).toContain("' Stock X,Y,Z: 200,300,18");
 });
 it.each([90,-90,180,360])('rotates the whole drawing by %s degrees and keeps it closed',rotation=>{
  const placed=placeContours([rectangle],{...settings,rotation});
  const b=getBounds(placed), swapped=Math.abs(rotation)===90;
  expect(b.width).toBeCloseTo(swapped?20:30);
  expect(b.height).toBeCloseTo(swapped?30:20);
  expect(b.x+b.width).toBeCloseTo(-10);
  expect(b.y).toBeCloseTo(15);
  expect(placed[0].points[0]).toEqual(placed[0].points.at(-1));
 });
 it('rotates asymmetrical geometry counterclockwise, without mirroring',()=>{
  const points=placeContours([rectangle],{...settings,rotation:90})[0].points;
  expect(points[0].x).toBeCloseTo(-10);expect(points[0].y).toBeCloseTo(15);
  expect(points[1].x).toBeCloseTo(-10);expect(points[1].y).toBeCloseTo(45);
 });
 it('preserves spacing between multiple contours during rotation',()=>{
  const second={...rectangle,points:rectangle.points.map(p=>({x:p.x+50,y:p.y}))};
  const placed=placeContours([rectangle,second],{...settings,rotation:90});
  expect(placed[1].points[0].y-placed[0].points[0].y).toBeCloseTo(50);
  expect(placed[1].points[0].x-placed[0].points[0].x).toBeCloseTo(0);
 });
 it('does not renormalize the compensated path, so changing tools preserves placement',()=>{
  const b=getBounds(getToolpaths([rectangle],{...settings,cutSide:'outside',bitDiameter:6}));
  expect(b.x).toBeCloseTo(-43);expect(b.y).toBeCloseTo(12);
  expect(b.width).toBeCloseTo(36);expect(b.height).toBeCloseTo(26);
 });
 it('accepts exact stock clearance including the entire cutter radius',()=>{
  expect(validate([rectangle],{...settings,cutSide:'outside',bitDiameter:6,offsetRight:6,offsetBottom:6}).errors).toEqual([]);
  expect(validate([rectangle],{...settings,cutSide:'outside',bitDiameter:6,offsetRight:5.9}).errors.join()).toMatch(/dépasse le bloc/);
 });
 it.each([
  {offsetRight:0},{offsetBottom:0},{offsetRight:280},{offsetBottom:190},{stockWidth:20},{stockHeight:10}
 ])('blocks tool travel beyond every stock edge: %j',change=>{
  expect(()=>generateSbp([rectangle],{...settings,...change})).toThrow(/dépasse le bloc/);
 });
 it('checks the actual machine axes rather than only the drawing span',()=>{
  expect(validate([rectangle],{...settings,stockHeight:1201}).errors.join()).toMatch(/course utile/);
  expect(validate([rectangle],{...settings,stockWidth:2401}).errors.join()).toMatch(/course utile/);
 });
 it('blocks depth beyond stock thickness but permits cutting to its bottom',()=>{
  expect(validate([rectangle],{...settings,totalDepth:18}).errors).toEqual([]);
  expect(()=>generateSbp([rectangle],{...settings,totalDepth:18.1})).toThrow(/épaisseur/);
 });
 it.each([{rotation:NaN},{offsetRight:Infinity},{stockThickness:0},{offsetBottom:-1}])('rejects invalid placement: %j',change=>{
  expect(()=>generateSbp([rectangle],{...settings,...change})).toThrow();
 });
 it('reports compensation failure in validation before export',()=>{
  expect(validate([rectangle],{...settings,cutSide:'inside',bitDiameter:100}).errors.join()).toMatch(/compensation/);
 });
});
