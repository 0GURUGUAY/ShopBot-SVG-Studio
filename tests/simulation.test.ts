// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSvg } from '../src/geometry';
import { generateSbp, type Settings } from '../src/sbp';
import { getSimulationFrame, parseSbpSimulation } from '../src/simulation';

const settings:Settings={
 bitDiameter:3.175,totalDepth:2,passDepth:2,safeZ:10,feedXY:1200,feedZ:300,
 slowFinalPass:false,cutSide:'centerline',machineWidth:500,machineHeight:500,
 stockWidth:200,stockHeight:100,stockThickness:18,offsetRight:10,offsetBottom:10,rotation:0
};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="40mm" viewBox="0 0 50 40"><rect x="10" y="10" width="20" height="15"/></svg>';

describe('simulation SBP',()=>{
 it('reads generated XY and Z movements and stock metadata',()=>{
  const program=generateSbp(parseSvg(svg).contours,settings);
  const simulation=parseSbpSimulation(program);
  expect(simulation.moves.length).toBeGreaterThan(4);
  expect(simulation.stockWidth).toBe(200);
  expect(simulation.stockHeight).toBe(100);
  expect(simulation.stockThickness).toBe(18);
  expect(simulation.bitDiameter).toBe(settings.bitDiameter);
  expect(simulation.moves[0].from).toEqual({x:0,y:0});
  expect(getSimulationFrame(simulation,0)).toMatchObject({position:{x:0,y:0},z:0,moveIndex:-1});
  expect(simulation.moves.some(move=>move.cut&&move.from.x!==move.to.x)).toBe(true);
  expect(simulation.moves.some(move=>move.cut&&move.fromZ!==move.toZ)).toBe(true);
  const travel=parseSbpSimulation('J2,0,0\nJ2,5,5\n');
  expect(travel.moves.some(move=>!move.cut&&move.from.x!==move.to.x)).toBe(true);
 });

 it('interpolates the cutter position and depth at a requested time',()=>{
  const simulation=parseSbpSimulation('MS,20,20,5\nJ2,10,20\nMZ,-2\nM2,30,20\n');
  const plunge=simulation.moves[1];
  const frame=getSimulationFrame(simulation,simulation.moves[0].duration+plunge.duration/2);
  expect(frame.position).toEqual({x:10,y:20});
  expect(frame.z).toBeCloseTo(-1);
  const cut=getSimulationFrame(simulation,simulation.moves[0].duration+plunge.duration+simulation.moves[2].duration/2);
  expect(cut.position).toEqual({x:20,y:20});
  expect(cut.z).toBe(-2);
 });

 it('shows the first rapid travel from the XY origin',()=>{
  const simulation=parseSbpSimulation('J2,15,25\nMZ,-1\nM2,20,25\n');
  expect(simulation.moves[0]).toMatchObject({from:{x:0,y:0},to:{x:15,y:25},cut:false});
  expect(getSimulationFrame(simulation,simulation.moves[0].duration).position).toEqual({x:15,y:25});
 });

 it('rejects unknown commands instead of showing an incomplete simulation',()=>{
  expect(()=>parseSbpSimulation('MX,10')).toThrow(/non prise en charge/);
  expect(()=>parseSbpSimulation('J2,1')).toThrow(/Coordonnées.*invalides/);
  expect(()=>parseSbpSimulation("' No movement\n")).toThrow(/Aucun déplacement/);
 });
});
