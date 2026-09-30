import type { OrcaApproval } from '$lib/services/orca';

export type ApprovalTone = 'waiting' | 'ok' | 'bad' | 'muted';

const tones: Record<OrcaApproval['status'], ApprovalTone> = {
	pending: 'waiting',
	running: 'waiting',
	succeeded: 'ok',
	failed: 'bad',
	rejected: 'muted',
	expired: 'muted'
};

export function approvalTone(status: OrcaApproval['status']): ApprovalTone {
	return tones[status] ?? 'muted';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

// Common field names in plain words, for the approver's decision (Thai first).
// A provider's own schema title wins; anything else reads as spaced words.
const knownFields: Record<string, readonly [string, string]> = {
	customer: ['ลูกค้า', 'Customer'], customer_name: ['ชื่อลูกค้า', 'Customer name'], customer_id: ['รหัสลูกค้า', 'Customer ID'],
	contact: ['ผู้ติดต่อ', 'Contact'], contact_name: ['ชื่อผู้ติดต่อ', 'Contact name'], company: ['บริษัท', 'Company'],
	items: ['รายการ', 'Items'], item: ['รายการ', 'Item'], lines: ['รายการ', 'Lines'], line_items: ['รายการ', 'Line items'],
	products: ['สินค้า', 'Products'], product: ['สินค้า', 'Product'], product_name: ['ชื่อสินค้า', 'Product name'], sku: ['รหัสสินค้า', 'SKU'],
	name: ['ชื่อ', 'Name'], title: ['หัวข้อ', 'Title'], subject: ['หัวข้อ', 'Subject'], description: ['รายละเอียด', 'Description'],
	quantity: ['จำนวน', 'Quantity'], qty: ['จำนวน', 'Quantity'], unit: ['หน่วย', 'Unit'],
	price: ['ราคา', 'Price'], unit_price: ['ราคาต่อหน่วย', 'Unit price'], amount: ['จำนวนเงิน', 'Amount'], total: ['ยอดรวม', 'Total'],
	subtotal: ['ยอดก่อนภาษี', 'Subtotal'], discount: ['ส่วนลด', 'Discount'], vat: ['ภาษีมูลค่าเพิ่ม', 'VAT'], tax: ['ภาษี', 'Tax'],
	currency: ['สกุลเงิน', 'Currency'], date: ['วันที่', 'Date'], due_date: ['วันครบกำหนด', 'Due date'], issue_date: ['วันที่ออก', 'Issue date'],
	start: ['เริ่ม', 'Start'], end: ['สิ้นสุด', 'End'], start_date: ['วันเริ่ม', 'Start date'], end_date: ['วันสิ้นสุด', 'End date'],
	note: ['หมายเหตุ', 'Note'], notes: ['หมายเหตุ', 'Notes'], remark: ['หมายเหตุ', 'Remark'], remarks: ['หมายเหตุ', 'Remarks'],
	message: ['ข้อความ', 'Message'], text: ['ข้อความ', 'Text'], body: ['เนื้อหา', 'Body'], content: ['เนื้อหา', 'Content'],
	email: ['อีเมล', 'Email'], to: ['ถึง', 'To'], cc: ['สำเนาถึง', 'Cc'], recipient: ['ผู้รับ', 'Recipient'], recipients: ['ผู้รับ', 'Recipients'],
	phone: ['โทรศัพท์', 'Phone'], address: ['ที่อยู่', 'Address'], city: ['เมือง', 'City'], zip: ['รหัสไปรษณีย์', 'Postcode'],
	channel: ['ช่อง', 'Channel'], status: ['สถานะ', 'Status'], id: ['รหัส', 'ID'], reference: ['เลขอ้างอิง', 'Reference'],
	query: ['คำค้น', 'Search'], file: ['ไฟล์', 'File'], file_name: ['ชื่อไฟล์', 'File name'], folder: ['โฟลเดอร์', 'Folder'],
	tags: ['แท็ก', 'Tags'], category: ['หมวดหมู่', 'Category'],
	// LINE Messaging API v2 (design §14l).
	user_id: ['รหัสผู้ใช้ LINE', 'LINE user ID'], recipient_name: ['ชื่อผู้รับ', 'Recipient name'],
	rich_menu_id: ['รหัสริชเมนู', 'Rich menu ID'], notification_disabled: ['ส่งแบบไม่มีเสียงแจ้งเตือน', 'Send without a notification sound'],
	request_id: ['รหัสคำขอของ LINE', 'LINE request ID']
};

type Schema = { title?: unknown; properties?: Record<string, unknown>; items?: unknown };
const schemaOf = (value: unknown): Schema | undefined => (isRecord(value) ? (value as Schema) : undefined);

/** A field's key as snake_case words: "unitPrice" and "Unit-Price" read as "unit_price". */
function fieldKey(key: string): string {
	return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase();
}

/** A field in words: the provider's own title, a known name, or the key as spaced words. */
export function argumentLabel(key: string, schema?: unknown, locale: 'th' | 'en' = 'th'): string {
	const title = schemaOf(schema)?.title;
	if (typeof title === 'string' && title.trim()) return title.trim();
	const known = knownFields[fieldKey(key)];
	if (known) return known[locale === 'en' ? 1 : 0];
	const words = fieldKey(key).split('_').filter(Boolean).join(' ');
	return words ? words[0].toUpperCase() + words.slice(1) : key;
}

type Labels = { locale: 'th' | 'en' };

// Text stays as written; a list of records reads one record per line; anything
// nested deeper is compact JSON, so nothing the manager approves is hidden.
function readable(value: unknown, schema: Schema | undefined, labels: Labels, nested = false): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') return String(value);
	if (nested) return JSON.stringify(value);
	if (Array.isArray(value)) {
		if (!value.length) return '—';
		const itemSchema = schemaOf(schema?.items);
		return value.every(isRecord)
			? value.map((item) => recordLine(item, itemSchema, labels)).join('\n')
			: value.map((item) => readable(item, undefined, labels, true)).join(', ');
	}
	return recordLine(value as Record<string, unknown>, schema, labels);
}

