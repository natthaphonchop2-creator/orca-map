import { importTypeScript } from './test-import.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

// Run the shipped module with Node's native type stripping. Resolve its single
// extensionless application import without changing browser compiler settings.
const { catalogAuthTags, catalogSetupState, catalogSetupHref, catalogSource, catalogSourceDisplayName, filterCatalog, googleDriveProvider, groupCatalog, popularCatalog, starterCatalog } = await importTypeScript(new URL('./catalog.ts', import.meta.url));

test('catalog authentication tags use explicit methods, preserve combinations, and never claim account readiness', () => {
	for (const [methods, expected] of [
		[['oauth'], ['OAuth']],
		[['secrets'], ['Secrets']],
		[['secrets', 'oauth', 'oauth'], ['OAuth', 'Secrets']],
		[['none'], ['No authentication']]
	]) {
		const source = { id: 'custom', name: 'An organization MCP', authMethods: methods };
		const before = structuredClone(source);
		const tags = catalogAuthTags(source);
		assert.deepEqual(tags.map((tag) => tag.label), expected);
		assert.ok(tags.every((tag) => tag.descriptionTh && tag.descriptionEn));
		assert.deepEqual(catalogSource(source).authTags, tags);
		assert.deepEqual(source, before);
		assert.doesNotMatch(JSON.stringify(tags), /connected|verified account|tested/i);
	}
});

test('missing, invalid, or contradictory authentication metadata stays unknown without guessing from provider identity', () => {
	for (const authMethods of [undefined, null, [], 'oauth', ['oauth', 'none'], ['none', 'secrets'], ['future-method'], ['oauth', 'future-method'], [true], [{}]]) {
		for (const identity of [
			{ name: 'FlowAccount', endpointHost: 'mcp.flowaccount.com' },
			{ name: 'PEAK', oauthProvider: 'peak', oauthSupported: true },
			{ name: 'Google Drive', managedProvider: 'google-drive', oauthProvider: 'google' },
			{ name: 'Public documents', endpointHost: 'learn.microsoft.com' }
		]) {
			const source = { id: 'source', ...identity, authMethods };
			assert.deepEqual(catalogAuthTags(source).map((tag) => tag.id), ['unknown']);
		}
	}
});

