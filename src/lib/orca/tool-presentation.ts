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
	// LINE Messaging API v2 (design §14l). The English half is the tool's own
	// title, word for word, so the Thai one replaces only ORCA's own title.
	line_followers_get: ['ดูจำนวนเพื่อนและคนที่บล็อก', 'Get friend counts'],
	line_demographics_get: ['ดูเพศ อายุ และพื้นที่ของเพื่อน', 'Get friend demographics'],
	line_message_deliveries_get: ['ดูจำนวนข้อความที่ส่งในแต่ละวัน', 'Get messages sent on a day'],
	line_broadcast_stats_get: ['ดูสถิติการเปิดอ่านและคลิกของบรอดแคสต์', "Get a broadcast's opens and clicks"],
	line_profile_get: ['ดูชื่อ LINE ของลูกค้า', "Get a customer's LINE name"],
	line_richmenus_list: ['ดูริชเมนูทั้งหมด', 'List rich menus'],
	line_user_richmenu_get: ['ดูริชเมนูที่ลูกค้าคนหนึ่งเห็น', "Get a customer's rich menu"],
	line_push_text: ['ส่งข้อความถึงลูกค้า 1 คน', 'Send a text message to one customer'],
	line_broadcast_text: ['ส่งข้อความถึงเพื่อนทุกคน (บรอดแคสต์)', 'Send a text message to all friends'],
	line_default_richmenu_set: ['เปลี่ยนริชเมนูหลักของทุกคน', 'Set the default rich menu'],
	line_default_richmenu_clear: ['ยกเลิกริชเมนูหลักที่ตั้งผ่าน API', 'Clear the default rich menu'],
	line_user_richmenu_link: ['ตั้งริชเมนูให้ลูกค้า 1 คน', 'Set a rich menu for one customer'],
	line_user_richmenu_unlink: ['ให้ลูกค้า 1 คนกลับไปเห็นริชเมนูหลัก', "Remove one customer's own rich menu"],
	instagram_account_get: ['ดูข้อมูลบัญชี Instagram', 'Get Instagram account information'],
	instagram_media_list: ['อ่านโพสต์ล่าสุดของ Instagram', 'Read recent Instagram posts'],
	list_files: ['ดูรายการไฟล์', 'List files'],
	get_file: ['ดูข้อมูลไฟล์', 'Get file information'],
	read_file: ['อ่านไฟล์', 'Read file'],
	search_files: ['ค้นหาไฟล์', 'Search files'],
	list_recent_files: ['ดูไฟล์ล่าสุด', 'List recent files'],
	// Articles, and with knowledge library v2 uploaded files too.
	orca_knowledge_search: ['ค้นหาในคลังความรู้', 'Search knowledge'],
	orca_knowledge_read: ['อ่านจากคลังความรู้', 'Read from knowledge'],
	orca_template_list: ['ดูรายการคำสั่งสำเร็จรูป', 'List ready-made prompts'],
	orca_template_use: ['เตรียมคำสั่งสำเร็จรูปพร้อมความรู้ประกอบ', 'Prepare a ready-made prompt with its knowledge']
};

// One Thai line for ORCA's own LINE tools, whose descriptions are written in
// English for the AI. Shown only in Thai, and only with the Thai label above:
// a tool that brings its own title keeps its own description too.
const knownDescriptionsTh: Record<string, string> = {
	line_bot_get: 'ชื่อบัญชี รูป และ Basic ID ของ LINE OA นี้',
	line_message_quota_get: 'จำนวนข้อความที่ส่งได้ในแต่ละเดือนตามแพ็กเกจ',
	line_message_usage_get: 'จำนวนข้อความที่ส่งไปแล้วในเดือนนี้',
	line_followers_get: 'จำนวนเพื่อน คนที่ส่งถึงได้ และคนที่บล็อก ในวันที่เลือก (ตามเวลาญี่ปุ่น)',
	line_demographics_get: 'สัดส่วนเพื่อนตามเพศ อายุ พื้นที่ และระยะเวลาที่เป็นเพื่อน ต้องมีเพื่อน 20 คนขึ้นไป',
	line_message_deliveries_get: 'จำนวนข้อความที่ส่งในวันที่เลือก แยกตามวิธีส่ง',
	line_broadcast_stats_get: 'จำนวนคนที่ได้รับ เปิดอ่าน และคลิก ของบรอดแคสต์ที่ส่งผ่าน ORCA',
	line_profile_get: 'ชื่อที่แสดงใน LINE ของลูกค้า จากรหัสผู้ใช้ที่ขึ้นต้นด้วย U',
	line_richmenus_list: 'ริชเมนูที่สร้างผ่าน Messaging API และริชเมนูหลัก ไม่รวมที่สร้างใน LINE OA Manager',
	line_user_richmenu_get: 'ริชเมนูที่ตั้งให้ลูกค้าคนหนึ่งผ่าน Messaging API',
	line_push_text: 'ข้อความตัวอักษรถึงลูกค้าที่ระบุ ORCA ตรวจชื่อผู้รับกับ LINE อีกครั้งก่อนส่ง',
	line_broadcast_text: 'ข้อความตัวอักษรถึงเพื่อนทุกคนที่ไม่ได้บล็อก ใช้โควตาตามจำนวนผู้รับ และยกเลิกไม่ได้',
	line_default_richmenu_set: 'ตั้งริชเมนูที่สร้างผ่าน Messaging API เป็นริชเมนูหลักของเพื่อนทุกคน',
	line_default_richmenu_clear: 'เอาริชเมนูหลักที่ตั้งผ่าน API ออก บัญชีจะกลับไปใช้ริชเมนูจาก LINE OA Manager ถ้ามี',
	line_user_richmenu_link: 'ให้ลูกค้าคนหนึ่งเห็นริชเมนูของตัวเองแทนริชเมนูหลัก',
	line_user_richmenu_unlink: 'เอาริชเมนูเฉพาะของลูกค้าคนหนึ่งออก ให้กลับไปเห็นริชเมนูหลัก'
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
	const providerDescription = tool.description?.trim() || '';
	// A short provider-supplied description can be clearer than an API operation
	// name. Use it verbatim; longer instructions stay in the secondary detail.
	const conciseDescription = providerDescription.length <= 100 && !providerDescription.includes('\n') ? providerDescription : '';
	// A provider's own title wins, except the exact English title ORCA gave its
	// own tool: that one reads in the viewer's language. Any other title, even
	// on a tool with a known name, is shown as the provider wrote it.
	const ownTitle = !!title && !!translated && title === translated[1];
	const knownLabel = !!translated && (!title || ownTitle);
	const label =
		(ownTitle ? '' : title) || (translated ? translated[locale === 'th' ? 0 : 1] : conciseDescription || humanizeIdentifier(identifier));
	const descriptionTh = knownLabel && Object.hasOwn(knownDescriptionsTh, identifier) ? knownDescriptionsTh[identifier] : '';
	const description = (locale === 'th' && descriptionTh) || providerDescription;
	return {
		label,
		identifier,
		description,
		searchText: [label, identifier, description, providerDescription, descriptionTh, ...(translated || [])].join(' ').toLocaleLowerCase()
	};
}

export function matchesToolSearch(tool: PresentableTool, query: string, locale: 'th' | 'en' = 'th'): boolean {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const { searchText } = toolPresentation(tool, locale);
	return words.every((word) => searchText.includes(word));
}