function recordLine(record: Record<string, unknown>, schema: Schema | undefined, labels: Labels): string {
	const entries = Object.entries(record);
	return entries.length
		? entries.map(([key, item]) => `${argumentLabel(key, schema?.properties?.[key], labels.locale)}: ${readable(item, undefined, labels, true)}`).join(' · ')
		: '—';
}

/**
 * Top-level fields as label and readable value, in the order the AI app sent
 * them. Labels come from the tool's input schema when it names them, else a
 * known word, so the approver never reads raw keys like "customer" or "qty".
 */
export function argumentEntries(value: unknown, inputSchema?: unknown, locale: 'th' | 'en' = 'th'): [string, string][] {
	if (value === null || value === undefined) return [];
	const labels = { locale };
	const schema = schemaOf(inputSchema);
	if (!isRecord(value)) return [['', readable(value, schema, labels)]];
	return Object.entries(value).map(([key, item]) => {
		const field = schemaOf(schema?.properties?.[key]);
		return [argumentLabel(key, field, locale), readable(item, field, labels)];
	});
}

export function pendingApprovals(items: OrcaApproval[]) {
	return items.filter((item) => item.status === 'pending');
}

// ---------------------------------------------------------------------------
// Why an approved request did not complete, in plain words (Thai first). The
// backend's categories are a closed set; LINE's (design §14l) say whether
// anything reached customers. An unknown category keeps the general sentence.
const failures: Record<string, readonly [string, string]> = {
	permission_denied: ['คนที่ขอไม่มีสิทธิ์ทำสิ่งนี้แล้ว', 'The requester is no longer allowed to do this'],
	invalid_arguments: ['ข้อมูลไม่ครบหรือไม่ถูกต้อง', 'The details were incomplete or invalid'],
	timeout: ['โปรแกรมตอบช้าเกินไป', 'The program took too long to answer'],
	upstream_error: ['โปรแกรมขัดข้อง', 'The program returned an error'],
	tool_changed: ['ผู้ให้บริการเปลี่ยนสิ่งนี้ ต้องตรวจใหม่ก่อน', 'The provider changed this; review it again first'],
	quota_exceeded: ['ใช้ครบจำนวนของวันนี้แล้ว', "Today's limit is used up"],
	canceled: ['งานถูกยกเลิกระหว่างทำ', 'The run was canceled'],
	audit_unconfirmed: ['ORCA บันทึกผลไม่สำเร็จ จึงยังไม่รู้ว่าทำไปแล้วหรือยัง', "ORCA couldn't record the result, so it doesn't know whether this ran"],
	provider_token: ['LINE ไม่รับคีย์ของ LINE OA นี้แล้ว (Channel access token หมดอายุหรือถูกยกเลิก) ออกคีย์ใหม่ใน LINE Developers แล้วบันทึกใน ORCA อีกครั้ง ยังไม่มีอะไรถูกส่ง', "LINE no longer accepts this LINE OA's channel access token. Issue a new one in LINE Developers and save it in ORCA. Nothing was sent."],
	provider_access: ['บัญชี LINE OA นี้ยังใช้ฟังก์ชันนี้ไม่ได้ บางฟังก์ชันต้องเป็นบัญชีที่ผ่านการยืนยันหรือแพ็กเกจที่รองรับ ยังไม่มีอะไรถูกส่ง', "This LINE OA can't use this feature yet; some need a verified account or a plan that includes it. Nothing was sent."],
	provider_not_found: ['LINE ไม่พบลูกค้าหรือริชเมนูนี้ใน LINE OA นี้ ลูกค้าอาจบล็อกบัญชีอยู่ หรือริชเมนูสร้างใน LINE OA Manager ซึ่งใช้ผ่าน ORCA ไม่ได้ ยังไม่มีอะไรถูกส่ง', "LINE found no such customer or rich menu for this LINE OA. The customer may have blocked it, or the rich menu was made in LINE OA Manager, which ORCA can't use. Nothing was sent."],
	provider_rejected: ['LINE ไม่รับคำขอนี้ ยังไม่มีอะไรถูกส่ง ตรวจว่ารหัสผู้ใช้มาจาก LINE OA นี้ และริชเมนูมีรูปแล้ว', 'LINE refused this, so nothing was sent. Check that the user ID comes from this LINE OA and that the rich menu has an image.'],
	provider_quota: ['ข้อความของ LINE OA เดือนนี้หมดแล้ว หรือถึงเพดานที่ตั้งไว้ ยังไม่มีอะไรถูกส่ง เพิ่มโควตาใน LINE OA Manager ก่อน', "This LINE OA has used this month's messages or reached its own limit. Nothing was sent. Add more in LINE OA Manager first."],
	provider_rate_limited: ['LINE จำกัดจำนวนครั้งต่อชั่วโมง (สถิติและบรอดแคสต์ได้ 60 ครั้งต่อชั่วโมง) รอสักครู่แล้วลองใหม่ ยังไม่มีอะไรถูกส่ง', 'LINE is limiting how often this can be called (statistics and broadcasts allow 60 an hour). Wait and try again. Nothing was sent.'],
	recipient_mismatch: ['ชื่อผู้รับที่อนุมัติไม่ตรงกับชื่อใน LINE ตอนนี้ ORCA จึงไม่ส่ง ให้ AI ตรวจชื่อลูกค้าใหม่แล้วขออนุมัติอีกครั้ง', "The approved recipient name no longer matches the customer's LINE name, so ORCA sent nothing. Have the AI look the customer up again and ask for a new approval."],
	unknown_outcome: ['LINE ไม่ตอบ ORCA จึงยังไม่รู้ว่าส่งแล้วหรือยัง อย่าขอส่งใหม่ กด “ลองอีกครั้ง (ไม่ส่งซ้ำ)” ได้ภายใน 23 ชั่วโมง ORCA ใช้รหัสกันส่งซ้ำเดิม ลูกค้าจะไม่ได้รับซ้ำ', "LINE didn't answer, so ORCA doesn't know whether it was sent. Don't ask to send it again: choose “Retry (no double send)” within 23 hours. ORCA reuses the same retry key, so customers never get it twice."],
	approval_required: ['การส่งหรือการเปลี่ยนใน LINE ต้องให้ผู้ดูแลอนุมัติใน ORCA ก่อน ยังไม่มีอะไรถูกส่ง', "Sending or changing anything in LINE needs a manager's approval in ORCA first. Nothing was sent."]
};

