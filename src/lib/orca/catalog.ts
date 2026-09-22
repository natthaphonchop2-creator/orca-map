import { catalogCategories, getCatalogPresentation } from './catalog-data';
import { gatewaySources } from './gateway-sources';
import { integrationGuideSources, integrationReference } from './integration-directory';

export interface CatalogSource {
	id: string;
	name: string;
	description?: string;
	endpointHost?: string;
	/** Trusted metadata emitted by the backend for its managed connector. */
	managedProvider?: string;
	/** Confirmed authentication methods emitted by the backend; absent means unknown. */
	authMethods?: CatalogAuthMethod[];
	protocol?: 'MCP' | 'API';
	guideOnly?: boolean;
	setupStatus?: 'available' | 'admin_setup_required' | 'review_required' | 'unknown';
	setupCanConfigure?: boolean;
	setupReason?: string;
}

/** Current setup prerequisites; OAuth labels do not imply the app is configured. */
export function catalogSetupState(source: Pick<CatalogSource, 'guideOnly' | 'setupStatus' | 'setupCanConfigure' | 'setupReason'>) {
	if (source.guideOnly) return {
		kind: 'guide' as const, canStart: false,
		labelTh: 'ต้องมีตัวเชื่อมของคุณ', label: 'Bring your own connector',
		actionTh: 'เพิ่ม MCP ของคุณ', action: 'Add your own MCP'
	};
	if (source.setupStatus === 'admin_setup_required') return {
		kind: 'admin_setup_required' as const, canStart: source.setupCanConfigure === true,
		labelTh: 'ผู้ดูแลต้องเปิดใช้', label: 'Administrator setup required',
		actionTh: source.setupCanConfigure === true ? 'ตั้งค่าแอป' : 'รอผู้ดูแลเปิดใช้',
		action: source.setupCanConfigure === true ? 'Set up app' : 'Administrator required'
	};
	if (source.setupStatus === 'review_required') return {
		kind: 'review_required' as const, canStart: true,
		labelTh: source.setupReason === 'provider_review' ? 'รอยืนยันจากผู้ให้บริการ' : 'กำลังตรวจวิธีเชื่อม',
		label: source.setupReason === 'provider_review' ? 'Provider review required' : 'Connection review required',
		actionTh: 'ตรวจการตั้งค่า', action: 'Check setup'
	};
	if (source.setupStatus === 'available') return {
		kind: 'available' as const, canStart: true,
		labelTh: '', label: '', actionTh: 'เชื่อมต่อแอป', action: 'Connect app'
	};
	return {
		kind: 'unknown' as const, canStart: true,
		labelTh: 'ต้องตรวจการตั้งค่า', label: 'Setup not checked',
		actionTh: 'ตรวจการตั้งค่า', action: 'Check setup'
	};
}

export type CatalogAuthMethod = 'oauth' | 'secrets' | 'none';

// Presentation aliases for installed API connectors. The backend controls
// availability and authentication; an explanatory guide alone cannot install one.
const apiReferenceAliases: Record<string, { guideID: string; provider: string }> = {
	'default-orca-api-facebook-pages': { guideID: 'guide-facebook-pages-api', provider: 'facebook-pages' },
	'default-orca-api-line-messaging': { guideID: 'guide-line-messaging-api', provider: 'line-messaging' },
	'default-orca-api-instagram': { guideID: 'guide-instagram-api', provider: 'instagram' }
};

function installedAPIReference(source: CatalogSource) {
	const alias = apiReferenceAliases[source.id];
	return alias && source.protocol === 'API' && source.managedProvider === alias.provider
		? alias.guideID : undefined;
}

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

type ProductSource = { endpointHost?: string; managedProvider?: string; protocol?: 'MCP' | 'API' };

