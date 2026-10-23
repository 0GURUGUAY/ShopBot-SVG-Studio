import type { Contour, Pt } from './geometry';
import { getBounds, offsetClosedContour, simplifyPoints } from './geometry';
export type Settings = { bitDiameter:number; totalDepth:number; passDepth:number; safeZ:number; feedXY:number; feedZ:number; slowFinalPass:boolean; cutSide:'outside'|'inside'|'centerline'; machineWidth:number; machineHeight:number; stockWidth:number; stockHeight:number; stockThickness:number; offsetRight:number; offsetBottom:number; rotation:number };
const pathSimplificationToleranceMm = 0.1;
const fmt=(n:number)=>{if(!Number.isFinite(n))throw new Error('Valeur numérique invalide.');return n.toFixed(3).replace(/\.?(0+)$/,'').replace(/\.$/,'') || '0';};
export function startupCommands(bitDiameter:number):string[] {
 return [`VC, ${fmt(bitDiameter)},,,25.4,0,10,25.4,0,0,0,Z,8`,"JH,","C6, 'mise en route du moteur","PAUSE"];
}
function cleanPoints(points:Pt[]):Pt[]{return points.filter((p,i)=>i===0||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>1e-5);}
export function roundPosition(value:number):number { return Math.round(value*10)/10; }
export function placeContours(contours:Contour[],s:Settings):Contour[]{
 const angle=s.rotation*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
 const rotated=contours.map(c=>({...c,points:c.points.map(p=>({x:p.x*cos-p.y*sin,y:p.x*sin+p.y*cos}))}));
 const b=getBounds(rotated);
 return rotated.map(c=>({...c,points:c.points.map(p=>({x:p.x-b.x-b.width-roundPosition(s.offsetRight),y:p.y-b.y+roundPosition(s.offsetBottom)}))}));
}
export function getToolpaths(contours:Contour[],s:Settings):Contour[]{
 return placeContours(contours,s).map(c=>{
  const points=s.cutSide==='centerline'?cleanPoints(c.points):offsetClosedContour(c,(s.bitDiameter/2)*(s.cutSide==='outside'?1:-1));
  return {...c,points:simplifyPoints(points,pathSimplificationToleranceMm)};
 });
}
function* cutPasses(s:Settings){
 const count=Math.ceil(s.totalDepth/s.passDepth);
 for(let k=1;k<=count;k++){
  const depth=Math.min(k*s.passDepth,s.totalDepth);
  if(s.slowFinalPass&&k===count){
   yield {depth:((k-1)*s.passDepth+depth)/2,feedFactor:1};
   yield {depth,feedFactor:0.5};
  }else{
   yield {depth,feedFactor:1};
  }
 }
}
export function estimateCutTimeMinutes(contours:Contour[],s:Settings):number{
 const v=validate(contours,s);if(v.errors.length)throw new Error(v.errors.join('\n'));
 const paths=getToolpaths(contours,s);
 const length=paths.reduce((total,c)=>total+c.points.reduce((distance,p,i)=>
  i===0?distance:distance+Math.hypot(p.x-c.points[i-1].x,p.y-c.points[i-1].y),0),0);
 let minutes=0;
 for(const pass of cutPasses(s)){
  minutes+=length/(s.feedXY*pass.feedFactor);
  // Every contour starts with a plunge from safe Z, as in the generated program.
  minutes+=paths.length*(s.safeZ+pass.depth)/(s.feedZ*pass.feedFactor);
 }
 return minutes;
}
export function validate(contours:Contour[],s:Settings){const errors:string[]=[];const warnings:string[]=[];
 if(Object.values(s).some(value=>typeof value==='number'&&!Number.isFinite(value)))errors.push('Tous les paramètres numériques doivent être finis.');
 if(!contours.length)errors.push('Aucun contour à usiner.');
 if(s.bitDiameter<=0)errors.push('Le diamètre de fraise doit être supérieur à zéro.');
 if(s.totalDepth<=0)errors.push('La profondeur totale doit être positive.');
 if(s.passDepth<=0)errors.push('La profondeur par passe doit être positive.');
 if(s.safeZ<=0)errors.push('La hauteur de sécurité doit être supérieure à zéro.');
 if(s.feedXY<=0||s.feedZ<=0)errors.push('Les avances doivent être positives.');
 if(s.machineWidth<=0||s.machineHeight<=0)errors.push('Les dimensions de table doivent être positives.');
 if(s.stockWidth<=0||s.stockHeight<=0||s.stockThickness<=0)errors.push('Les dimensions du bloc doivent être positives.');
 if(s.offsetRight<0||s.offsetBottom<0)errors.push('Les décalages depuis les bords doivent être positifs ou nuls.');
 if(s.totalDepth>s.stockThickness)errors.push('La profondeur totale dépasse l’épaisseur Z du bloc.');
 if(s.stockHeight>s.machineWidth||s.stockWidth>s.machineHeight)errors.push('Le bloc dépasse la course utile de la machine (X vertical, Y horizontal).');
 contours.forEach((c,i)=>{if(!c.closed)errors.push(`${c.label}: contour ouvert — fermeture manuelle requise avant découpe.`);if(c.points.length<4)errors.push(`${c.label}: pas assez de points.`);if(c.closed&&Math.abs(c.points.reduce((a,p,j)=>j<c.points.length-1?a+p.x*c.points[j+1].y-p.y*c.points[j+1].x:a,0))<1e-5)errors.push(`${c.label}: surface nulle ou géométrie invalide.`);if(!c.closed)warnings.push(`Contour ${i+1} ignoré tant qu’il n’est pas fermé.`);});
 if(s.safeZ>100)warnings.push('Hauteur de sécurité supérieure à 100 mm : vérifie les dégagements Z.');
 if(s.totalDepth>s.passDepth*20)warnings.push('Plus de 20 passes seront nécessaires.');
 if(!errors.length){
  try{
   const paths=getToolpaths(contours,s), b=getBounds(paths), radius=s.bitDiameter/2, epsilon=0.00001;
   if(paths.some(c=>c.points.length<4))errors.push('Un parcours compensé est invalide.');
   if(b.x-radius < -s.stockWidth-epsilon || b.x+b.width+radius > epsilon || b.y-radius < -epsilon || b.y+b.height+radius > s.stockHeight+epsilon)
    errors.push('La découpe ou l’enveloppe de la fraise dépasse le bloc. Ajustez les décalages, la rotation ou les dimensions.');
  }catch(e){errors.push(e instanceof Error?e.message:String(e));}
 }
 return{errors,warnings};}
