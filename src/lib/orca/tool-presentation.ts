export interface PresentableTool {
	name: string;
	title?: string;
	description?: string;
	annotations?: { title?: string };
}

// Exact identifiers only: a suffix match must never turn an unrelated tool
// into a trusted ORCA capability. Labels describe actions, never grant access.
const knownLabels: Record<string, readonly [string, string]> = {
	facebook_page_get: ['ดูข้อมูลเพจ Facebook', 'Get Facebook Page information'],
	facebook_page_posts: ['อ่านโพสต์ล่าสุดของเพจ Facebook', 'Read recent Facebook Page posts'],
	line_bot_get: ['ดูข้อมูลบัญชี LINE OA', 'Get LINE Official Account information'],
	line_message_quota_get: ['ดูโควตาข้อความ LINE OA', 'Get LINE message quota'],
	line_message_usage_get: ['ดูยอดข้อความ LINE OA เดือนนี้', 'Get LINE message usage this month'],
	instagram_account_get: ['ดูข้อมูลบัญชี Instagram', 'Get Instagram account information'],
	instagram_media_list: ['อ่านโพสต์ล่าสุดของ Instagram', 'Read recent Instagram posts'],
	list_files: ['ดูรายการไฟล์', 'List files'],
	get_file: ['ดูข้อมูลไฟล์', 'Get file information'],
	read_file: ['อ่านไฟล์', 'Read file'],
	search_files: ['ค้นหาไฟล์', 'Search files'],
	list_recent_files: ['ดูไฟล์ล่าสุด', 'List recent files'],
	orca_knowledge_search: ['ค้นหาบทความความรู้', 'Search knowledge articles'],
	orca_knowledge_read: ['อ่านบทความความรู้', 'Read a knowledge article'],
	orca_template_list: ['ดูรายการแม่แบบ', 'List templates'],
	orca_template_use: ['เตรียมแม่แบบพร้อมบทความความรู้', 'Prepare a template with knowledge']
};

function humanizeIdentifier(name: string): string {
	// Formatting only, with no inferred action or permission for unknown tools.
	// Keep URL-like identifiers intact instead of relabelling an endpoint as a task.
	if (/^https?:\/\//i.test(name)) return name;
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
		.replace(/[_./:-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

export function toolPresentation(tool: PresentableTool, locale: 'th' | 'en' = 'th') {
	const identifier = tool.name;
	const title = tool.title?.trim() || tool.annotations?.title?.trim();
	const translated = Object.hasOwn(knownLabels, identifier) ? knownLabels[identifier] : undefined;
	const description = tool.description?.trim() || '';
	// A short provider-supplied description can be clearer than an API operation
	// name. Use it verbatim; longer instructions stay in the secondary detail.
	const conciseDescription = description.length <= 100 && !description.includes('\n') ? description : '';
	const label = title || (translated ? translated[locale === 'th' ? 0 : 1] : conciseDescription || humanizeIdentifier(identifier));
	return {
		label,
		identifier,
		description,
		searchText: [label, identifier, description, ...(translated || [])].join(' ').toLocaleLowerCase()
	};
}

export function matchesToolSearch(tool: PresentableTool, query: string, locale: 'th' | 'en' = 'th'): boolean {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const { searchText } = toolPresentation(tool, locale);
	return words.every((word) => searchText.includes(word));
}
