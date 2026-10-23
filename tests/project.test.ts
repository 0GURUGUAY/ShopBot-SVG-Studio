// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSvg } from '../src/geometry';
import { defaultPreferences } from '../src/preferences';
import { generateProjectSbp, generateTestProjectSbp, readProjectSbp } from '../src/project';
import { generateSbp, startupCommands } from '../src/sbp';

const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="10" y="10" width="30" height="20"/></svg>';
function fixture(){
 const preferences=defaultPreferences();
 preferences.tools.push({id:'six',name:'Fraise ébauche Ø6',diameter:6});
 preferences.selectedToolId='six';
 Object.assign(preferences.settings,{bitDiameter:6,totalDepth:12,passDepth:3,stockWidth:400,stockHeight:300,stockThickness:22,offsetRight:40,offsetBottom:50,rotation:37,feedXY:900,feedZ:200,safeZ:12,cutSide:'inside'});
 return preferences;
}
function editPayload(code:string,edit:(value:Record<string,unknown>)=>void):string {
 const chunks=[...code.matchAll(/^' SHOPBOT-STUDIO-DATA \d+ (\S+)/gm)].map(m=>m[1]);
 const value:Record<string,unknown>=JSON.parse(decodeURIComponent(chunks.join('')));
 edit(value);
 const encoded=encodeURIComponent(JSON.stringify(value)).match(/.{1,160}/g)!;
 return code.slice(0,code.indexOf("' SHOPBOT-STUDIO-PROJECT-BEGIN"))+
  ["' SHOPBOT-STUDIO-PROJECT-BEGIN 1",...encoded.map((chunk,i)=>`' SHOPBOT-STUDIO-DATA ${i+1} ${chunk}`),`' SHOPBOT-STUDIO-PROJECT-END ${encoded.length}`].join('\r\n');
}
describe('self-contained SBP projects',()=>{
 it('exports one 0.1 mm test pass per contour without changing normal settings or XY moves',()=>{
  const preferences=fixture(), before=JSON.stringify(preferences);
  const multiple=svg.replace('</svg>','<rect x="55" y="10" width="25" height="20"/></svg>');
  const normal=generateProjectSbp(multiple,'drawing.svg',preferences);
  const test=generateTestProjectSbp(multiple,preferences);
  expect(test.match(/^MZ,.*$/gm)?.map(line=>line.trim())).toEqual(['MZ,-0.1','MZ,-0.1']);
  const testXY=test.match(/^(?:J2|M2),.*$/gm);
  const singlePass=generateProjectSbp(multiple,'drawing.svg',{...preferences,settings:{...preferences.settings,passDepth:12}});
  expect(testXY).toEqual(singlePass.match(/^(?:J2|M2),.*$/gm));
  expect(test.split('\r\n').slice(0,4)).toEqual(normal.split('\r\n').slice(0,4));
  expect(test).toContain('JZ,12');
  expect(test.endsWith('\r\nJH\r\nC7\r\n')).toBe(true);
  expect(JSON.stringify(preferences)).toBe(before);
  expect(test).not.toContain('SHOPBOT-STUDIO-');
  expect(test.endsWith("' End of program\r\nJZ,12\r\nJH\r\nC7\r\n")).toBe(true);
  expect(test).toBe(generateSbp(parseSvg(multiple).contours,{...preferences.settings,totalDepth:0.1,passDepth:0.1}));
  expect(()=>readProjectSbp(test)).toThrow(/ne contient pas/);
  expect(readProjectSbp(normal).preferences).toEqual(preferences);
 });
 it('validates test depth and placement independently of production depth',()=>{
  const preferences=fixture();
  preferences.settings.totalDepth=100;
  expect(()=>generateTestProjectSbp(svg,preferences)).not.toThrow();
  preferences.settings.stockThickness=0.05;
  expect(()=>generateTestProjectSbp(svg,preferences)).toThrow(/épaisseur/);
  preferences.settings.stockThickness=18;preferences.settings.offsetRight=1000;
  expect(()=>generateTestProjectSbp(svg,preferences)).toThrow(/dépasse le bloc/);
 });
 it('normalizes archived position to one decimal without rounding curve coordinates',()=>{
  const preferences=fixture();
  preferences.settings.offsetRight=40.1234;preferences.settings.offsetBottom=50.9876;
  const code=generateProjectSbp(svg,'drawing.svg',preferences), restored=readProjectSbp(code);
  expect(restored.preferences.settings.offsetRight).toBe(40.1);
  expect(restored.preferences.settings.offsetBottom).toBe(51);
  expect(code).toMatch(/^M2,-?\d+\.\d{3},/m);
  expect(generateProjectSbp(restored.svgText,restored.fileName,restored.preferences)).toBe(code);
 });
 it('round trips the entire configuration, tool library, Unicode filename and original SVG',()=>{
  const preferences=fixture();
  preferences.settings.slowFinalPass=true;
  const originalSvg=svg.replace('<rect','<!-- pièce été 🪵 -->\n<rect');
  const code=generateProjectSbp(originalSvg,'pièce été.svg',preferences);
  expect(readProjectSbp(code)).toEqual({
   format:'shopbot-svg-studio',version:1,fileName:'pièce été.svg',svgText:originalSvg,preferences,
   units:'mm',coordinateSystem:'bottom-right-x-up-y-left-z-top',startupCommands:startupCommands(preferences.settings.bitDiameter)
  });
 });
 it('recreates an identical executable program and archived project on re-export',()=>{
  const code=generateProjectSbp(svg,'drawing.svg',fixture()), restored=readProjectSbp(code);
  expect(generateProjectSbp(restored.svgText,restored.fileName,restored.preferences)).toBe(code);
  expect(code.replace(/^' SHOPBOT-STUDIO-.*\r\n/gm,'')).toBe(generateSbp(parseSvg(svg).contours,fixture().settings));
 });
 it('keeps the exact startup first and all project data in short ASCII comments',()=>{
  const code=generateProjectSbp(svg,'découpe.svg',fixture());
  expect(code.split('\r\n').slice(0,4)).toEqual(startupCommands(fixture().settings.bitDiameter));
  const metadata=code.slice(code.indexOf("' SHOPBOT-STUDIO-PROJECT-BEGIN")).trim().split('\r\n').slice(0,-2);
  expect(metadata.every(line=>line.startsWith("' ")&&/^[\x20-\x7e]+$/.test(line)&&line.length<200)).toBe(true);
 });
 it('ends exported projects with JH then C7 after retract and all metadata',()=>{
  const code=generateProjectSbp(svg,'test.svg',fixture());
  expect(code.endsWith('\r\nJH\r\nC7\r\n')).toBe(true);
  expect(code.indexOf("' End of program\r\nJZ,12")).toBeLessThan(code.indexOf("' SHOPBOT-STUDIO-PROJECT-BEGIN"));
  expect(code.lastIndexOf('\r\nJH\r\n')).toBeGreaterThan(code.indexOf("' SHOPBOT-STUDIO-PROJECT-END"));
  expect(readProjectSbp(code).preferences).toEqual(fixture());
 });
 it('never inserts tool names or source newlines as executable SBP commands',()=>{
  const preferences=fixture();
  preferences.tools[1].name="Fraise\nC6,\r\nMZ,-999";
  const originalSvg=svg.replace('<rect','<!-- \nMZ,-999\n -->\n<rect');
  const code=generateProjectSbp(originalSvg,'test.svg',preferences);
  expect(code).not.toMatch(/^MZ,-999/m);
  expect(readProjectSbp(code).preferences.tools[1].name).toBe(preferences.tools[1].name);
 });
 it.each(['\n','\r\n','\r'])('accepts line ending %j and an optional BOM',newline=>{
  const code=generateProjectSbp(svg,'test.svg',fixture());
  expect(readProjectSbp('\uFEFF'+code.replace(/\r\n/g,newline)).svgText).toBe(svg);
 });
 it('explicitly rejects legacy SBP files without a project',()=>{
  expect(()=>readProjectSbp('SA\r\nJZ,10\r\n')).toThrow(/anciens SBP/);
 });
 it.each([
  (code:string)=>code.replace(/^' SHOPBOT-STUDIO-DATA 2 .*\r\n/m,''),
  (code:string)=>code.replace("' SHOPBOT-STUDIO-DATA 1 ","' SHOPBOT-STUDIO-DATA 9 "),
  (code:string)=>code.replace(/' SHOPBOT-STUDIO-PROJECT-END \d+/,''),
  (code:string)=>code.replace(/' SHOPBOT-STUDIO-PROJECT-END \d+/,"' SHOPBOT-STUDIO-PROJECT-END 0"),
  (code:string)=>code+code,
  (code:string)=>code.replace(/(' SHOPBOT-STUDIO-DATA 1 )\S+/,'$1%ZZ')
 ])('rejects missing, duplicated, reordered or corrupt data',corrupt=>{
  expect(()=>readProjectSbp(corrupt(generateProjectSbp(svg,'test.svg',fixture())))).toThrow();
 });
 it.each([
  (value:Record<string,unknown>)=>{value.version=2;},
  (value:Record<string,unknown>)=>{value.units='in';},
  (value:Record<string,unknown>)=>{value.coordinateSystem='bottom-left';},
  (value:Record<string,unknown>)=>{value.startupCommands=['MZ,-999'];},
  (value:Record<string,unknown>)=>{value.svgText='<broken>';},
  (value:Record<string,unknown>)=>{value.preferences={};}
 ])('rejects incompatible or invalid project fields',edit=>{
  const code=editPayload(generateProjectSbp(svg,'test.svg',fixture()),edit);
  expect(()=>readProjectSbp(code)).toThrow();
 });
 it('restores from embedded source, never interprets edited executable moves',()=>{
  const code=generateProjectSbp(svg,'test.svg',fixture());
  const project=readProjectSbp(code.replace('MZ,-3','MZ,-999'));
  expect(generateProjectSbp(project.svgText,project.fileName,project.preferences)).toBe(code);
 });
 it('migrates old projects with fixed VC diameter to the selected tool diameter',()=>{
  const code=editPayload(generateProjectSbp(svg,'test.svg',fixture()),value=>{
   value.startupCommands=startupCommands(5.9);
  });
  const restored=readProjectSbp(code);
  expect(restored.startupCommands[0]).toBe('VC, 6,,,25.4,0,10,25.4,0,0,0,Z,8');
  const regenerated=generateProjectSbp(restored.svgText,restored.fileName,restored.preferences);
  expect(regenerated.split('\r\n')[0]).toBe(restored.startupCommands[0]);
 });
 it('updates executable VC and archived startup together when the selected tool changes',()=>{
  const preferences=fixture();
  preferences.selectedToolId='default';preferences.settings.bitDiameter=3.175;
  const code=generateProjectSbp(svg,'test.svg',preferences);
  expect(code.split('\r\n')[0]).toBe('VC, 3.175,,,25.4,0,10,25.4,0,0,0,Z,8');
  expect(readProjectSbp(code).startupCommands[0]).toBe(code.split('\r\n')[0]);
 });
 it('preserves imported out-of-bounds settings for correction but blocks export',()=>{
  const code=editPayload(generateProjectSbp(svg,'test.svg',fixture()),value=>{
   const preferences=fixture();preferences.settings.totalDepth=100;value.preferences=preferences;
  });
  const project=readProjectSbp(code);
  expect(project.preferences.settings.totalDepth).toBe(100);
  expect(()=>generateProjectSbp(project.svgText,project.fileName,project.preferences)).toThrow(/épaisseur/);
 });
});