export function generateSbp(contours:Contour[],s:Settings,projectComments:string[]=[]):string{
 if(projectComments.some(line=>!line.startsWith("' ")||/[\r\n]/.test(line)))throw new Error('Commentaire de projet SBP invalide.');
 const v=validate(contours,s);if(v.errors.length)throw new Error(v.errors.join('\n'));
 // Screen coordinates are right/up; this machine uses X up and Y left.
 const paths=getToolpaths(contours,s).map(c=>c.points.map(p=>({x:p.y,y:-p.x})));
 const lines:string[]=[...startupCommands(s.bitDiameter),"' ShopBot SVG Studio v0.1 - VERIFY IN SB3 PREVIEW BEFORE CUTTING","' Units must be configured as MILLIMETERS in SB3","' XY zero: stock bottom-right; X positive UP, Y positive LEFT",`' Stock X,Y,Z: ${fmt(s.stockHeight)},${fmt(s.stockWidth)},${fmt(s.stockThickness)}`,`' Rotation CCW degrees: ${fmt(s.rotation)}`,"' Z zero assumed at TOP SURFACE of stock","' WARNING: startup uses JH and starts spindle with C6 before PAUSE","SA",`MS,${fmt(s.feedXY/60)},${fmt(s.feedXY/60)},${fmt(s.feedZ/60)}`,`JZ,${fmt(s.safeZ)}`];
 paths.forEach((p,idx)=>{
  if(p.length<4)throw new Error(`Parcours ${idx+1} invalide.`);
  lines.push(`' Contour ${idx+1}`);
  for(const pass of cutPasses(s)){
    const isSlowPass=pass.feedFactor===0.5;
    if(isSlowPass)lines.push(`MS,${fmt(s.feedXY/120)},${fmt(s.feedXY/120)},${fmt(s.feedZ/120)}`);
    lines.push(`' ----------------- Hauteur de coupe : ${fmt(-pass.depth)} mm`);
    lines.push(`JZ,${fmt(s.safeZ)}`,`J2,${fmt(p[0].x)},${fmt(p[0].y)}`,`MZ,${fmt(-pass.depth)}`);
    for(let i=1;i<p.length;i++)lines.push(`M2,${fmt(p[i].x)},${fmt(p[i].y)}`);
    lines.push(`JZ,${fmt(s.safeZ)}`);
    if(isSlowPass)lines.push(`MS,${fmt(s.feedXY/60)},${fmt(s.feedXY/60)},${fmt(s.feedZ/60)}`);
  }
 });
 lines.push("' End of program","JZ,"+fmt(s.safeZ),...projectComments,"JH","C7");return lines.join('\r\n')+'\r\n';
}