export function failureText(category?: string, locale: 'th' | 'en' = 'th'): string {
	const known = category && Object.hasOwn(failures, category) ? failures[category] : undefined;
	return (known ?? ['โปรแกรมแจ้งข้อผิดพลาด', 'The program reported an error'])[locale === 'en' ? 1 : 0];
}

// ---------------------------------------------------------------------------
// ORCA's own LINE connector (design §14l): its six writes are always held,
// and a send the approver reads as customers will read it.
export const LINE_SOURCE = 'default-orca-api-line-messaging';
const lineSends = ['line_push_text', 'line_broadcast_text'];
const lineWrites = [...lineSends, 'line_default_richmenu_set', 'line_default_richmenu_clear', 'line_user_richmenu_link', 'line_user_richmenu_unlink'];

/** The categories after which LINE may or may not have sent it: a retry with the same key is safe. */
export const RETRY_CATEGORIES = ['unknown_outcome', 'audit_unconfirmed', 'timeout', 'canceled'];
/** An hour inside the 24 that LINE keeps a retry key, and 4 runs in all, as the backend allows. */
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const MAX_RUNS = 4;
const RECENT_MS = 24 * 60 * 60 * 1000;

type ApprovalLike = Pick<OrcaApproval, 'id' | 'connectionID' | 'toolName' | 'status'> & Partial<Pick<OrcaApproval, 'arguments' | 'decidedAt' | 'errorCategory' | 'attempts'>>;
type ConnectionLike = { id: string; mcpID: string };

