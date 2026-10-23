import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getBounds, parseSvg, type SvgResult, type Contour } from './geometry';
import { estimateCutTimeMinutes, getToolpaths, placeContours, roundPosition, validate, type Settings } from './sbp';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { generateProjectSbp, generateTestProjectSbp, readProjectSbp } from './project';
import { getSimulationFrame, parseSbpSimulation } from './simulation';
import './style.css';

const demo = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"><rect x="5" y="5" width="55" height="35"/><circle cx="80" cy="25" r="12"/></svg>`;
function download(name:string, content:string, type='text/plain') { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url); }
function formatCutTime(minutes:number):string {
 const seconds=Math.ceil(minutes*60);
 const hours=Math.floor(seconds/3600), mins=Math.floor(seconds%3600/60), secs=seconds%60;
 return `${hours?`${hours} h `:''}${mins} min ${secs} s`;
}
type ScenePoint={x:number;y:number};
function project3DPoint(x:number,y:number,z:number,scale:number,centerX:number,topY:number):ScenePoint{
 return{x:centerX+(x-y)*scale*.7,y:topY+(x+y)*scale*.36-z*scale*.65};
}
function App(){
 const [loaded]=useState(loadPreferences);
 const [preferences,setPreferences]=useState<Preferences>(loaded.preferences);
 const settings=preferences.settings;
 const selectedTool=preferences.tools.find(tool=>tool.id===preferences.selectedToolId)!;
 const [toolName,setToolName]=useState(selectedTool.name);
 const [toolDiameter,setToolDiameter]=useState(selectedTool.diameter);
 const [storageError,setStorageError]=useState('');
 const [svgText,setSvgText]=useState(demo);const [fileName,setFileName]=useState('exemple.svg');const [parsed,setParsed]=useState<SvgResult>(()=>parseSvg(demo));const [error,setError]=useState('');const [notice,setNotice]=useState('Exemple chargé. Importez votre SVG pour commencer.');const [showCode,setShowCode]=useState(false);
 const [simulationProgramOverride,setSimulationProgramOverride]=useState<string|null>(null);
 useLayoutEffect(()=>{
  try{savePreferences(preferences);setStorageError('');}
  catch(e){setStorageError(`Enregistrement impossible : ${e instanceof Error?e.message:String(e)} Les modifications ne seront pas conservées après rechargement.`);}
 },[preferences]);
 const validation=useMemo(()=>validate(parsed.contours,settings),[parsed,settings]);
 const estimatedMinutes=useMemo(()=>validation.errors.length?null:estimateCutTimeMinutes(parsed.contours,settings),[parsed,settings,validation]);
 const code=useMemo(()=>{try{return generateProjectSbp(svgText,fileName,preferences)}catch(e){return `; Génération bloquée : ${e instanceof Error?e.message:String(e)}`}},[svgText,fileName,preferences]);
 const simulationSource=simulationProgramOverride??code;
 const simulation=useMemo(()=>{
  try{return{program:parseSbpSimulation(simulationSource),error:''};}
  catch(e){return{program:null,error:e instanceof Error?e.message:String(e)};}
 },[simulationSource]);
 const [simulationTime,setSimulationTime]=useState(0);
 const [simulationPlaying,setSimulationPlaying]=useState(false);
 const [simulationView,setSimulationView]=useState<'3d'|'2d'>('3d');
 const simulationDuration=simulation.program?.duration??0;
 const simulationFrame=simulation.program?getSimulationFrame(simulation.program,simulationTime):null;
 useEffect(()=>{setSimulationTime(0);setSimulationPlaying(false);},[simulationSource]);
 useEffect(()=>{
  if(!simulationPlaying||simulationDuration<=0)return;
  let animationFrame=0;
  let previousTime:number|undefined;
  let elapsed=simulationTime;
  const tick=(now:number)=>{
   if(previousTime!==undefined)elapsed=Math.min(simulationDuration,elapsed+(now-previousTime)/1000*10);
   previousTime=now;
   setSimulationTime(elapsed);
   if(elapsed>=simulationDuration){setSimulationPlaying(false);return;}
   animationFrame=requestAnimationFrame(tick);
  };
  animationFrame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(animationFrame);
 },[simulationPlaying,simulationDuration]);
 const testProgram=useMemo(()=>{
  try{return {code:generateTestProjectSbp(svgText,preferences),error:''};}
  catch(e){return {code:'',error:e instanceof Error?e.message:String(e)};}
 },[svgText,preferences]);
 const bounds=getBounds(parsed.contours);
 const placed=useMemo(()=>placeContours(parsed.contours,settings),[parsed,settings]);
 const toolpaths=useMemo(()=>validation.errors.length?[]:getToolpaths(parsed.contours,settings),[parsed,settings,validation]);
 const previewWidth=Number.isFinite(settings.stockWidth)&&settings.stockWidth>0?settings.stockWidth:300;
 const previewHeight=Number.isFinite(settings.stockHeight)&&settings.stockHeight>0?settings.stockHeight:200;
 const simulationStockWidth=simulation.program?.stockWidth??previewWidth;
 const simulationStockHeight=simulation.program?.stockHeight??previewHeight;
 const simulationMargin=Math.max(simulationStockWidth,simulationStockHeight)*0.12;
 const simulationStockThickness=simulation.program?.stockThickness??settings.stockThickness;
 const sceneScale=Math.min(600/Math.max(simulationStockWidth+simulationStockHeight,1),270/Math.max((simulationStockWidth+simulationStockHeight)*.36+simulationStockThickness*.65,1));
 const sceneTop=44, sceneCenter=400;
 const sceneA=project3DPoint(0,0,0,sceneScale,sceneCenter,sceneTop);
 const sceneB=project3DPoint(simulationStockHeight,0,0,sceneScale,sceneCenter,sceneTop);
 const sceneC=project3DPoint(simulationStockHeight,simulationStockWidth,0,sceneScale,sceneCenter,sceneTop);
 const sceneD=project3DPoint(0,simulationStockWidth,0,sceneScale,sceneCenter,sceneTop);
 const sceneBBase=project3DPoint(simulationStockHeight,0,-simulationStockThickness,sceneScale,sceneCenter,sceneTop);
 const sceneCBase=project3DPoint(simulationStockHeight,simulationStockWidth,-simulationStockThickness,sceneScale,sceneCenter,sceneTop);
 const sceneDBase=project3DPoint(0,simulationStockWidth,-simulationStockThickness,sceneScale,sceneCenter,sceneTop);
 const cutPassDepths=simulation.program?[...new Set(simulation.program.moves.filter(move=>move.cut&&Math.hypot(move.to.x-move.from.x,move.to.y-move.from.y)>0).map(move=>Math.max(0,-Math.min(move.fromZ,move.toZ))))].sort((a,b)=>a-b):[];
 const passColors=['#f3c969','#f49a65','#ec735f','#ce5365','#a84e82','#8064a8'];
 const passColor=(depth:number)=>passColors[Math.max(0,cutPassDepths.findIndex(value=>Math.abs(value-depth)<1e-6))%passColors.length];
 const previewBounds=getBounds(placed);
 const viewMinX=Math.min(-previewWidth,Number.isFinite(previewBounds.x)?previewBounds.x:0);
 const viewMaxX=Math.max(0,Number.isFinite(previewBounds.x+previewBounds.width)?previewBounds.x+previewBounds.width:0);
 const viewMinY=Math.min(0,Number.isFinite(previewBounds.y)?previewBounds.y:0);
 const viewMaxY=Math.max(previewHeight,Number.isFinite(previewBounds.y+previewBounds.height)?previewBounds.y+previewBounds.height:0);
 const margin=Math.max(viewMaxX-viewMinX,viewMaxY-viewMinY)*0.12;
 function update<K extends keyof Settings>(key:K,value:Settings[K]){
  const rounded=(key==='offsetRight'||key==='offsetBottom')&&typeof value==='number'?roundPosition(value):value;
  setPreferences(p=>({...p,settings:{...p.settings,[key]:rounded}}));
 }
 function selectTool(id:string){
  const tool=preferences.tools.find(t=>t.id===id);
  if(!tool)return;
  setPreferences(p=>({...p,selectedToolId:id,settings:{...p.settings,bitDiameter:tool.diameter}}));
  setToolName(tool.name);setToolDiameter(tool.diameter);
 }
 function saveTool(add:boolean){
  if(!toolName.trim()||!Number.isFinite(toolDiameter)||toolDiameter<=0){setError('Indiquez un nom et un diamètre de fraise strictement positif.');return;}
  const tool={id:add?crypto.randomUUID():selectedTool.id,name:toolName.trim(),diameter:toolDiameter};
  setPreferences(p=>({...p,tools:add?[...p.tools,tool]:p.tools.map(t=>t.id===tool.id?tool:t),selectedToolId:tool.id,settings:{...p.settings,bitDiameter:tool.diameter}}));
  setToolName(tool.name);setError('');setNotice(add?'Fraise ajoutée et sélectionnée.':'Fraise mise à jour.');
 }
 function deleteTool(){
  if(preferences.tools.length===1){setError('Conservez au moins une fraise dans la liste.');return;}
  const tools=preferences.tools.filter(t=>t.id!==selectedTool.id), next=tools[0];
  setPreferences(p=>({...p,tools,selectedToolId:next.id,settings:{...p.settings,bitDiameter:next.diameter}}));
  setToolName(next.name);setToolDiameter(next.diameter);setError('');setNotice('Fraise supprimée.');
 }
 function centerDrawing(){
  const b=getBounds(placeContours(parsed.contours,{...settings,offsetRight:0,offsetBottom:0}));
  if(b.width>settings.stockWidth||b.height>settings.stockHeight){setError('Le dessin est plus grand que le bloc. Agrandissez le bloc ou modifiez la rotation.');return;}
  setPreferences(p=>({...p,settings:{...p.settings,offsetRight:roundPosition((p.settings.stockWidth-b.width)/2),offsetBottom:roundPosition((p.settings.stockHeight-b.height)/2)}}));
  setError('');setNotice('Dessin centré sur le bloc.');
 }
 async function loadFile(file?:File){if(!file)return;try{
  const txt=await file.text();
  if(/\.sbp$/i.test(file.name)){
   try{
    const project=readProjectSbp(txt), result=parseSvg(project.svgText);
    const tool=project.preferences.tools.find(t=>t.id===project.preferences.selectedToolId)!;
    setSvgText(project.svgText);setParsed(result);setFileName(project.fileName);setPreferences(project.preferences);
    setToolName(tool.name);setToolDiameter(tool.diameter);setSimulationProgramOverride(txt);
    setNotice(`${file.name} restauré et chargé dans la simulation : dessin, liste de fraises et réglages du projet importés. Le SBP est lu comme des données, jamais exécuté.`);
   }catch{
    parseSbpSimulation(txt);
    setSimulationProgramOverride(txt);
    setNotice(`${file.name} chargé dans la simulation. Le dessin et les réglages actuels sont conservés; le SBP est lu comme des données, jamais exécuté.`);
   }
  }else{
   const result=parseSvg(txt);setSvgText(txt);setParsed(result);setFileName(file.name);setSimulationProgramOverride(null);
   setNotice(`${file.name} importé — ${result.contours.length} contour(s) détecté(s).`);
  }
  setError('');
 }catch(e){setError(e instanceof Error?e.message:String(e));}}
 function refresh(){try{setParsed(parseSvg(svgText));setError('');setNotice('SVG analysé.');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <main className="app">
  <header className="topbar"><div className="brandmark">S<span>B</span></div><h1>ShopBot <em>SVG Studio</em></h1></header>
  <div className="notice"><span>!</span><div><strong>Routine machine active : VC → JH → C6 → PAUSE</strong><p>Le SBP commande un retour JH et le démarrage du moteur avec C6 avant la pause. Vérifiez le dégagement pour JH, les unités SB3, les zéros et le Preview avant chaque usinage. L’import d’un SBP n’exécute aucune commande.</p></div></div>
  {error&&<div className="error">{error}</div>}
  {loaded.error&&<div className="error" role="alert">{loaded.error}</div>}
  {storageError&&<div className="error" role="alert">{storageError}</div>}
  <p className="status-message" role="status">{notice}</p>
  <div className="workspace">
   <section className="panel drawing-panel"><div className="panel-head"><div><span className="step">01</span><h3>Dessin source</h3></div><label className="upload">Importer SVG / SBP<input type="file" accept=".svg,.sbp,image/svg+xml" onChange={e=>{loadFile(e.target.files?.[0]);e.target.value='';}}/></label></div>
    <p className="helper">Un SBP exporté ici contient le SVG et toute sa configuration. Sa réouverture remplace les réglages et la liste de fraises actuels par ceux du fichier.</p>
    <div className="file-row"><span className="file-icon">SVG</span><div><strong>{fileName}</strong><small>{parsed.contours.length} contour(s) · {bounds.width.toFixed(2)} × {bounds.height.toFixed(2)} mm estimés</small></div><button className="quiet" onClick={refresh}>Analyser</button></div>
    <div className="preview stock-preview"><svg viewBox={`${viewMinX-margin} ${-viewMaxY-margin} ${viewMaxX-viewMinX+2*margin} ${viewMaxY-viewMinY+2*margin}`} role="img" aria-label="Placement sur le bloc, zéro en bas à droite, X vers le haut, Y vers la gauche">
     <g transform="scale(1 -1)">
      <rect x={-previewWidth} y={0} width={previewWidth} height={previewHeight} fill="#52452c" fillOpacity=".45" stroke="#b59c69" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      {placed.map((c,i)=><polyline key={i} points={c.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={c.closed?'#d8f2b0':'#e4a75d'} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
      {toolpaths.map((c,i)=><polyline key={i} points={c.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#79cbe3" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>)}
      <path d={`M 0 0 V ${margin*1.3} M 0 0 H ${-margin*1.3}`} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
     </g>
     <text x={margin*.12} y={margin*.5} fill="#fff" fontSize={margin*.45}>0,0</text>
     <text x={margin*.12} y={-margin} fill="#fff" fontSize={margin*.45}>X+</text>
     <text x={-margin*1.8} y={margin*.5} fill="#fff" fontSize={margin*.45}>Y+</text>
    </svg><div className="preview-label">BLOC VU DE DESSUS · Z=0 SUR SA FACE SUPÉRIEURE</div></div>
    <div className="legend"><span><i className="closed"/>Dessin</span><span><i className="toolpath"/>Centre de fraise</span><span><i className="stock"/>Bloc</span></div>
    <div className="subhead">Bloc et position de la découpe</div>
    <p className="helper">Origine au coin bas-droit du bloc : X monte, Y va vers la gauche. Toutes les dimensions sont en mm.</p>
    <div className="field-grid">
     <label>Bloc X (hauteur à l’écran)<input type="number" min="1" value={settings.stockHeight} onChange={e=>update('stockHeight',Number(e.target.value))}/></label>
     <label>Bloc Y (largeur à l’écran)<input type="number" min="1" value={settings.stockWidth} onChange={e=>update('stockWidth',Number(e.target.value))}/></label>
     <label>Bloc Z (épaisseur)<input type="number" min="0.1" step="0.1" value={settings.stockThickness} onChange={e=>update('stockThickness',Number(e.target.value))}/></label>
     <label>Rotation antihoraire <span>°</span><input type="number" step="1" value={settings.rotation} onChange={e=>update('rotation',Number(e.target.value))}/></label>
     <label>Depuis le bas (axe X)<input type="number" min="0" step="0.1" value={settings.offsetBottom} onChange={e=>update('offsetBottom',Number(e.target.value))}/></label>
     <label>Depuis la droite (axe Y)<input type="number" min="0" step="0.1" value={settings.offsetRight} onChange={e=>update('offsetRight',Number(e.target.value))}/></label>
    </div>
    <button className="quiet" onClick={centerDrawing}>Centrer sur le bloc</button>
    <p className="helper">Les décalages sont arrondis au dixième de mm, y compris après centrage et import. Ils placent les bords du dessin après rotation, avant compensation. Conservez une marge pour toute la largeur de fraise. La rotation concerne tous les contours ensemble.</p>
    {parsed.warnings.map((w,i)=><p className="warning" key={i}>⚠ {w}</p>)}
    <div className="subhead">Code SBP généré <button className="quiet" onClick={()=>setShowCode(v=>!v)}>{showCode?'Masquer':'Afficher'}</button></div>
    {showCode&&<pre className="code">{code}</pre>}
    <button className="secondary full" disabled={validation.errors.length>0||code.startsWith('; Génération bloquée')} onClick={()=>download('shopbot-svg-studio.sbp',code)}>Télécharger le fichier .SBP</button>
   </section>
   <section className="panel settings-panel"><div className="panel-head"><div><span className="step">02</span><h3>Paramètres de coupe</h3></div><span className="metric">MM</span></div>
    <div className="field"><label htmlFor="selected-tool">Fraise sélectionnée</label><select id="selected-tool" value={selectedTool.id} onChange={e=>selectTool(e.target.value)}>{preferences.tools.map(tool=><option key={tool.id} value={tool.id}>{tool.name} — Ø {tool.diameter} mm</option>)}</select><small>Fraises, sélection, profondeurs et placement mémorisés automatiquement dans ce navigateur.</small></div>
    <div className="tool-editor">
     <div className="field-grid">
      <label>Nom de la fraise<input value={toolName} onChange={e=>setToolName(e.target.value)}/></label>
      <label>Diamètre de fraise <span>mm</span><input type="number" min="0.1" step="0.025" value={toolDiameter} onChange={e=>setToolDiameter(Number(e.target.value))}/></label>
     </div>
     <div className="tool-actions"><button className="quiet" onClick={()=>saveTool(false)}>Enregistrer la fraise</button><button className="quiet" onClick={()=>saveTool(true)}>Ajouter une fraise</button><button className="quiet" disabled={preferences.tools.length===1} onClick={deleteTool}>Supprimer</button></div>
     <p className="helper">Pour ajouter une fraise, renseignez son nom et son diamètre, puis cliquez sur « Ajouter ». Le calcul utilise la fraise sélectionnée : Ø {settings.bitDiameter} mm.</p>
    </div>
    <div className="field-grid">
     <label>Profondeur totale <span>mm</span><input type="number" min="0.1" step="0.1" value={settings.totalDepth} onChange={e=>update('totalDepth',Number(e.target.value))}/></label>
     <label>Profondeur par passe <span>mm</span><input type="number" min="0.1" step="0.1" value={settings.passDepth} onChange={e=>update('passDepth',Number(e.target.value))}/></label>
     <label>Z de sécurité <span>mm</span><input type="number" min="0.1" step="1" value={settings.safeZ} onChange={e=>update('safeZ',Number(e.target.value))}/></label>
     <label>Avance XY <span>mm/min</span><input type="number" min="1" step="50" value={settings.feedXY} onChange={e=>update('feedXY',Number(e.target.value))}/></label>
     <label>Avance Z <span>mm/min</span><input type="number" min="1" step="25" value={settings.feedZ} onChange={e=>update('feedZ',Number(e.target.value))}/></label>
    </div>
    <div className="field check-option"><label><input type="checkbox" checked={settings.slowFinalPass} onChange={e=>update('slowFinalPass',e.target.checked)}/> Diviser la dernière passe et ralentir de moitié</label><small>La dernière tranche de profondeur est divisée en deux : la seconde moitié est usinée à la moitié des avances XY et Z.</small></div>
    <div className="field"><label>Type de contour</label><select value={settings.cutSide} onChange={e=>update('cutSide',e.target.value as Settings['cutSide'])}><option value="outside">Découpe extérieure (compensation extérieure)</option><option value="inside">Découpe intérieure (compensation intérieure)</option><option value="centerline">Suivre la ligne SVG (sans compensation)</option></select><small>La compensation est calculée côté logiciel, pas par le contrôleur.</small></div>
    <div className="field-grid"><label>Course utile X (verticale) <span>mm</span><input type="number" min="1" value={settings.machineWidth} onChange={e=>update('machineWidth',Number(e.target.value))}/></label><label>Course utile Y (horizontale) <span>mm</span><input type="number" min="1" value={settings.machineHeight} onChange={e=>update('machineHeight',Number(e.target.value))}/></label></div>
    <div className="summary"><div><span>Passes calculées</span><strong>{Math.ceil(settings.totalDepth/Math.max(settings.passDepth,0.001))+(settings.slowFinalPass?1:0)}</strong></div><div><span>Contours fermés</span><strong>{parsed.contours.filter(c=>c.closed).length}/{parsed.contours.length}</strong></div></div>
    <div className="cut-time" aria-live="polite"><span>Temps de coupe estimé</span><strong>{estimatedMinutes===null?'Indisponible : corrigez les erreurs de validation':formatCutTime(estimatedMinutes)}</strong></div>
    <p className="helper">Estimation pour tous les contours et toutes les passes, selon les parcours compensés et les avances XY/Z, dernière passe ralentie comprise. Hors déplacements rapides, retours JH, accélérations et pauses opérateur : le temps réel sera plus long.</p>
   </section>
  </div>
  <section className="panel simulation-panel"><div className="panel-head"><div><span className="step">03</span><h3>Simulation CNC</h3></div><span className="metric">{simulationProgramOverride?'FICHIER SBP':'SBP GÉNÉRÉ'} · X10</span></div>
   <p className="helper">Lecture des commandes de déplacement du SBP généré ou importé. La vue 3D représente les passes sous forme de sillons en relief, colorés selon leur profondeur. Simulation visuelle accélérée : elle ne remplace pas SB3 Preview et n’exécute aucune commande machine.</p>
   <div className="simulation-toolbar" role="group" aria-label="Vue de la simulation">
    <button className={simulationView==='3d'?'secondary':'quiet'} onClick={()=>setSimulationView('3d')}>Vue 3D</button>
    <button className={simulationView==='2d'?'secondary':'quiet'} onClick={()=>setSimulationView('2d')}>Vue de dessus</button>
    <span className="z-readout" aria-live="polite"><small>POSITION Z</small><strong>{simulationFrame?.z.toFixed(2)??'0.00'} <small>mm</small></strong></span>
   </div>
   {simulation.error?<p className="error" role="alert">Simulation indisponible : {simulation.error}</p>:simulation.program&&simulationFrame&&<>
    {simulationView==='3d'?<div className="preview stock-preview simulation-preview simulation-preview-3d"><svg viewBox="0 0 800 430" role="img" aria-label="Simulation 3D du déplacement de la fraise et de la profondeur des passes">
     <g>
      <polygon points={`${sceneB.x},${sceneB.y} ${sceneC.x},${sceneC.y} ${sceneCBase.x},${sceneCBase.y} ${sceneBBase.x},${sceneBBase.y}`} fill="#554b39" stroke="#887654" strokeWidth="1"/>
      <polygon points={`${sceneD.x},${sceneD.y} ${sceneC.x},${sceneC.y} ${sceneCBase.x},${sceneCBase.y} ${sceneDBase.x},${sceneDBase.y}`} fill="#443c2f" stroke="#887654" strokeWidth="1"/>
      <polygon points={`${sceneA.x},${sceneA.y} ${sceneB.x},${sceneB.y} ${sceneC.x},${sceneC.y} ${sceneD.x},${sceneD.y}`} fill="#60543e" stroke="#c1a671" strokeWidth="2"/>
      {simulation.program.moves.slice(0,simulationFrame.moveIndex).filter(move=>move.cut&&Math.hypot(move.to.x-move.from.x,move.to.y-move.from.y)>0).map((move,i)=>{
       const depth=Math.max(0,-Math.min(move.fromZ,move.toZ));
       const from=project3DPoint(move.from.x,move.from.y,move.fromZ,sceneScale,sceneCenter,sceneTop);
       const to=project3DPoint(move.to.x,move.to.y,move.toZ,sceneScale,sceneCenter,sceneTop);
       return<g key={`cut3d-${i}`}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={passColor(depth)} strokeWidth={Math.max((simulation.program!.bitDiameter??settings.bitDiameter)*sceneScale*.42,2)} strokeLinecap="round" opacity=".75"/><line x1={from.x} y1={from.y-1} x2={to.x} y2={to.y-1} stroke="#ffe5b0" strokeWidth="1" opacity=".55"/></g>;
      })}
      {simulationFrame.moveIndex>=0&&simulation.program.moves[simulationFrame.moveIndex].cut&&(()=>{const move=simulation.program!.moves[simulationFrame.moveIndex],end=simulationFrame.position;if(!end||Math.hypot(move.to.x-move.from.x,move.to.y-move.from.y)===0)return null;const from=project3DPoint(move.from.x,move.from.y,move.fromZ,sceneScale,sceneCenter,sceneTop),to=project3DPoint(end.x,end.y,simulationFrame.z,sceneScale,sceneCenter,sceneTop);return<g><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={passColor(Math.max(0,-Math.min(move.fromZ,move.toZ)))} strokeWidth={Math.max((simulation.program!.bitDiameter??settings.bitDiameter)*sceneScale*.42,2)} strokeLinecap="round" opacity=".75"/><line x1={from.x} y1={from.y-1} x2={to.x} y2={to.y-1} stroke="#ffe5b0" strokeWidth="1" opacity=".55"/></g>;})()}
      <polygon points={`${sceneA.x},${sceneA.y} ${sceneB.x},${sceneB.y} ${sceneC.x},${sceneC.y} ${sceneD.x},${sceneD.y}`} fill="none" stroke="#c1a671" strokeWidth="2"/>
      <g transform={`translate(${sceneA.x} ${sceneA.y})`} aria-label="Départ, zéro zéro">
       <circle r="5" fill="#d8f2b0" stroke="#fff" strokeWidth="1.5"/><path d="M -10 0 H 10 M 0 -10 V 10" stroke="#fff" strokeWidth="1.5"/><text x="12" y="-9" fill="#fff" fontSize="13">Départ 0,0</text>
      </g>
      {simulationFrame.position&&(()=>{
       const top=project3DPoint(simulationFrame.position.x,simulationFrame.position.y,Math.max(simulationFrame.z,0)+10,sceneScale,sceneCenter,sceneTop);
       const tip=project3DPoint(simulationFrame.position.x,simulationFrame.position.y,simulationFrame.z,sceneScale,sceneCenter,sceneTop);
       const radius=Math.max((simulation.program.bitDiameter??settings.bitDiameter)*sceneScale*.22,4);
       return<g aria-label={`Fraise en X ${simulationFrame.position.x.toFixed(1)}, Y ${simulationFrame.position.y.toFixed(1)}, Z ${simulationFrame.z.toFixed(1)}`}>
        <path d={`M ${top.x-radius} ${top.y} L ${tip.x-radius} ${tip.y} L ${tip.x+radius} ${tip.y} L ${top.x+radius} ${top.y} Z`} fill="#79cbe3" fillOpacity=".72" stroke="#b6efff" strokeWidth="1.5"/>
        <ellipse cx={top.x} cy={top.y} rx={radius} ry={Math.max(radius*.35,2)} fill="#b6efff" stroke="#e9fbff" strokeWidth="1"/>
        <ellipse cx={tip.x} cy={tip.y} rx={radius} ry={Math.max(radius*.35,2)} fill={simulationFrame.z<0?'#ff907b':'#79cbe3'} stroke="#fff" strokeWidth="1.5"/>
       </g>;
      })()}
     </g>
    </svg><div className="preview-label">VUE AXONOMÉTRIQUE · PASSES USINÉES COLORÉES PAR PROFONDEUR</div></div>:
     <div className="preview stock-preview simulation-preview"><svg viewBox={`${-simulationStockWidth-simulationMargin} ${-simulationStockHeight-simulationMargin} ${simulationStockWidth+2*simulationMargin} ${simulationStockHeight+2*simulationMargin}`} role="img" aria-label="Simulation du déplacement de la fraise vue de dessus">
      <g transform="scale(1 -1)">
       <rect x={-simulationStockWidth} y={0} width={simulationStockWidth} height={simulationStockHeight} fill="#52452c" fillOpacity=".45" stroke="#b59c69" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
       {simulation.program.moves.slice(0,simulationFrame.moveIndex).filter(move=>move.cut&&Math.hypot(move.to.x-move.from.x,move.to.y-move.from.y)>0).map((move,i)=><line key={`done-${i}`} x1={-move.from.y} y1={move.from.x} x2={-move.to.y} y2={move.to.x} stroke={passColor(Math.max(0,-Math.min(move.fromZ,move.toZ)))} strokeWidth={Math.max(simulation.program!.bitDiameter??settings.bitDiameter,1)} strokeLinecap="round" opacity=".75"/>)}
       {simulationFrame.moveIndex>=0&&simulation.program.moves[simulationFrame.moveIndex].cut&&(()=>{const move=simulation.program!.moves[simulationFrame.moveIndex],end=simulationFrame.position;return end&&Math.hypot(move.to.x-move.from.x,move.to.y-move.from.y)>0?<line x1={-move.from.y} y1={move.from.x} x2={-end.y} y2={end.x} stroke={passColor(Math.max(0,-Math.min(move.fromZ,move.toZ)))} strokeWidth={Math.max(simulation.program!.bitDiameter??settings.bitDiameter,1)} strokeLinecap="round" opacity=".75"/>:null;})()}
       <circle cx="0" cy="0" r="3" fill="#d8f2b0" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
       <path d={`M ${-simulationMargin*.15} 0 H ${simulationMargin*.15} M 0 ${-simulationMargin*.15} V ${simulationMargin*.15}`} fill="none" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
       {simulationFrame.position&&<g transform={`translate(${-simulationFrame.position.y} ${simulationFrame.position.x})`}>
        <circle r={Math.max((simulation.program.bitDiameter??settings.bitDiameter)/2,1)} fill={simulationFrame.z<0?'#ff775d':'#79cbe3'} fillOpacity=".32" stroke={simulationFrame.z<0?'#ff907b':'#a5e7f7'} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
       </g>}
      </g>
      <text x={simulationMargin*.12} y={simulationMargin*.5} fill="#d8f2b0" fontSize={simulationMargin*.38}>Départ 0,0</text>
     </svg><div className="preview-label">BLOC VU DE DESSUS · Z=0 SUR SA FACE SUPÉRIEURE</div></div>}
    <div className="simulation-controls">
     <div className="tool-actions">
      <button className="secondary" disabled={!simulation.program.moves.length} onClick={()=>{if(simulationTime>=simulationDuration)setSimulationTime(0);setSimulationPlaying(value=>!value);}}>{simulationPlaying?'Pause':'▶ Lire'}</button>
      <button className="quiet" disabled={!simulation.program.moves.length} onClick={()=>{setSimulationPlaying(false);setSimulationTime(0);}}>Recommencer</button>
      <span className="metric">{simulationFrame.moveIndex<0?'Départ 0,0':`Mouvement ${simulationFrame.moveIndex+1}/${simulation.program.moves.length}`}</span>
     </div>
     <input aria-label="Progression de la simulation" type="range" min="0" max={simulationDuration||1} step={Math.max(simulationDuration/1000,0.01)} value={Math.min(simulationTime,simulationDuration)} disabled={!simulation.program.moves.length} onChange={event=>{setSimulationPlaying(false);setSimulationTime(Number(event.target.value));}}/>
     <div className="simulation-time"><span>Parcours SBP : {formatCutTime(simulationTime/60)}</span><span>Durée estimée du parcours : {formatCutTime(simulationDuration/60)} · lecture ×10</span></div>
    </div>
    <div className="legend"><span><i className="stock"/>Bloc</span><span><i className="toolpath"/>Fraise</span>{cutPassDepths.map((depth,index)=><span key={depth}><i style={{background:passColors[index%passColors.length]}}/>Passe Z {(-depth).toFixed(2)} mm</span>)}</div>
   </>}
  </section>
  <section className="panel validation-panel"><div className="panel-head"><div><span className="step">04</span><h3>Validation avant export</h3></div><span className={validation.errors.length?'pill danger':'pill'}>{validation.errors.length?`${validation.errors.length} erreur(s)`:'Contrôles de base OK'}</span></div>
   {validation.errors.length===0?<p className="ok">Les contrôles logiciels de base sont passés. Cela ne remplace pas la simulation SB3 ni la vérification physique du montage.</p>:<ul className="issues">{validation.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}
   {validation.warnings.map((w,i)=><p className="warning" key={i}>⚠ {w}</p>)}
   <div className="export-row"><div><strong>Prêt à exporter ?</strong><small>SB3 · OpenSBP · Z zéro sur le dessus du bois</small></div><button className="primary" disabled={validation.errors.length>0||code.startsWith('; Génération bloquée')} onClick={()=>{download(fileName.replace(/\.svg$/i,'')+'.sbp',code);setNotice('Fichier SBP téléchargé. Ouvrez-le dans SB3 Preview avant toute coupe.')}}>Exporter le SBP ↗</button></div>
   <div className="export-row"><div><strong>Essai à 0,1 mm</strong><small>Une seule passe par contour · moteur C6 actif · sans données de projet réimportables</small></div><button className="secondary" disabled={!!testProgram.error} onClick={()=>{download(fileName.replace(/\.svg$/i,'')+'-test-01mm.sbp',testProgram.code);setNotice('SBP de test téléchargé : une passe à 0,1 mm par contour, sans données de projet. Les profondeurs du programme normal sont inchangées. Vérifiez SB3 Preview avant usinage.');}}>Exporter le SBP de test</button></div>
   {testProgram.error&&<p className="warning">Export de test bloqué : {testProgram.error}</p>}
  </section>
  <footer><span>SHOPBOT SVG STUDIO · PROTOTYPE</span><span>Démarrage moteur C6 avant PAUSE · Vérification opérateur obligatoire</span></footer>
 </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
