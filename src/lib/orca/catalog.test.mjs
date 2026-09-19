import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

// Run the shipped module with Node's native type stripping. Resolve its single
// extensionless application import without changing browser compiler settings.
const source = stripTypeScriptTypes(
	await readFile(new URL('./catalog.ts', import.meta.url), 'utf8')
).replace("'./catalog-data'", JSON.stringify(new URL('./catalog-data.ts', import.meta.url).href));
const { catalogSetupHref, catalogSource, catalogSourceDisplayName, filterCatalog, googleDriveProvider } = await import(
	'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

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
