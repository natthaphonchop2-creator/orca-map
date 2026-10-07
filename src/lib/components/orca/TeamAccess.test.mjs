import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { importTypeScript } from '../../orca/test-import.mjs';
import { serverComponent } from './test-render.mjs';
// W0: the page's header is the shared PageHeader (its H1, subtitle and the invite action).
const { Component: PageHeader } = await serverComponent(new URL('./ui/PageHeader.svelte', import.meta.url), { pageHeaderClaimed: () => false });
const { gatewayHasMember } = await importTypeScript(new URL('../../orca/gateway-sources.ts', import.meta.url));
const { connectedAppsHref } = await importTypeScript(new URL('../../orca/connected-ai-apps.ts', import.meta.url));
const require = createRequire(import.meta.url);
const source=await readFile(new URL('./TeamAccess.svelte',import.meta.url),'utf8');
const code=compile(source,{filename:'TeamAccess.svelte',generate:'server'}).js.code.replace(/^import[\s\S]*?;\n/gm,'').replace('export default function TeamAccess','function TeamAccess').replace('let accounts = [];','let accounts = testAccounts;').replace('let memberStatus = "active";','let memberStatus = testStatus;').replace('let localAvailable = false;','let localAvailable = testLocalAvailable;');
const {organizationRole,canResetMemberPassword}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await readFile(new URL('../../orca/member-access.ts',import.meta.url),'utf8'))).toString('base64'));
const module=`import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
export function component(deps) { const { gatewayHasMember, connectedAppsHref, testAccounts, testStatus, testLocalAvailable, beforeNavigate, organizationRole, canResetMemberPassword, OrcaLibraryService, TeamLifecycleActions, LibraryDepartments, MemberRoleEditor, MemberInvitations, PageHeader, LOCAL_AUTH_MIN_PASSWORD_LENGTH, t,localeHref,OrcaService,orcaError,memberName,memberRole,Building2,Check,Crown,Ellipsis,Info,KeyRound,MailPlus,RefreshCw,Shield,UserPlus,Users,onMount,onDestroy,untrack }=deps; ${code}; return TeamAccess; }`;
const {component}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
function screen(actorRole,targets=[],props={},testState={}) {
 const actions=[];const noop=()=>{};
 const view=component({gatewayHasMember,connectedAppsHref,testAccounts:testState.accounts||[],testStatus:testState.status||'active',testLocalAvailable:testState.localAvailable||false,beforeNavigate:noop,organizationRole,canResetMemberPassword,OrcaLibraryService:{},TeamLifecycleActions:(_r,input)=>actions.push(input),LibraryDepartments:noop,MemberRoleEditor:noop,MemberInvitations:noop,PageHeader,LOCAL_AUTH_MIN_PASSWORD_LENGTH:12,t:(_th,en)=>en,localeHref:x=>x,OrcaService:{},orcaError:()=>'',memberName:m=>m.displayName||m.email,memberRole:organizationRole,Building2:noop,Check:noop,Crown:noop,Ellipsis:noop,Info:noop,KeyRound:noop,MailPlus:noop,RefreshCw:noop,Shield:noop,UserPlus:noop,Users:noop,onMount:noop,onDestroy:noop,untrack:(fn)=>fn()});
 const data={currentUserID:'actor',canManage:actorRole!=='employee',canManageRoles:actorRole==='owner',platformOperator:testState.operator===true,canChangeMemberStatus:'changeStatus' in testState?testState.changeStatus:true,connections:[],hubs:testState.hubs||[],units:[],members:[{id:'actor',email:'actor@example.test',role:actorRole},...targets]};
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
test('in the default company only the platform operator suspends or removes people',()=>{
 const suspended={id:'suspended',email:'suspended@example.test',role:'employee',status:'suspended',version:3};
 for(const role of ['owner','admin']){
  const result=screen(role,[employee],{}, {changeStatus:false});
  assert.deepEqual(result.actions,[],role);assert.doesNotMatch(result.html,/>Suspend<|Remove from company/,role);
  assert.match(result.html,/Manage employee@example.test/,role);
  // A suspended person has nothing left to manage here, so no empty menu.
  const inactive=screen(role,[suspended],{}, {status:'suspended',changeStatus:false});
  assert.deepEqual(inactive.actions,[],role);assert.doesNotMatch(inactive.html,/Manage suspended@example.test|>Restore</,role);
 }
 assert.deepEqual(screen('owner',[employee],{}, {changeStatus:true}).actions.map(x=>x.id),['employee']);
 // The server's answer wins over the operator flag, which is only the fallback.
 const operatorRefused=screen('owner',[employee],{}, {changeStatus:false,operator:true});
 assert.deepEqual(operatorRefused.actions,[]);assert.doesNotMatch(operatorRefused.html,/>Suspend<|Remove from company/);
 const operatorSuspended=screen('owner',[suspended],{}, {status:'suspended',changeStatus:false,operator:true});
 assert.deepEqual(operatorSuspended.actions,[]);assert.doesNotMatch(operatorSuspended.html,/>Restore<|Remove from company/);
});
test('a server that does not say leaves suspending and removing to the platform operator',()=>{
 assert.deepEqual(screen('owner',[employee],{}, {changeStatus:undefined}).actions,[]);
 assert.deepEqual(screen('owner',[employee],{}, {changeStatus:undefined,operator:true}).actions.map(x=>x.id),['employee']);
});
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
 const result=screen('owner',[member],{}, {status:'suspended',localAvailable:true,operator:true,accounts:[{id:'local-employee',email:employee.email}]});
 assert.match(result.html,/Account suspended/);
 assert.doesNotMatch(result.html,/Protected administrator account|Reset password/);
});
test('company managers who are not platform operators get invitations, never password controls',()=>{
 for(const role of ['owner','admin']){
  const result=screen(role,[employee],{}, {localAvailable:true,accounts:[{id:'local-employee',email:employee.email},{id:'local-new',email:'new@example.test'}]});
  assert.doesNotMatch(result.html,/Create a password account|Reset password|Set a new password|Waiting for first sign-in|Protected administrator account/,role);
  assert.match(result.html,/Invite with a link/,role);
 }
});
test('password accounts left ทีม for the platform\'s บัญชีฉุกเฉิน, even for the ORCA team',()=>{
 const result=screen('owner',[employee],{}, {localAvailable:true,operator:true,accounts:[{id:'local-employee',email:employee.email},{id:'local-new',email:'new@example.test'}]});
 assert.doesNotMatch(result.html,/Create a password account|Reset password|Set a new password|Waiting for first sign-in|new@example.test/);
 assert.doesNotMatch(source,/localUsers|createLocalUser|resetLocalPassword|LOCAL_AUTH_MIN_PASSWORD_LENGTH/);
 assert.match(result.html,/Manage employee@example.test/,'the member menu stays');
});