export type LineSend = {
	kind: 'push' | 'broadcast';
	/** Exactly what customers will read; shown as plain text, links not clickable. */
	text: string;
	recipientName?: string;
	/** "U1234…abcd": enough to tell customers apart without the whole ID. */
	recipientShort?: string;
	silent: boolean;
};

const lineConnection = (item: ApprovalLike, connections: readonly ConnectionLike[]) =>
	connections.some((connection) => connection.id === item.connectionID && connection.mcpID === LINE_SOURCE);

/** One of LINE's six writes on ORCA's own LINE connector. */
export function isLineWrite(item: ApprovalLike, connections: readonly ConnectionLike[]): boolean {
	return lineWrites.includes(item.toolName) && lineConnection(item, connections);
}

/** A LINE send's message and recipient, or undefined for anything else. */
export function lineSend(item: ApprovalLike, connections: readonly ConnectionLike[]): LineSend | undefined {
	if (!lineSends.includes(item.toolName) || !lineConnection(item, connections) || !isRecord(item.arguments)) return undefined;
	const args = item.arguments;
	if (typeof args.text !== 'string') return undefined;
	const silent = args.notificationDisabled === true;
	if (item.toolName === 'line_broadcast_text') return { kind: 'broadcast', text: args.text, silent };
	const userId = typeof args.userId === 'string' ? args.userId : '';
	return {
		kind: 'push',
		text: args.text,
		recipientName: typeof args.recipientName === 'string' ? args.recipientName : '',
		recipientShort: userId.length > 9 ? `${userId.slice(0, 5)}…${userId.slice(-4)}` : userId,
		silent
	};
}

const decided = (item: ApprovalLike) => (item.decidedAt ? Date.parse(item.decidedAt) : Number.NaN);

/**
 * "ลองอีกครั้ง (ไม่ส่งซ้ำ)": a LINE write whose outcome is unknown, within 23
 * hours of its first run and under 4 runs. The backend checks all of it again.
 */
export function canRetry(item: ApprovalLike, connections: readonly ConnectionLike[], now = Date.now()): boolean {
	const first = decided(item);
	return item.status === 'failed' && RETRY_CATEGORIES.includes(item.errorCategory ?? '') && isLineWrite(item, connections) &&
		Number.isFinite(first) && now - first < RETRY_WINDOW_MS && (item.attempts ?? 1) < MAX_RUNS;
}

/** JSON with sorted keys, so the same arguments compare equal in any order. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
	return JSON.stringify(value ?? null);
}

/**
 * The same LINE send (same connection, tool and arguments) that a manager
 * approved in the last 24 hours and that may have reached customers: a new
 * request is a new decision and would send it again.
 */
export function sameSendApproved(item: ApprovalLike, others: readonly ApprovalLike[], connections: readonly ConnectionLike[], now = Date.now()): ApprovalLike | undefined {
	if (!lineSend(item, connections)) return undefined;
	const key = canonical(item.arguments);
	return others.find((other) => {
		const when = decided(other);
		const reached = other.status === 'succeeded' || other.status === 'running' || (other.status === 'failed' && RETRY_CATEGORIES.includes(other.errorCategory ?? ''));
		return other.id !== item.id && other.connectionID === item.connectionID && other.toolName === item.toolName && reached &&
			Number.isFinite(when) && now - when < RECENT_MS && canonical(other.arguments) === key;
	});
}

type HubLike = { status?: string; writeMode?: string; connectionID?: string; toolNames?: string[]; sources?: { connectionID: string; toolNames: string[] }[] };

/**
 * A workspace whose AI may ask for something that waits for a manager: one in
 * approval mode, or one that offers a LINE write, which waits even in a
 * workspace set to run at once. Its members then see คำขอของฉัน.
 */
export function hubAsksApproval(hub: HubLike, connections: readonly ConnectionLike[]): boolean {
	if (hub.status === 'archived' || hub.status === 'deleted') return false;
	if (hub.writeMode === 'approval') return true;
	const sources = hub.sources ?? (hub.connectionID ? [{ connectionID: hub.connectionID, toolNames: hub.toolNames ?? [] }] : []);
	return sources.some((source) => source.toolNames.some((toolName) => isLineWrite({ id: '', connectionID: source.connectionID, toolName, status: 'pending' }, connections)));
}
