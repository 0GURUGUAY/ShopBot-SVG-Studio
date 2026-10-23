import { parseSvg } from './geometry';
import { parsePreferences, type Preferences } from './preferences';
import { generateSbp, startupCommands } from './sbp';

export type Project = {
 format:'shopbot-svg-studio';
 version:1;
 fileName:string;
 svgText:string;
 preferences:Preferences;
 units:'mm';
 coordinateSystem:'bottom-right-x-up-y-left-z-top';
 startupCommands:string[];
};
const begin="' SHOPBOT-STUDIO-PROJECT-BEGIN 1";
const end="' SHOPBOT-STUDIO-PROJECT-END ";
const chunkPrefix="' SHOPBOT-STUDIO-DATA ";

function parseProject(value:unknown):Project {
 if(typeof value!=='object'||value===null||!('format' in value)||value.format!=='shopbot-svg-studio'||!('version' in value)||value.version!==1)
  throw new Error('Format ou version du projet SBP non pris en charge.');
 if(!('fileName' in value)||typeof value.fileName!=='string'||!value.fileName.trim()||!('svgText' in value)||typeof value.svgText!=='string'||!('preferences' in value))
  throw new Error('Dessin ou configuration du projet SBP manquant.');
 if(!('units' in value)||value.units!=='mm'||!('coordinateSystem' in value)||value.coordinateSystem!=='bottom-right-x-up-y-left-z-top')
  throw new Error('Unités ou repère du projet SBP non pris en charge.');
 const preferences=parsePreferences(JSON.stringify(value.preferences));
 const commands=startupCommands(preferences.settings.bitDiameter);
 // Accept the fixed-diameter routine from the first project format, then regenerate it.
 const legacyCommands=startupCommands(5.9);
 if(!('startupCommands' in value)||(JSON.stringify(value.startupCommands)!==JSON.stringify(commands)&&JSON.stringify(value.startupCommands)!==JSON.stringify(legacyCommands)))
  throw new Error('La routine de démarrage enregistrée ne correspond pas à celle de cette version.');
 parseSvg(value.svgText);
 return {format:'shopbot-svg-studio',version:1,fileName:value.fileName,svgText:value.svgText,preferences,units:'mm',coordinateSystem:'bottom-right-x-up-y-left-z-top',startupCommands:commands};
}
export function generateProjectSbp(svgText:string,fileName:string,preferences:Preferences):string {
 const project=parseProject({format:'shopbot-svg-studio',version:1,fileName,svgText,preferences,units:'mm',coordinateSystem:'bottom-right-x-up-y-left-z-top',startupCommands:startupCommands(preferences.settings.bitDiameter)});
 // ASCII-only, numbered comment chunks keep SVG content out of executable SBP lines.
 const encoded=encodeURIComponent(JSON.stringify(project));
 const chunks=encoded.match(/.{1,160}/g)!;
 return generateSbp(parseSvg(project.svgText).contours,project.preferences.settings,
  [begin,...chunks.map((chunk,i)=>`${chunkPrefix}${i+1} ${chunk}`),`${end}${chunks.length}`]);
}
export function generateTestProjectSbp(svgText:string,preferences:Preferences):string {
 const testPreferences=parsePreferences(JSON.stringify({...preferences,settings:{...preferences.settings,totalDepth:0.1,passDepth:0.1}}));
 return generateSbp(parseSvg(svgText).contours,testPreferences.settings);
}
export function readProjectSbp(text:string):Project {
 const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
 const starts=lines.flatMap((line,i)=>line===begin?[i]:[]);
 if(starts.length!==1)throw new Error('Ce SBP ne contient pas un projet ShopBot SVG Studio unique et compatible. Les anciens SBP sans configuration ne peuvent pas être restaurés.');
 const chunks:string[]=[];
 let finished=false;
 for(let i=starts[0]+1;i<lines.length;i++){
  const line=lines[i];
  if(line.startsWith(end)){
   if(line!==`${end}${chunks.length}`||!chunks.length)throw new Error('Données du projet SBP incomplètes.');
   finished=true;break;
  }
  const match=line.match(/^' SHOPBOT-STUDIO-DATA (\d+) (\S+)$/);
  if(!match||Number(match[1])!==chunks.length+1)throw new Error('Données du projet SBP corrompues ou désordonnées.');
  chunks.push(match[2]);
 }
 if(!finished)throw new Error('Fin des données du projet SBP manquante.');
 let value:unknown;
 try{value=JSON.parse(decodeURIComponent(chunks.join('')));}
 catch{throw new Error('Encodage ou JSON du projet SBP invalide.');}
 return parseProject(value);
}