test('catalog search and provider selection retain exact-source authentication metadata', () => {
	const managed = { id: 'managed', name: 'Google Drive', managedProvider: 'google-drive', authMethods: ['oauth'] };
	const legacy = { id: 'legacy', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai', authMethods: ['secrets'] };
	assert.deepEqual(filterCatalog([managed, legacy], 'drive')[0].authTags.map((tag) => tag.id), ['oauth']);
	assert.deepEqual(filterCatalog([managed, legacy], 'drive', 'all', legacy.id)[0].authTags.map((tag) => tag.id), ['secrets']);
});

const sources = [
	{ id: 'drive', name: 'Google Drive', description: 'Search and organize files' },
	{ id: 'slack', name: 'Slack Workspace', description: 'Search team messages' },
	{ id: 'docs', name: 'Google Docs', description: 'Read shared documents' },
	{ id: 'custom', name: 'Hotel manual', description: 'Search hotel procedures' }
];

test('search matches every word and intersects with the chosen category', () => {
	const slackCategory = filterCatalog(sources, 'slack')[0].categoryId;
	assert.deepEqual(
		filterCatalog(sources, '  SLACK team ', slackCategory).map((s) => s.id),
		['slack']
	);
	assert.equal(filterCatalog(sources, 'Google', slackCategory).length, 0);
	assert.equal(filterCatalog(sources, 'slack missingterm').length, 0);
});

test('Thai descriptions participate in search and resetting retains actual source IDs', () => {
	const drive = filterCatalog(sources, 'Google Drive')[0];
	assert.ok(drive.descriptionTh.match(/[ก-๙]/));
	assert.equal(
		filterCatalog(sources, drive.descriptionTh).some((s) => s.id === 'drive'),
		true
	);
	assert.deepEqual(
		new Set(filterCatalog(sources).map((s) => s.id)),
		new Set(sources.map((s) => s.id))
	);
	assert.equal(filterCatalog([]).length, 0);
});

test('custom candidates remain discoverable without inventing integrations', () => {
	const result = filterCatalog(sources, 'hotel procedures');
	assert.equal(result.length, 1);
	assert.equal(result[0].id, 'custom');
	assert.equal(filterCatalog(sources, 'program-that-is-not-in-the-catalog').length, 0);
});

test('setup link preserves exact candidate identity without query injection', () => {
	const id = 'custom/source & add=source#test';
	const url = new URL(catalogSetupHref(id), 'https://orca.example');
	assert.equal(url.pathname, '/app');
	assert.equal(url.searchParams.get('view'), 'servers');
	assert.equal(url.searchParams.get('source'), id);
	assert.equal(url.searchParams.size, 2);
	assert.equal(url.hash, '');
});

test('Google Drive falls back to its Google-hosted source and existing logo when no managed source exists', () => {
	const driveSources = [
		{ id: 'notion', name: 'Notion' },
		{ id: 'legacy-drive', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai' },
		{ id: 'official-drive', name: 'Google Drive · ORCA', endpointHost: 'drivemcp.googleapis.com' }
	];
	const original = structuredClone(driveSources);
	const result = filterCatalog(driveSources);
	assert.deepEqual(
		result.map((source) => source.id),
		['official-drive', 'notion']
	);
	assert.equal(result[0].name, 'Google Drive');
	assert.equal(result[0].icon, '/orca/tools/google-drive.svg');
	assert.deepEqual(driveSources, original);

	const canonical = catalogSource({ id: 'canonical', name: 'Google Drive' });
	for (const drive of driveSources.slice(1).map(catalogSource)) {
		assert.equal(drive.name, 'Google Drive');
		assert.equal(drive.categoryId, canonical.categoryId);
		assert.equal(drive.descriptionTh, canonical.descriptionTh);
		assert.equal(drive.icon, canonical.icon);
		assert.equal(
			new URL(catalogSetupHref(drive.id), 'https://orca.example').searchParams.get('source'),
			drive.id
		);
	}
	assert.deepEqual(
		filterCatalog(driveSources, 'Google Drive', canonical.categoryId).map((source) => source.id),
		['official-drive']
	);
	const legacy = filterCatalog(driveSources, 'Google Drive', canonical.categoryId, 'legacy-drive');
	assert.deepEqual(
		legacy.map((source) => source.id),
		['legacy-drive']
	);
	assert.equal(legacy[0].endpointHost, 'google-drive-mcp.obot.ai');
});

test('trusted managed Drive is the default while explicit provider selections retain their exact identity', () => {
	const managed = { id: 'default-orca-google-drive-managed', name: 'Google Drive · ORCA', endpointHost: '127.0.0.1', managedProvider: 'google-drive', oauthProvider: 'google' };
	const google = { id: 'google-preview', name: 'Google Drive', endpointHost: 'drivemcp.googleapis.com' };
	const obot = { id: 'obot-legacy', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai' };
	const all = [obot, google, managed];
	const before = structuredClone(all);
	const result = filterCatalog(all);
	assert.deepEqual(result.map(item => item.id), [managed.id]);
	assert.equal(result[0].name, 'Google Drive');
	assert.equal(result[0].categoryId, 'productivity');
	assert.equal(result[0].icon, '/orca/tools/google-drive.svg');
	for (const selected of all) {
		const rows = filterCatalog(all, 'Google Drive', 'productivity', selected.id);
		assert.deepEqual(rows.map(item => item.id), [selected.id]);
		assert.equal(new URL(catalogSetupHref(rows[0].id), 'https://orca.example').searchParams.get('source'), selected.id);
	}
	assert.deepEqual(filterCatalog([managed, { ...managed, id: 'second-managed' }], '', 'all', 'second-managed').map(item => item.id), ['second-managed']);
	assert.deepEqual(all, before);
});

test('managed provider identity requires trusted metadata, never a name, reserved-looking ID, OAuth provider or loopback host', () => {
	for (const endpointHost of [undefined, '127.0.0.1', '127.0.0.1:8808', 'localhost', 'drive.company.invalid']) {
		const custom = { id: 'default-orca-google-drive-managed', name: 'Google Drive · ORCA', endpointHost, oauthProvider: 'google' };
		assert.equal(googleDriveProvider(custom), undefined);
		assert.equal(catalogSourceDisplayName(custom), custom.name);
		assert.equal(googleDriveProvider({ ...custom, managedProvider: 'google-drive' }), 'orca');
		assert.equal(catalogSourceDisplayName({ ...custom, managedProvider: 'google-drive' }), 'Google Drive');
	}
	assert.equal(googleDriveProvider({ managedProvider: 'google-sheets' }), undefined);
	assert.equal(googleDriveProvider({ endpointHost: 'DRIVEMCP.GOOGLEAPIS.COM' }), 'google');
	assert.equal(googleDriveProvider({ endpointHost: 'google-drive-mcp.obot.ai' }), 'obot');
	assert.equal(googleDriveProvider({ endpointHost: 'drivemcp.googleapis.com.attacker.invalid' }), undefined);
	const custom = { id: 'custom', name: 'Google Drive · Hotel', endpointHost: '127.0.0.1' };
	const managed = { id: 'managed', name: 'Google Drive', managedProvider: 'google-drive' };
	assert.deepEqual(new Set(filterCatalog([managed, custom]).map(item => item.id)), new Set(['managed', 'custom']));
});

test('one Google product remains available when only a legacy source or duplicate providers exist', () => {
	const legacy = { id: 'legacy', name: 'Google Drive', endpointHost: 'google-drive-mcp.obot.ai' };
	const official = {
		id: 'official',
		name: 'Google Drive · ORCA',
		endpointHost: 'drivemcp.googleapis.com'
	};
	const another = { ...official, id: 'another-official' };
	assert.deepEqual(
		filterCatalog([legacy]).map((source) => source.id),
		['legacy']
	);
	assert.deepEqual(
		filterCatalog([legacy, official, another]).map((source) => source.id),
		['official']
	);
	assert.deepEqual(
		filterCatalog([legacy, official, another], '', 'all', another.id).map((source) => source.id),
		[another.id]
	);
});

test('provider naming depends on exact endpoint hosts rather than custom names or similar hosts', () => {
	for (const endpointHost of [
		undefined,
		'files.company.invalid',
		'google-drive-mcp.obot.ai.attacker.invalid',
		'sub.drivemcp.googleapis.com',
		'drivemcp.googleapis.com.attacker.invalid',
		'https://drivemcp.googleapis.com/mcp/v1'
	]) {
		const custom = { id: 'custom-drive', name: 'Google Drive · Hotel', endpointHost };
		assert.equal(catalogSourceDisplayName(custom), custom.name);
		assert.equal(catalogSource(custom).name, custom.name);
		assert.equal(catalogSource(custom).categoryId, 'developer-tools');
		assert.ok(
			filterCatalog([
				{ id: 'official', name: 'Google Drive · ORCA', endpointHost: 'drivemcp.googleapis.com' },
				custom
			]).some((source) => source.id === custom.id)
		);
	}
	assert.equal(catalogSourceDisplayName({ name: 'Google Drive' }), 'Google Drive');
});

const thaiSources = [
	{ id: 'flow-account & account=other', name: 'FlowAccount', setupStatus: 'available' },
	{ id: 'peak-thai', name: 'PEAK', setupStatus: 'available' },
	{ id: 'market', name: 'Alpha Vantage' },
];

test('Thai accounting providers have real logos, separate work category, and searchable aliases in both languages', () => {
	const accounting = filterCatalog(thaiSources, '', 'accounting');
	assert.deepEqual(
		accounting.map((source) => source.name),
		['FlowAccount', 'PEAK'],
	);
	assert.deepEqual(
		accounting.map((source) => source.icon),
		['/orca/tools/flowaccount.svg', '/orca/tools/peak.svg'],
	);
	assert.ok(
		accounting.every(
			(source) => source.descriptionEn && /[ก-๙]/.test(source.descriptionTh),
		),
	);
	assert.deepEqual(
		filterCatalog(thaiSources, 'บัญชีไทย').map((source) => source.name),
		['FlowAccount', 'PEAK'],
	);
	assert.deepEqual(
		filterCatalog(thaiSources, 'Flow Account').map((source) => source.name),
		['FlowAccount'],
	);
	assert.deepEqual(
		filterCatalog(thaiSources, 'พีค').map((source) => source.name),
		['PEAK'],
	);
	assert.deepEqual(
		filterCatalog(thaiSources, '', 'finance').map((source) => source.name),
		['Alpha Vantage'],
	);
	assert.equal(filterCatalog(thaiSources, 'พีค', 'finance').length, 0);
});

test('visible work sections contain every filtered source once and omit empty categories', () => {
	const filtered = filterCatalog([...sources, ...thaiSources]);
	const before = structuredClone(filtered);
	const grouped = groupCatalog(filtered);
	assert.equal(
		grouped.some((group) => group.id === 'marketing'),
		false,
	);
	assert.equal(
		grouped.find((group) => group.id === 'accounting').sources.length,
		2,
	);
	assert.deepEqual(
		new Set(
			grouped.flatMap((group) => group.sources.map((source) => source.id)),
		),
		new Set(filtered.map((source) => source.id)),
	);
	assert.equal(
		grouped.flatMap((group) => group.sources).length,
		filtered.length,
	);
	assert.deepEqual(
		groupCatalog(filterCatalog(thaiSources, 'peak')).map((group) => group.id),
		['accounting'],
	);
	assert.deepEqual(groupCatalog([]), []);
	assert.deepEqual(filtered, before);
});

const connection = (id, mcpID, overrides = {}) => ({
	id,
	mcpID,
	enabled: true,
	reviewedTools: true,
	toolNames: ['read'],
	...overrides,
});
const hub = (id, connectionID, overrides = {}) => ({
	id,
	connectionID,
	status: 'active',
	toolNames: ['read'],
	...overrides,
});

test('popular apps count only distinct active Gateways with allowed tools on enabled reviewed connections', () => {
	const data = {
		connections: [
			connection('flow', thaiSources[0].id),
			connection('peak', 'peak-thai'),
			connection('disabled', 'market', { enabled: false }),
			connection('archived', 'market', { archivedAt: '2026-09-19' }),
			connection('deleted', 'market', { deletedAt: '2026-09-19' }),
			connection('unreviewed', 'market', { reviewedTools: false }),
			connection('old-readonly', 'drive', {
				reviewedTools: undefined,
				reviewedReadOnly: true,
			}),
		],
		hubs: [
			hub('flow-1', 'flow'),
			hub('flow-1', 'flow'),
			hub('flow-2', 'flow'),
			hub('peak-1', 'peak'),
			hub('drive-1', 'old-readonly'),
			...['draft', 'paused', 'archived', 'deleted'].map((status) =>
				hub(status, 'flow', { status }),
			),
			...['disabled', 'archived', 'deleted', 'unreviewed', 'missing'].map(
				(id) => hub('gate-' + id, id),
			),
			hub('no-tools', 'flow', { toolNames: [] }),
			hub('revoked-tool', 'flow', { toolNames: ['write'] }),
		],
	};
	const original = structuredClone(data);
	const ranked = popularCatalog(
		filterCatalog([...thaiSources, ...sources]),
		data,
	);
	assert.deepEqual(
		ranked.map(({ source, gatewayCount }) => [source.name, gatewayCount]),
		[
			['FlowAccount', 2],
			['Google Drive', 1],
			['PEAK', 1],
		],
	);
	assert.equal(popularCatalog(filterCatalog(thaiSources), data, 1).length, 1);
	assert.deepEqual(popularCatalog(filterCatalog(thaiSources), data, 0), []);
	assert.deepEqual(data, original);
});

test('legacy Google Drive adoption is never attributed to the ORCA managed provider', () => {
	const managed = {
		id: 'managed',
		name: 'Google Drive',
		managedProvider: 'google-drive',
	};
	const legacy = {
		id: 'legacy',
		name: 'Google Drive',
		endpointHost: 'google-drive-mcp.obot.ai',
	};
	const data = {
		connections: [connection('existing', 'legacy')],
		hubs: [hub('existing-hub', 'existing')],
	};
	assert.deepEqual(popularCatalog(filterCatalog([managed, legacy]), data), []);
	assert.equal(
		popularCatalog(filterCatalog([legacy]), data)[0].source.id,
		'legacy',
	);
});

test('new organizations have no popularity claim; starter picks are curated from available sources only', () => {
	assert.deepEqual(
		popularCatalog(filterCatalog(thaiSources), { connections: [], hubs: [] }),
		[],
	);
	assert.deepEqual(
		starterCatalog(filterCatalog(thaiSources)).map((source) => source.name),
		['FlowAccount', 'PEAK'],
	);
	assert.deepEqual(
		starterCatalog(filterCatalog([{ id: 'custom-only', name: 'Custom MCP' }])),
		[],
	);
	assert.deepEqual(starterCatalog([]), []);
});

test('catalog readiness separates OAuth capability, platform setup and live account state', () => {
  const oauth = { authMethods: ['oauth'], name: 'Slack Workspace' };
  assert.equal(catalogSetupState(oauth).kind, 'unknown');
  assert.equal(catalogSetupState(oauth).action, 'Check setup');
  const missing = { ...oauth, setupStatus: 'admin_setup_required', setupReason: 'oauth_client_missing' };
  for (const setupCanConfigure of [undefined, false, 'true', 1]) {
    const state = catalogSetupState({ ...missing, setupCanConfigure });
    assert.equal(state.canStart, false);
    assert.equal(state.action, 'Administrator required');
  }
  const owner = catalogSetupState({ ...missing, setupCanConfigure: true });
  assert.equal(owner.canStart, true);
  assert.equal(owner.action, 'Set up app');
  const available = catalogSetupState({ ...oauth, setupStatus: 'available' });
  assert.equal(available.canStart, true);
  assert.equal(available.action, 'Connect this system');
  assert.doesNotMatch(JSON.stringify(available), /connected|verified|healthy/i);
});

test('review gates and unknown metadata offer inspection without claiming availability', () => {
  for (const setupReason of ['provider_review', 'url_review']) {
    const state = catalogSetupState({ setupStatus: 'review_required', setupReason, setupCanConfigure: true });
    assert.equal(state.kind, 'review_required');
    assert.equal(state.canStart, true);
    assert.equal(state.action, 'Check setup');
    assert.match(state.label, /review required/i);
  }
  for (const setupStatus of [undefined, 'unknown', 'future-status', 'connected']) {
    const state = catalogSetupState({ setupStatus });
    assert.equal(state.kind, 'unknown');
    assert.equal(state.action, 'Check setup');
  }
  const guide = catalogSetupState({ guideOnly: true, setupStatus: 'available', setupCanConfigure: true });
  assert.equal(guide.kind, 'guide');
  assert.equal(guide.canStart, false);
  assert.equal(guide.action, 'Add a system with an MCP URL');
});

test('guides never enter adoption or starters and starters exclude known blockers and unknown setup', () => {
  const rows = filterCatalog([
    { id: 'guide-flow', name: 'FlowAccount', guideOnly: true, setupStatus: 'available' },
    { id: 'blocked-slack', name: 'Slack Workspace', setupStatus: 'admin_setup_required', setupCanConfigure: true },
    { id: 'unchecked-peak', name: 'PEAK' },
    { id: 'drive', name: 'Google Drive', setupStatus: 'available' },
  ]);
  assert.deepEqual(starterCatalog(rows).map(row => row.id), ['drive']);
  const adoption = {
    connections: [connection('guide-connection', 'guide-flow')],
    hubs: [hub('guide-gateway', 'guide-connection')],
  };
  assert.deepEqual(popularCatalog(rows, adoption), []);
});


test('managed BigQuery display name preserves its icon, work category and historical search name', () => {
  const source = { id: 'same-bigquery-id', name: 'BigQuery MCP', endpointHost: 'bigquery.googleapis.com' };
  const renamed = catalogSource(source);
  const previous = catalogSource({ ...source, name: 'BigQuery Toolbox' });
  assert.equal(renamed.id, source.id);
  assert.equal(renamed.icon, previous.icon);
  assert.equal(renamed.categoryId, 'data-analytics');
  assert.deepEqual(filterCatalog([source], 'BigQuery Toolbox').map(row => row.id), [source.id]);
});

const managedFamilies = [
  ['google-drive', 'Google Drive', 'google-drive-mcp.obot.ai', 'productivity', '/orca/tools/google-drive.svg'],
  ['gmail', 'Gmail', 'gmail-mcp.obot.ai', 'communication', '/orca/catalog/gmail.svg'],
  ['google-calendar', 'Google Calendar', 'google-calendar-mcp.obot.ai', 'communication', '/orca/catalog/google-calendar.svg'],
  ['google-docs', 'Google Docs', 'google-docs-mcp.obot.ai', 'productivity', '/orca/tools/google-docs.svg'],
  ['google-sheets', 'Google Sheets', 'google-sheets-mcp.obot.ai', 'data-analytics', '/orca/tools/google-sheets.svg'],
  ['google-search-console', 'Google Search Console', 'google-search-console-mcp.obot.ai', 'marketing', '/orca/catalog/google-search-console.svg'],
  ['microsoft-outlook', 'Microsoft Outlook', 'outlook-mcp.obot.ai', 'communication', '/orca/catalog/outlook.svg'],
  ['microsoft-calendar', 'Microsoft Calendar', 'm365-calendar-mcp.obot.ai', 'communication', '/orca/catalog/calendar.svg'],
  ['microsoft-contacts', 'Microsoft Contacts', 'm365-contact-mcp.obot.ai', 'crm-sales', '/orca/catalog/contact.svg'],
  ['microsoft-onedrive', 'OneDrive', 'm365-onedrive-mcp.obot.ai', 'productivity', '/orca/catalog/onedrive.svg'],
  ['microsoft-excel', 'Excel', 'm365-excel-mcp.obot.ai', 'data-analytics', '/orca/catalog/excel.svg'],
  ['microsoft-word', 'Word', 'm365-word-mcp.obot.ai', 'productivity', '/orca/catalog/word.svg'],
];

test('managed Google and Microsoft products replace only the catalog default, never exact existing selections', () => {
  for (const [key, name, endpointHost, category, icon] of managedFamilies) {
    const legacy = { id: `legacy-${key}`, name, endpointHost, authMethods: ['secrets'], setupStatus: 'available' };
    const managed = { id: `default-orca-managed-${key}`, name: 'Backend label', managedProvider: key, endpointHost: '127.0.0.1', authMethods: ['oauth'], setupStatus: 'admin_setup_required' };
    const custom = { id: `custom-${key}`, name: `${name} · My company`, endpointHost: `${endpointHost}.example.test` };
    const all = [legacy, custom, managed];
    const before = structuredClone(all);
    const defaults = filterCatalog(all);
    assert.deepEqual(new Set(defaults.map(item => item.id)), new Set([custom.id, managed.id]));
    const row = defaults.find(item => item.id === managed.id);
    assert.equal(row.name, name);
    assert.equal(row.categoryId, category);
    assert.equal(row.icon, icon);
    assert.equal(row.setupStatus, 'admin_setup_required');
    assert.match(row.descriptionEn, /read|Read/);
    assert.doesNotMatch(row.descriptionEn, /send|create|write|edit/i);
    assert.equal(catalogSetupState(row).kind, 'admin_setup_required');
    for (const selected of [legacy, managed]) {
      const results = filterCatalog(all, '', 'all', selected.id);
      const result = results.find(item => item.id === selected.id);
      assert.ok(result);
      assert.deepEqual(result.authMethods, selected.authMethods);
      assert.equal(result.setupStatus, selected.setupStatus);
      assert.equal(results.some(item => item.id === (selected === legacy ? managed.id : legacy.id)), false);
      assert.equal(new URL(catalogSetupHref(result.id), 'https://orca.example').searchParams.get('source'), selected.id);
    }
    assert.deepEqual(filterCatalog([legacy]).map(item => item.id), [legacy.id]);
    assert.deepEqual(all, before);
  }
});

test('managed recognition never follows a display name, a reserved-looking source ID or an unrelated API', () => {
  for (const [key, name] of managedFamilies) {
    const managed = { id: `managed-${key}`, name, managedProvider: key };
    const custom = { id: `default-orca-managed-${key}`, name: 'Custom source', endpointHost: '127.0.0.1', oauthProvider: key.startsWith('microsoft-') ? 'microsoft' : 'google' };
    assert.equal(catalogSourceDisplayName(custom), 'Custom source');
    assert.deepEqual(new Set(filterCatalog([managed, custom]).map(item => item.id)), new Set([managed.id, custom.id]));
    const api = { ...custom, id: `api-${key}`, managedProvider: key, protocol: 'API' };
    assert.equal(catalogSourceDisplayName(api), 'Custom source');
    assert.equal(filterCatalog([managed, api]).length, 2);
  }
});
