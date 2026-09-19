import { catalogCategories, getCatalogPresentation } from './catalog-data';

export interface CatalogSource {
	id: string;
	name: string;
	description?: string;
	endpointHost?: string;
	/** Trusted metadata emitted by the backend for its managed connector. */
	managedProvider?: string;
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
