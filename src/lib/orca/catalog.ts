import { catalogCategories, getCatalogPresentation } from './catalog-data';
import { gatewaySources } from './gateway-sources';

export interface CatalogSource {
	id: string;
	name: string;
	description?: string;
	endpointHost?: string;
	/** Trusted metadata emitted by the backend for its managed connector. */
	managedProvider?: string;
	/** Confirmed authentication methods emitted by the backend; absent means unknown. */
	authMethods?: CatalogAuthMethod[];
}

export type CatalogAuthMethod = 'oauth' | 'secrets' | 'none';

const catalogAuthDescriptions = {
	oauth: {
		id: 'oauth',
		label: 'OAuth',
		labelTh: 'OAuth',
		descriptionTh: 'ลงชื่อเข้าใช้และอนุญาตบัญชีผ่านผู้ให้บริการ',
		descriptionEn: 'Sign in and authorize an account through the provider.'
	},
	secrets: {
		id: 'secrets',
		label: 'Secrets',
		labelTh: 'Secrets',
		descriptionTh: 'รองรับข้อมูลลับ เช่น API key, token หรือค่ารับรองการเชื่อมต่อ',
		descriptionEn: 'Supports credentials such as API keys, tokens, or other connection secrets.'
	},
	none: {
		id: 'none',
		label: 'No auth',
		labelTh: 'ไม่ต้องยืนยันบัญชี',
		descriptionTh: 'ข้อมูลการเชื่อมต่อระบุว่าไม่ต้องใช้บัญชีหรือข้อมูลลับ',
		descriptionEn: 'The connection metadata explicitly identifies this source as requiring no authentication.'
	},
	unknown: {
		id: 'unknown',
		label: 'Auth not confirmed',
		labelTh: 'รอยืนยันวิธีเชื่อม',
		descriptionTh: 'ยังไม่มีข้อมูลยืนยันวิธีเชื่อมต่อ ตรวจสอบได้ในขั้นตอนตั้งค่า',
		descriptionEn: 'The authentication method is not confirmed yet. Check it during setup.'
	}
} as const;

/** Capability labels, never a claim that an account is connected or tested. */
export function catalogAuthTags(source: Pick<CatalogSource, 'authMethods'>) {
	const methods: unknown = source.authMethods;
	if (!Array.isArray(methods) || methods.length === 0 ||
		methods.some((method) => !['oauth', 'secrets', 'none'].includes(method)) ||
		(methods.includes('none') && methods.some((method) => method !== 'none'))) {
		return [catalogAuthDescriptions.unknown];
	}
	return (['oauth', 'secrets', 'none'] as const)
		.filter((method) => methods.includes(method))
		.map((method) => catalogAuthDescriptions[method]);
}

const googleDriveHosts = {
	obot: 'google-drive-mcp.obot.ai',
	google: 'drivemcp.googleapis.com'
};

export function googleDriveProvider(
	source: Pick<CatalogSource, 'endpointHost' | 'managedProvider'>
): 'orca' | 'google' | 'obot' | undefined {
	if (source.managedProvider === 'google-drive') return 'orca';
	const host = source.endpointHost?.toLowerCase();
	if (host === googleDriveHosts.google) return 'google';
	if (host === googleDriveHosts.obot) return 'obot';
	return undefined;
}

export function catalogSourceDisplayName(
	source: Pick<CatalogSource, 'name' | 'endpointHost' | 'managedProvider'>
): string {
	return googleDriveProvider(source) ? 'Google Drive' : source.name;
}

export function catalogSource(source: CatalogSource) {
	return {
		...source,
		name: catalogSourceDisplayName(source),
		authTags: catalogAuthTags(source),
		...getCatalogPresentation(catalogSourceDisplayName(source), source.description)
	};
}

export type CatalogTool = ReturnType<typeof catalogSource>;

const preferred = [
	'Google Drive',
	'Notion',
	'Word',
	'Excel',
	'Dropbox',
	'Box',
	'Slack Workspace',
	'Gmail',
	'Microsoft Teams',
	'Asana',
	'Canva',
	'GitHub'
];

