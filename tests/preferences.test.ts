// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, loadPreferences, parsePreferences, savePreferences, storageKey } from '../src/preferences';

afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
describe('persistent machining preferences',()=>{
 it('loads defaults on first use',()=>{
  expect(loadPreferences()).toEqual({preferences:defaultPreferences(),error:''});
 });
 it('persists tools, selection, depth and stock placement across loads',()=>{
  const preferences=defaultPreferences();
  preferences.tools.push({id:'six',name:'Fraise 6 mm',diameter:6});
  preferences.selectedToolId='six';
  Object.assign(preferences.settings,{bitDiameter:6,totalDepth:12,passDepth:3,stockWidth:600,stockHeight:400,stockThickness:22,offsetRight:20,offsetBottom:25,rotation:45});
  savePreferences(preferences);
  expect(loadPreferences()).toEqual({preferences,error:''});
 });
 it('persists edits and deletion without leaving an invalid selected diameter',()=>{
  const preferences=defaultPreferences();
  preferences.tools=[{id:'edited',name:'Fraise modifiée',diameter:8}];
  preferences.selectedToolId='edited';preferences.settings.bitDiameter=8;
  savePreferences(preferences);
  expect(loadPreferences().preferences).toEqual(preferences);
 });
 it('loads older saved settings with the final-pass option disabled',()=>{
  const preferences=defaultPreferences();
  const {slowFinalPass:_,...oldSettings}=preferences.settings;
  localStorage.setItem(storageKey,JSON.stringify({...preferences,settings:oldSettings}));
  expect(loadPreferences().preferences.settings.slowFinalPass).toBe(false);
 });
 it.each(['broken','{}',JSON.stringify({...defaultPreferences(),selectedToolId:'missing'}),JSON.stringify({...defaultPreferences(),tools:[]})])('reports corrupt saved data: %s',text=>{
  localStorage.setItem(storageKey,text);
  const loaded=loadPreferences();
  expect(loaded.error).toMatch(/Chargement des réglages impossible/);
  expect(loaded.preferences).toEqual(defaultPreferences());
 });
 it('rejects mismatched selected tool diameter',()=>{
  const preferences=defaultPreferences();preferences.settings.bitDiameter=20;
  expect(()=>parsePreferences(JSON.stringify(preferences))).toThrow(/diamètre/);
 });
 it('does not overwrite stored settings with nonfinite edits',()=>{
  const preferences=defaultPreferences();savePreferences(preferences);
  preferences.settings.rotation=NaN;
  expect(()=>savePreferences(preferences)).toThrow(/numérique/);
  expect(loadPreferences().preferences.settings.rotation).toBe(0);
 });
 it('reports denied local storage access',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Accès refusé');});
  expect(loadPreferences().error).toContain('Accès refusé');
 });
 it('surfaces write failures to the UI caller',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Quota dépassé');});
  expect(()=>savePreferences(defaultPreferences())).toThrow('Quota dépassé');
 });
});
