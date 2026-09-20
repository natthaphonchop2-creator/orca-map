import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './test-import.mjs';
const { gatewaySources, gatewayToolCount, gatewayMemberIDs, gatewayHasMember } = await importTypeScript(new URL('./gateway-sources.ts', import.meta.url));
const { workspaceToolingReady } = await importTypeScript(new URL('./activation.ts', import.meta.url));
const { personalSources } = await importTypeScript(new URL('./personal-connections.ts', import.meta.url));
const { filterGateways } = await importTypeScript(new URL('./gateway-list.ts', import.meta.url));
const { selectedToolInventory } = await importTypeScript(new URL('./tool-inventory.ts', import.meta.url));

const source = (id) => ({ id, name: id, mcpID: id, enabled: true, reviewedTools: true, toolNames: ['search'], tools: [{name:'search'}] });
const hub = { id:'team', name:'Team', description:'', connectionID:'drive', toolNames:['search'], status:'active', memberIDs:['me'], sources:[{connectionID:'drive',toolNames:['search']},{connectionID:'slack',toolNames:['search']}] };

test('new source arrays are authoritative; the old projection never restores an explicitly removed source', () => {
  const legacy = { ...hub }; delete legacy.sources;
  assert.deepEqual(gatewaySources(legacy), [{ connectionID:'drive', toolNames:['search'] }]);
  assert.deepEqual(gatewaySources({...hub, sources:[]}), []);
  assert.equal(gatewayToolCount(hub), 2);
});

test('readiness and personal account access keep healthy sources usable without granting a revoked source', () => {
  const connections = [source('drive'), { ...source('slack'), enabled:false }];
  assert.equal(workspaceToolingReady(hub, connections), true);
  assert.equal(workspaceToolingReady(hub, connections[1]), false);
  assert.equal(workspaceToolingReady({...hub,sources:[]}, connections), false);
  const records = personalSources({ currentUserID:'me', canManage:false, connections, hubs:[hub] });
  assert.equal(records.find((s)=>s.sourceID==='drive').canReadSetup, true);
  assert.equal(records.find((s)=>s.sourceID==='slack').canReadSetup, false);
  assert.deepEqual(personalSources({currentUserID:'owner-without-membership',canManage:true,connections,hubs:[hub]}), []);
});

test('secondary source names and same-named tools retain the right Gateway in search and inventory', () => {
  const connections = [source('drive'), source('slack')];
  assert.deepEqual(filterGateways([hub],connections,'slack','').map((h)=>h.id), ['team']);
  const inventory = selectedToolInventory({ currentUserID:'me',connections,hubs:[hub] });
  assert.equal(inventory.length, 2);
  assert.equal(new Set(inventory.map((item)=>item.key)).size, 2);
  assert.ok(inventory.every((item)=>item.hub.id==='team'));
});

test('effective membership is authoritative, including an empty list, while legacy hubs retain direct membership', () => {
  const direct = { memberIDs: ['owner'], unitIDs: ['finance'], accessUnitIDs: ['finance'] };
  assert.deepEqual(gatewayMemberIDs(direct), ['owner']);
  assert.equal(gatewayHasMember(direct, 'employee'), false);
  const inherited = { ...direct, effectiveMemberIDs: ['owner', 'employee', 'employee'] };
  assert.deepEqual(gatewayMemberIDs(inherited), ['owner', 'employee']);
  assert.equal(gatewayHasMember(inherited, 'employee'), true);
  assert.equal(gatewayHasMember(inherited, ''), false);
  assert.deepEqual(gatewayMemberIDs({ ...inherited, effectiveMemberIDs: [] }), []);
  assert.equal(gatewayHasMember({ ...inherited, effectiveMemberIDs: [] }, 'owner'), false);
  assert.deepEqual(inherited.memberIDs, ['owner'], 'resolved members must not become saved direct grants');
});

test('team grants expose personal sources and selected tool access, then disappear when membership is revoked', () => {
  const inherited = { ...hub, memberIDs: ['owner'], accessUnitIDs: ['finance'], effectiveMemberIDs: ['owner', 'me'] };
  const data = { currentUserID: 'me', canManage: false, hubs: [inherited], connections: [source('drive'), source('slack')] };
  assert.deepEqual(personalSources(data).map((item) => item.sourceID), ['drive', 'slack']);
  assert.ok(selectedToolInventory(data).every((item) => item.hub?.id === 'team'));
  const revoked = { ...data, hubs: [{ ...inherited, effectiveMemberIDs: ['owner'] }] };
  assert.deepEqual(personalSources(revoked), []);
  assert.ok(selectedToolInventory(revoked).every((item) => item.hub === undefined));
});
