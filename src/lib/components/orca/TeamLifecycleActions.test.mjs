import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { effect_root, flush } from 'svelte/internal/client';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('./TeamLifecycleActions.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]).replace(/^\s*import[^;]+;/gm, '').replace(/^(\s*)export function/gm, '$1function').replace('$props()', '$state(testProps)');
const code = compileModule(`export function harness(testProps, OrcaService, t, orcaError, getHttpStatusCode, showToast) {
${script}
let focused = false;
const modal = { open: false, isConnected: true, showModal() { this.open = true; }, close() { this.open = false; } };
dialog = modal; cancelButton = { focus() { focused = true; } };
return { open, request, confirm, modal, destructiveNow: () => destructive, replace(nextID, nextVersion) { id = nextID; version = nextVersion; }, get state() { return { saving, stale, error, completed, focused }; } };
}`, { filename: 'team-lifecycle-test.svelte.js', generate: 'client' }).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function setup(context, props = {}, service = {}) {
 const writes = []; const busy = []; const toasts = []; let refreshed = 0; let view;
 const stop = effect_root(() => { view = harness({kind:'member', id:'member-one', name:'Synthetic member', version:7, onchanged: async()=>{refreshed++;}, onbusy:(value)=>busy.push(value), ...props}, {
 memberLifecycle: async(...args)=>writes.push(['member',...args]), departmentLifecycle:async(...args)=>writes.push(['department',...args]), ...service
 }, (_th,en)=>en, error=>error.message, error=>error.status, (message)=>toasts.push(message)); });
 context.after(stop); flush(); return { view,writes,busy,toasts,get refreshed(){return refreshed;} };
}
test('opening confirmation focuses cancel and cancellation has no mutation', context=>{
 const {view,writes}=setup(context); view.open('suspend'); assert.equal(view.modal.open,true); assert.equal(view.state.focused,true); view.modal.close(); assert.deepEqual(writes,[]);
});
for (const [kind,actions] of [['member',['suspend','restore','delete']],['department',['archive','restore','delete']]]) for(const action of actions) test(`${kind} ${action} dispatches reviewed target/version once`,async context=>{
 const state=setup(context,{kind});state.view.open(action);await state.view.confirm();await state.view.confirm();assert.deepEqual(state.writes,[[kind,'member-one',action,7]]);assert.equal(state.refreshed,1);assert.deepEqual(state.busy,[true,false]);
});
test('pending action cannot be reentered or replaced with delete',async context=>{
 let release;let writes=0;const pending=new Promise(resolve=>release=resolve);const {view}=setup(context,{}, {memberLifecycle:async()=>{writes++;await pending;}});view.open('suspend');const saving=view.confirm();view.open('delete');await view.confirm();assert.equal(writes,1);assert.equal(view.state.saving,true);release();await saving;
});
for(const change of ['version','target']) test(`changed ${change} blocks stale confirmation without API write`,async context=>{
 const {view,writes}=setup(context);view.open('delete');view.replace(change==='target'?'member-two':'member-one',change==='version'?8:7);await view.confirm();assert.equal(view.state.stale,true);assert.deepEqual(writes,[]);
});
test('remote conflict blocks retry without a new review',async context=>{
 let writes=0;const {view}=setup(context,{}, {memberLifecycle:async()=>{writes++;throw Object.assign(new Error('Conflict'),{status:409});}});view.open('suspend');await view.confirm();await view.confirm();assert.equal(view.state.stale,true);assert.equal(writes,1);assert.equal(view.modal.open,true);
});
test('disabled controls cannot open or submit a mutation',async context=>{
 const {view,writes}=setup(context,{disabled:true});view.open('delete');await view.confirm();assert.equal(view.modal.open,false);assert.deepEqual(writes,[]);
});
test('refresh failure after successful mutation remains visible and cannot duplicate write',async context=>{
 const {view,writes}=setup(context,{onchanged:async()=>{throw new Error('Refresh unavailable');}});view.open('suspend');await view.confirm();await view.confirm();assert.equal(writes.length,1);assert.equal(view.modal.open,true);assert.match(view.state.error,/Saved, but/);assert.equal(view.state.completed,true);
});
for(const file of ['TeamLifecycleActions.svelte','TeamAccess.svelte','LibraryDepartments.svelte']) test(`${file} compiles without warnings`,async()=>{const input=await readFile(new URL(file,import.meta.url),'utf8');assert.deepEqual(compile(input,{filename:file,generate:'client'}).warnings,[]);});

test('a row menu opens the same reviewed confirmation through request', async context => {
 const state = setup(context); state.view.request('delete'); assert.equal(state.view.modal.open, true);
 await state.view.confirm(); assert.deepEqual(state.writes, [['member', 'member-one', 'delete', 7]]);
});

test('suspending a member uses the danger tone and says what happened by name', async context => {
 const state = setup(context); state.view.open('suspend'); flush();
 assert.equal(state.view.destructiveNow(), true, 'suspend cuts every key and AI sign-in: red, like remove');
 await state.view.confirm();
 assert.deepEqual(state.toasts, ['Suspended Synthetic member. All their connections in this company are cut.']);
 const department = setup(context, { kind: 'department' }); department.view.open('archive'); flush();
 assert.equal(department.view.destructiveNow(), false, 'archiving a department is not destructive');
 assert.match(source, /class:danger-solid=\{destructive\}/);
 assert.doesNotMatch(source, /notice = t\('บันทึกแล้ว'/, 'no generic "saved"');
});

test('a confirmation opened from a row menu gives focus back to the menu button', async () => {
 assert.match(source, /export function request\(next: 'suspend' \| 'restore' \| 'delete', returnTo\?: HTMLElement\)/);
 assert.match(source, /onclose=\{closed\}/);
 const team = await readFile(new URL('./TeamAccess.svelte', import.meta.url), 'utf8');
 assert.match(team, /request\(member\.status === "suspended" \? "restore" : "suspend", menuButton\(event\)\)/);
 assert.match(team, /request\("delete", menuButton\(event\)\)/);
});
