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
	tags: ['แท็ก', 'Tags'], category: ['หมวดหมู่', 'Category']
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
