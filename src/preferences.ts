import type { Settings } from './sbp';
import { roundPosition } from './sbp';

export type Tool = { id:string; name:string; diameter:number };
export type Preferences = { version:1; tools:Tool[]; selectedToolId:string; settings:Settings };
export const storageKey = 'shopbot-svg-studio.preferences.v1';
export const initialSettings:Settings = {
 bitDiameter:3.175,totalDepth:6,passDepth:2,safeZ:10,feedXY:1200,feedZ:300,slowFinalPass:false,
 cutSide:'outside',machineWidth:1200,machineHeight:2400,
 stockWidth:300,stockHeight:200,stockThickness:18,offsetRight:10,offsetBottom:10,rotation:0
};
export function defaultPreferences():Preferences {
 return {version:1,tools:[{id:'default',name:'Fraise 3,175 mm',diameter:3.175}],selectedToolId:'default',settings:{...initialSettings}};
}
function isRecord(value:unknown):value is Record<string,unknown> { return typeof value==='object'&&value!==null; }
export function parsePreferences(text:string):Preferences {
 const value:unknown=JSON.parse(text);
 if(!isRecord(value)||value.version!==1||!Array.isArray(value.tools)||!value.tools.length||typeof value.selectedToolId!=='string'||!isRecord(value.settings))
  throw new Error('Préférences enregistrées invalides.');
 const tools:Tool[]=value.tools.map((tool:unknown)=>{
  if(!isRecord(tool)||typeof tool.id!=='string'||!tool.id||typeof tool.name!=='string'||!tool.name.trim()||typeof tool.diameter!=='number'||!Number.isFinite(tool.diameter)||tool.diameter<=0)
   throw new Error('Une fraise enregistrée est invalide.');
  return {id:tool.id,name:tool.name,diameter:tool.diameter};
 });
 const selected=tools.find(tool=>tool.id===value.selectedToolId);
 if(!selected||new Set(tools.map(tool=>tool.id)).size!==tools.length)throw new Error('La sélection de fraise enregistrée est invalide.');
 const settings={...initialSettings};
 for(const key of Object.keys(initialSettings) as (keyof Settings)[]){
  const saved=value.settings[key];
  if(key==='slowFinalPass'){
   if(saved===undefined)continue;
   if(typeof saved!=='boolean')throw new Error('Réglage de dernière passe invalide.');
   settings[key]=saved;
  }else if(key==='cutSide'){
   if(saved!=='inside'&&saved!=='outside'&&saved!=='centerline')throw new Error('Type de contour enregistré invalide.');
   settings[key]=saved;
  }else{
   if(typeof saved!=='number'||!Number.isFinite(saved))throw new Error('Paramètre numérique enregistré invalide.');
   settings[key]=saved;
  }
 }
 if(settings.bitDiameter!==selected.diameter)throw new Error('Le diamètre enregistré ne correspond pas à la fraise sélectionnée.');
 settings.offsetRight=roundPosition(settings.offsetRight);
 settings.offsetBottom=roundPosition(settings.offsetBottom);
 return {version:1,tools,selectedToolId:selected.id,settings};
}
export function loadPreferences():{preferences:Preferences;error:string} {
 try{
  const text=localStorage.getItem(storageKey);
  return {preferences:text===null?defaultPreferences():parsePreferences(text),error:''};
 }catch(e){
  return {preferences:defaultPreferences(),error:`Chargement des réglages impossible : ${e instanceof Error?e.message:String(e)} Les valeurs par défaut sont utilisées.`};
 }
}
export function savePreferences(preferences:Preferences):void {
 const text=JSON.stringify(preferences);
 const normalized=parsePreferences(text);
 localStorage.setItem(storageKey,JSON.stringify(normalized));
}