export function filterCatalog(
	sources: CatalogSource[],
	query = '',
	category = 'all',
	selectedSourceID = ''
) {
	const words = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	// A product has one default choice. An explicitly selected or saved source
	// keeps its own identity, including a legacy provider and its separate grant.
	const googleDrive =
		sources.find((source) => source.id === selectedSourceID && googleDriveProvider(source)) ??
		sources.find((source) => googleDriveProvider(source) === 'orca') ??
		sources.find((source) => googleDriveProvider(source) === 'google') ??
		sources.find((source) => googleDriveProvider(source) === 'obot');
	return sources
		.filter((source) => !googleDriveProvider(source) || source === googleDrive)
		.map(catalogSource)
		.filter((source) => {
			if (category !== 'all' && source.categoryId !== category) return false;
			const group = catalogCategories.find((item) => item.id === source.categoryId);
			const text = [
				source.name,
				source.description,
				source.descriptionTh,
				source.descriptionEn,
				...(source.aliases ?? []),
				group?.th,
				group?.en
			]
				.join(' ')
				.normalize('NFKC')
				.toLocaleLowerCase();
			return words.every((word) => text.includes(word));
		})
		.sort((a, b) => {
			const aRank = preferred.indexOf(a.name),
				bRank = preferred.indexOf(b.name);
			return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank) || a.name.localeCompare(b.name);
		});
}

export function catalogSetupHref(sourceID: string) {
	return `/app?view=servers&source=${encodeURIComponent(sourceID)}`;
}

/** Groups the already-filtered catalog without changing provider identities. */
export function groupCatalog(sources: CatalogTool[]) {
	return catalogCategories
		.map((category) => ({
			...category,
			sources: sources.filter((source) => source.categoryId === category.id),
		}))
		.filter((category) => category.sources.length > 0);
}

interface CatalogAdoptionConnection {
	id: string;
	mcpID: string;
	enabled: boolean;
	archivedAt?: string;
	deletedAt?: string;
	reviewedReadOnly?: boolean;
	reviewedTools?: boolean;
	toolNames: string[];
}
interface CatalogAdoptionHub {
	id: string;
	connectionID: string;
	status: string;
	toolNames: string[];
	sources?: { connectionID: string; toolNames: string[] }[];
}

/** Organizational adoption, not public popularity or successful execution counts. */
export function popularCatalog(
	sources: CatalogTool[],
	data: {
		connections: CatalogAdoptionConnection[];
		hubs: CatalogAdoptionHub[];
	},
	limit = 4,
) {
	return sources
		.map((source) => {
			const connections = data.connections.filter(
				(connection) =>
					connection.mcpID === source.id &&
					connection.enabled &&
					!connection.archivedAt &&
					!connection.deletedAt &&
					(connection.reviewedReadOnly || connection.reviewedTools === true),
			);
			const gatewayIDs = new Set(
				data.hubs
					.filter(
						(hub) =>
							hub.status === 'active' &&
							connections.some(
								(connection) =>
									gatewaySources(hub).some((selection) => selection.connectionID === connection.id &&
										selection.toolNames.some((name) => connection.toolNames.includes(name))),
							),
					)
					.map((hub) => hub.id),
			);
			return { source, gatewayCount: gatewayIDs.size };
		})
		.filter((item) => item.gatewayCount > 0)
		.sort(
			(a, b) =>
				b.gatewayCount - a.gatewayCount ||
				a.source.name.localeCompare(b.source.name),
		)
		.slice(0, Math.max(0, limit));
}

/** Editorial suggestions are deliberately separate from measured adoption. */
export function starterCatalog(sources: CatalogTool[], limit = 4) {
	const names = ['FlowAccount', 'PEAK', 'Google Drive', 'Slack Workspace'];
	return names
		.flatMap((name) => {
			const source = sources.find((candidate) => candidate.name === name);
			return source ? [source] : [];
		})
		.slice(0, Math.max(0, limit));
}
