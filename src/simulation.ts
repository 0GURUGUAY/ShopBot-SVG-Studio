import type { Pt } from './geometry';

export type SimulationMove = {
 from:Pt;
 to:Pt;
 fromZ:number;
 toZ:number;
 cut:boolean;
 duration:number;
 line:number;
};

export type SbpSimulation = {
 moves:SimulationMove[];
 duration:number;
 stockWidth?:number;
 stockHeight?:number;
 stockThickness?:number;
 bitDiameter?:number;
};

const rapidXYRate=5000;
const rapidZRate=1000;

function numericArguments(line:string,lineNumber:number,count:number):number[]{
 const values=line.split(',').slice(1).map(value=>Number(value.trim()));
 if(values.length!==count||values.some(value=>!Number.isFinite(value)))
  throw new Error(`Coordonnées SBP invalides à la ligne ${lineNumber}.`);
 return values;
}

export function parseSbpSimulation(text:string):SbpSimulation{
 const moves:SimulationMove[]=[];
 let position:Pt={x:0,y:0};
 let z=0;
 let xyRate=1200;
 let zRate=300;
 let stockWidth:number|undefined;
 let stockHeight:number|undefined;
 let stockThickness:number|undefined;
 let bitDiameter:number|undefined;

 const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  const lineNumber=i+1;
  if(!line||line.startsWith("'"))continue;
  const command=line.split(',')[0].trim().toUpperCase();
  if(command==='VC'){
   const diameter=Number(line.split(',')[1]?.trim());
   if(Number.isFinite(diameter)&&diameter>0)bitDiameter=diameter;
   continue;
  }
  if(command==='MS'){
   const rates=numericArguments(line,lineNumber,3);
   if(rates.some(rate=>rate<=0))throw new Error(`Avance SBP invalide à la ligne ${lineNumber}.`);
   xyRate=Math.min(rates[0],rates[1])*60;
   zRate=rates[2]*60;
   continue;
  }
  if(command==='JH'||command==='C6'||command==='C7'||command==='PAUSE'||command==='SA')continue;
  if(command==='J2'||command==='M2'){
   const [x,y]=numericArguments(line,lineNumber,2);
   const target={x,y};
   if(position){
    const length=Math.hypot(target.x-position.x,target.y-position.y);
    if(length>0){
     const cutting=command==='M2'&&Math.min(z,0)<0;
     const rate=command==='J2'?rapidXYRate:xyRate;
     moves.push({from:position,to:target,fromZ:z,toZ:z,cut:cutting,duration:length/rate*60,line:lineNumber});
    }
   }
   position=target;
   continue;
  }
  if(command==='MZ'||command==='JZ'){
   const [targetZ]=numericArguments(line,lineNumber,1);
   if(position){
    const distance=Math.abs(targetZ-z);
    if(distance>0){
     moves.push({from:position,to:position,fromZ:z,toZ:targetZ,cut:command==='MZ'&&Math.min(z,targetZ)<0,duration:distance/(command==='JZ'?rapidZRate:zRate)*60,line:lineNumber});
    }
   }
   z=targetZ;
   continue;
  }
  throw new Error(`Commande SBP « ${command} » non prise en charge par la simulation (ligne ${lineNumber}).`);
 }

 for(const line of lines){
  const stock=line.match(/^'\s*Stock X,Y,Z:\s*([+-]?[\d.]+),([+-]?[\d.]+),([+-]?[\d.]+)/i);
  if(stock){
   const height=Number(stock[1]),width=Number(stock[2]);
   const thickness=Number(stock[3]);
   if(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0){stockWidth=width;stockHeight=height;}
   if(Number.isFinite(thickness)&&thickness>0)stockThickness=thickness;
  }
 }
 if(!moves.length)throw new Error('Aucun déplacement XY ou Z pris en charge n’a été trouvé dans le SBP.');
 return{moves,duration:moves.reduce((sum,move)=>sum+move.duration,0),stockWidth,stockHeight,stockThickness,bitDiameter};
}

export type SimulationFrame={
 position:Pt|null;
 z:number;
 moveIndex:number;
 elapsed:number;
};

export function getSimulationFrame(simulation:SbpSimulation,elapsed:number):SimulationFrame{
 const time=Math.max(0,Math.min(elapsed,simulation.duration));
 if(time===0)return{position:{x:0,y:0},z:0,moveIndex:-1,elapsed:0};
 let remaining=time;
 for(let i=0;i<simulation.moves.length;i++){
  const move=simulation.moves[i];
  if(remaining<=move.duration||i===simulation.moves.length-1){
   const progress=move.duration?Math.min(remaining/move.duration,1):1;
   return{
    position:{x:move.from.x+(move.to.x-move.from.x)*progress,y:move.from.y+(move.to.y-move.from.y)*progress},
    z:move.fromZ+(move.toZ-move.fromZ)*progress,
    moveIndex:i,
    elapsed:time
   };
  }
  remaining-=move.duration;
 }
 return{position:null,z:0,moveIndex:-1,elapsed:time};
}
