import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { effect_root, flush } from 'svelte/internal/client';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('./LibraryDepartments.svelte',import.meta.url),'utf8');
const script=stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]).replace(/^\s*import[^;]+;/gm,'').replace('$props()','$state(testProps)');
const code=compileModule(`export function harness(testProps,OrcaService,OrcaLibraryService,t,orcaError,memberName,getHttpStatusCode,onMount,onDestroy) {
${script}
return {choose,load,save,rename,create, busy(value){lifecycleBusy=value;}, name(value){renamedName=value;newName=value;}, select(ids){selectedMembers=ids;}, get state(){return{selectedID,selectedMembers,baselineMembers,visibleMembers,selectedUnit,dirty};}};
}`,{filename:'library-departments-test.svelte.js',generate:'client'}).js.code.replaceAll('svelte/internal/client',pathToFileURL(require.resolve('svelte/internal/client')).href);
const {harness}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function setup(context,overrides={}){
 let view;const writes=[];const stop=effect_root(()=>{view=harness({data:{canManage:true,members:[{id:'active',email:'active@example.test'},{id:'suspended',email:'suspended@example.test',status:'suspended'}],units:[{id:'archived',name:'Archived',kind:'department',archivedAt:'2026-09-19T00:00:00Z',version:3},{id:'current',name:'Current',kind:'department',version:2}]},onchanged:async()=>{},ondirty:()=>{},...overrides},{unit:async(...args)=>writes.push(['unit',...args])},{departments:async()=>[{unitID:'current',memberIDs:['active'],version:5}],saveDepartment:async(...args)=>{writes.push(['members',...args]);return{unitID:args[0],memberIDs:args[1],version:6};}},(_th,en)=>en,error=>error.message,m=>m.email,error=>error.status,()=>{},()=>{});});context.after(stop);flush();return{view,writes};
}
const event={preventDefault(){}};
test('archived department cannot save old selections or rename through stale handlers',async context=>{
 const {view,writes}=setup(context);await view.load();view.choose('archived');view.select(['active']);view.name('New name');await view.save();await view.rename(event);assert.deepEqual(writes,[]);
});
test('department lifecycle in flight blocks membership save, rename and creation',async context=>{
 const {view,writes}=setup(context);await view.load();view.choose('current');view.name('New name');view.busy(true);await view.save();await view.rename(event);await view.create(event);assert.deepEqual(writes,[]);
});
test('refresh and selecting a restored empty department never restore previous grants automatically',async context=>{
 const {view,writes}=setup(context,{data:{canManage:true,members:[],units:[{id:'restored',name:'Restored',kind:'department',version:4}]}});await view.load();view.choose('restored');assert.deepEqual(view.state.selectedMembers,[]);assert.deepEqual(view.state.baselineMembers,[]);assert.deepEqual(writes,[]);assert.equal(view.state.dirty,false);
});
test('suspended employees are not offered for new department membership',context=>{
 const {view}=setup(context);assert.deepEqual(view.state.visibleMembers.map(m=>m.id),['active']);
});