test('the header offers one invite button, a small menu, and no sign-in link to copy',()=>{
 const result=screen('owner',[employee]);
 assert.match(result.html,/Invite a member/);assert.match(result.html,/More options/);
 assert.doesNotMatch(result.html,/Copy sign-in link/);
});
test('each member shows whether they can reach company data, and how to fix it',()=>{
 const hub={id:'hub-1',name:'Main workspace',status:'active',memberIDs:['employee']};
 // Archived and paused workspaces give no data access: no tick, and they don't count.
 const old={id:'hub-old',name:'Old workspace',status:'archived',memberIDs:['employee','new']};
 const paused={id:'hub-paused',name:'Paused workspace',status:'paused',memberIDs:['new']};
 const result=screen('owner',[employee,{id:'new',email:'new@example.test',role:'employee',version:1}],{},{hubs:[hub,old,paused]});
 assert.match(result.html,/Main workspace/);
 assert.doesNotMatch(result.html,/Old workspace|Paused workspace/);
 assert.match(result.html,/No data access yet/);assert.match(result.html,/Add to a workspace/);
 assert.match(result.html,/<option value="noaccess"[^>]*>No data access 2<\/option>/,'the filter counts members without a workspace (W0: one dropdown)');
 assert.match(result.html,/<a role="menuitem" href="\/app\?view=secrets&amp;holder=employee"[^>]*>See connected AI apps<\/a>/,'each row links to that person\'s connected AI apps');
});
test('a view-only member sees the list without management menus',()=>{
 const result=screen('employee',[employee]);
 assert.doesNotMatch(result.html,/Invite a member|More options|Manage employee@example.test|Add to a workspace|See connected AI apps/);
 assert.match(result.html,/can only view this list/);
});
