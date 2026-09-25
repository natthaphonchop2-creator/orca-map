import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
const { gatewayHasMember } = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const require = createRequire(import.meta.url);
const source=await readFile(new URL('./TeamAccess.svelte',import.meta.url),'utf8');
const code=compile(source,{filename:'TeamAccess.svelte',generate:'server'}).js.code.replace(/^import[\s\S]*?;\n/gm,'').replace('export default function TeamAccess','function TeamAccess').replace('let accounts = [];','let accounts = testAccounts;').replace('let memberStatus = "active";','let memberStatus = testStatus;').replace('let localAvailable = false;','let localAvailable = testLocalAvailable;');
const {organizationRole,canResetMemberPassword}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await readFile(new URL('../../orca/member-access.ts',import.meta.url),'utf8'))).toString('base64'));
const module=`import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
export function component(deps) { const { gatewayHasMember, testAccounts, testStatus, testLocalAvailable, beforeNavigate, organizationRole, canResetMemberPassword, OrcaLibraryService, TeamLifecycleActions, LibraryDepartments, MemberRoleEditor, MemberInvitations, LOCAL_AUTH_MIN_PASSWORD_LENGTH, t,localeHref,OrcaService,orcaError,memberName,memberRole,Building2,Check,Copy,Crown,Info,KeyRound,Plus,RefreshCw,Shield,UserPlus,Users,onMount,onDestroy }=deps; ${code}; return TeamAccess; }`;
const {component}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
function screen(actorRole,targets=[],props={},testState={}) {
 const actions=[];const noop=()=>{};
 const view=component({gatewayHasMember,testAccounts:testState.accounts||[],testStatus:testState.status||'active',testLocalAvailable:testState.localAvailable||false,beforeNavigate:noop,organizationRole,canResetMemberPassword,OrcaLibraryService:{},TeamLifecycleActions:(_r,input)=>actions.push(input),LibraryDepartments:noop,MemberRoleEditor:noop,MemberInvitations:noop,LOCAL_AUTH_MIN_PASSWORD_LENGTH:12,t:(_th,en)=>en,localeHref:x=>x,OrcaService:{},orcaError:()=>'',memberName:m=>m.displayName||m.email,memberRole:organizationRole,Building2:noop,Check:noop,Copy:noop,Crown:noop,Info:noop,KeyRound:noop,Plus:noop,RefreshCw:noop,Shield:noop,UserPlus:noop,Users:noop,onMount:noop,onDestroy:noop});
 const data={currentUserID:'actor',canManage:actorRole!=='employee',canManageRoles:actorRole==='owner',connections:[],hubs:[],units:[],members:[{id:'actor',email:'actor@example.test',role:actorRole},...targets]};
 const result=render(view,{props:{data,onchanged:async()=>{},...props}}); return {actions,html:result.body};
}
const employee={id:'employee',email:'employee@example.test',role:'employee',version:5};
test('organization admin sees member lifecycle even when local auth is unavailable',()=>{
 const result=screen('admin',[employee,{id:'owner',email:'owner@example.test',role:'owner'},{id:'other-admin',email:'admin@example.test',role:'admin'}]);
 assert.deepEqual(result.actions.map(x=>x.id),['employee']);assert.equal(result.actions[0].version,5);assert.match(result.html,/Member actions/);
});
test('owner may manage role-locked other members but not self',()=>{
 const result=screen('owner',[{...employee,roleLocked:true},{id:'other-owner',email:'owner@example.test',role:'owner',roleLocked:true}]);assert.deepEqual(result.actions.map(x=>x.id),['employee','other-owner']);
});
test('admin cannot act on protected or inherited-privilege accounts',()=>{
 assert.deepEqual(screen('admin',[{...employee,roleLocked:true}]).actions,[]);
});
test('employee view exposes no lifecycle controls',()=>{assert.deepEqual(screen('employee',[employee]).actions,[]);});
test('suspended and removed members stay out of initial active member list',()=>{
 const result=screen('owner',[employee,{id:'suspended',email:'suspended@example.test',role:'employee',status:'suspended'},{id:'removed',email:'removed@example.test',role:'employee',status:'removed'}]);
 assert.deepEqual(result.actions.map(x=>x.id),['employee']);assert.doesNotMatch(result.html,/suspended@example.test|removed@example.test/);
});


test('suspended filter exposes restoration without mixing active or removed accounts',()=>{
 const result=screen('owner',[employee,{id:'suspended',email:'suspended@example.test',role:'employee',status:'suspended',version:3},{id:'removed',email:'removed@example.test',role:'employee',status:'removed'}],{}, {status:'suspended'});
 assert.deepEqual(result.actions.map(x=>[x.id,x.inactive]),[['suspended',true]]);
 assert.doesNotMatch(result.html,/employee@example.test|removed@example.test/);
});
test('retained removed member metadata prevents a local account becoming pending again',()=>{
 const result=screen('owner',[{id:'removed',email:'removed@example.test',role:'employee',status:'removed'}],{}, {accounts:[{id:'local-removed',email:'removed@example.test'}]});
 assert.doesNotMatch(result.html,/Waiting for first sign-in|removed@example.test/);
 assert.deepEqual(result.actions,[]);
});


test('suspended local employee account is labeled suspended rather than protected administrator',()=>{
 const member={...employee,status:'suspended'};
 const result=screen('owner',[member],{}, {status:'suspended',localAvailable:true,accounts:[{id:'local-employee',email:employee.email}]});
 assert.match(result.html,/Account suspended/);
 assert.doesNotMatch(result.html,/Protected administrator account|Reset password/);
});