const managedProducts = {
	'google-drive': { name: 'Google Drive', host: 'google-drive-mcp.obot.ai', th: 'ค้นหาและอ่านไฟล์ใน Google Drive', en: 'Search and read files in Google Drive.' },
	gmail: { name: 'Gmail', host: 'gmail-mcp.obot.ai', th: 'ค้นหาและอ่านอีเมลใน Gmail', en: 'Search and read messages in Gmail.' },
	'google-calendar': { name: 'Google Calendar', host: 'google-calendar-mcp.obot.ai', th: 'ดูปฏิทินและนัดหมายใน Google Calendar', en: 'Read calendars and events in Google Calendar.' },
	'google-docs': { name: 'Google Docs', host: 'google-docs-mcp.obot.ai', th: 'อ่านเอกสารใน Google Docs', en: 'Read documents in Google Docs.' },
	'google-sheets': { name: 'Google Sheets', host: 'google-sheets-mcp.obot.ai', th: 'อ่านสเปรดชีตและข้อมูลเซลล์ใน Google Sheets', en: 'Read spreadsheets and cell values in Google Sheets.' },
	'google-search-console': { name: 'Google Search Console', host: 'google-search-console-mcp.obot.ai', th: 'ดูเว็บไซต์และผลการค้นหาใน Google Search Console', en: 'Read sites and search performance in Google Search Console.' },
	'microsoft-outlook': { name: 'Microsoft Outlook', host: 'outlook-mcp.obot.ai', th: 'ดูรายการและอ่านอีเมลใน Outlook', en: 'List and read messages in Outlook.' },
	'microsoft-calendar': { name: 'Microsoft Calendar', host: 'm365-calendar-mcp.obot.ai', th: 'ดูปฏิทินและนัดหมายใน Microsoft 365', en: 'Read calendars and events in Microsoft 365.' },
	'microsoft-contacts': { name: 'Microsoft Contacts', host: 'm365-contact-mcp.obot.ai', th: 'อ่านรายชื่อติดต่อใน Microsoft 365', en: 'Read contacts in Microsoft 365.' },
	'microsoft-onedrive': { name: 'OneDrive', host: 'm365-onedrive-mcp.obot.ai', th: 'ดูรายการและข้อมูลไฟล์ใน OneDrive', en: 'List files and read file details in OneDrive.' },
	'microsoft-excel': { name: 'Excel', host: 'm365-excel-mcp.obot.ai', th: 'อ่านชีตและข้อมูลเซลล์ใน Microsoft Excel', en: 'Read worksheets and cell values in Microsoft Excel.' },
	'microsoft-word': { name: 'Word', host: 'm365-word-mcp.obot.ai', th: 'ดูรายการและข้อมูลเอกสาร Word', en: 'List Word documents and read document details.' },
} as const;

/** This is presentation only. Authorization and recognized managed metadata come from the backend. */
export function catalogSourceProvider(source: ProductSource) {
	if (source.protocol && source.protocol !== 'MCP') return undefined;
	const managed = Object.entries(managedProducts).find(([key]) => key === source.managedProvider);
	if (managed) return { key: managed[0], product: managed[1], provider: 'orca' as const };
	const host = source.endpointHost?.toLowerCase();
	if (host === 'drivemcp.googleapis.com') return { key: 'google-drive', product: managedProducts['google-drive'], provider: 'google' as const };
	const legacy = Object.entries(managedProducts).find(([, product]) => product.host === host);
	return legacy ? { key: legacy[0], product: legacy[1], provider: 'obot' as const } : undefined;
}

export function googleDriveProvider(source: ProductSource): 'orca' | 'google' | 'obot' | undefined {
	const identity = catalogSourceProvider(source);
	return identity?.key === 'google-drive' ? identity.provider : undefined;
}

export function catalogSourceDisplayName(source: ProductSource & { name: string }): string {
	return catalogSourceProvider(source)?.product.name ?? source.name;
}

/** Preserve exact saved selections; new selections prefer ORCA, then the vendor, then legacy. */
function preferredProductSources(sources: CatalogSource[], selectedSourceID: string) {
	const winners = new Map<string, { source: CatalogSource; rank: number }>();
	for (const source of sources) {
		const identity = catalogSourceProvider(source);
		if (!identity) continue;
		const rank = source.id === selectedSourceID ? -1 : identity.provider === 'orca' ? 0 : identity.provider === 'google' ? 1 : 2;
		const current = winners.get(identity.key);
		if (!current || rank < current.rank) winners.set(identity.key, { source, rank });
	}
	return sources.filter((source) => {
		const identity = catalogSourceProvider(source);
		return !identity || winners.get(identity.key)?.source === source;
	});
}

export function catalogSource(source: CatalogSource) {
	const identity = catalogSourceProvider(source);
	const managedCopy = identity?.provider === 'orca' ? { descriptionTh: identity.product.th, descriptionEn: identity.product.en } : {};
	const reference = integrationReference(installedAPIReference(source) || source.id);
	return {
		...source,
		protocol: source.protocol ?? reference?.protocol ?? 'MCP',
		guideOnly: source.guideOnly === true,
		reference,
		name: catalogSourceDisplayName(source),
		authTags: catalogAuthTags(source),
		...getCatalogPresentation(catalogSourceDisplayName(source), source.description),
		...managedCopy
	};
}

/** Setup guides appear only in the directory, never in executable candidates. */
export function catalogDirectory(sources: CatalogSource[]) {
	const installedGuides = new Set(sources.map(installedAPIReference).filter(Boolean));
	return [...sources, ...integrationGuideSources().filter((guide) =>
		!installedGuides.has(guide.id) && !sources.some((source) => source.id === guide.id))];
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
	return preferredProductSources(sources, selectedSourceID)
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
		.filter((source) => !source.guideOnly)
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
			const source = sources.find((candidate) => candidate.name === name && !candidate.guideOnly && catalogSetupState(candidate).kind === 'available');
			return source ? [source] : [];
		})
		.slice(0, Math.max(0, limit));
}
