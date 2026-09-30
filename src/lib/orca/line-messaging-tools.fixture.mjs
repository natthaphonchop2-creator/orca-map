// ORCA's LINE Messaging API tools as the backend lists them (C4 §14l,
// pkg/mcp/orca_api_line.go on claude/line-messaging): the three v1 reads
// unchanged, seven new reads and six writes. The SDK drops a false
// readOnlyHint, so the writes carry none, and each write carries the
// always-approve mark. Tests only; descriptions are shortened.
const empty = { type: 'object', properties: {}, additionalProperties: false };
const object = (required, properties) => ({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false });
const userId = { type: 'string', pattern: '^U[0-9a-f]{32}$', description: "The customer's LINE user ID for this LINE Official Account." };
const richMenuId = { type: 'string', pattern: '^richmenu-[0-9a-f]{32}$', description: 'A rich menu ID from line_richmenus_list.' };
const date = { type: 'string', pattern: '^20[0-9]{6}$', description: "A day in LINE's time zone (Japan, UTC+9) as yyyyMMdd." };
const text = { type: 'string', minLength: 1, maxLength: 5000, description: 'The message exactly as customers will read it.' };
const silent = { type: 'boolean', description: 'true sends without a notification sound.' };

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const menuWrite = { destructiveHint: true, idempotentHint: true, openWorldHint: true };
const always = { 'orca.invalid/approval': 'always' };

function tool(name, title, description, inputSchema, annotations, meta) {
	const definition = { name, ...(title ? { title } : {}), description, inputSchema, annotations, ...(meta ? { _meta: meta } : {}) };
	return { name, description, inputSchema, definition };
}
const v1 = (name, description) => tool(name, '', description, empty, { readOnlyHint: true, idempotentHint: true });

export const lineTools = [
	v1('line_bot_get', 'Read the configured LINE Official Account profile.'),
	v1('line_message_quota_get', 'Read the LINE Official Account monthly message allowance.'),
	v1('line_message_usage_get', 'Read the LINE Official Account message usage for this month.'),
	tool('line_followers_get', 'Get friend counts', 'Read how many friends this LINE Official Account had on a day.', object([], { date }), read),
	tool('line_demographics_get', 'Get friend demographics', "Read the share of this LINE Official Account's friends by gender, age and area.", empty, read),
	tool('line_message_deliveries_get', 'Get messages sent on a day', 'Read how many messages this LINE Official Account sent on a day.', object([], { date }), read),
	tool('line_broadcast_stats_get', "Get a broadcast's opens and clicks", 'Read how many friends a broadcast reached, opened and clicked.', object(['requestId'], { requestId: { type: 'string' } }), read),
	tool('line_profile_get', "Get a customer's LINE name", "Look up a customer's current LINE display name from their user ID.", object(['userId'], { userId }), read),
	tool('line_richmenus_list', 'List rich menus', "List this LINE Official Account's rich menus and the default one for every friend.", empty, read),
	tool('line_user_richmenu_get', "Get a customer's rich menu", 'Read the rich menu one customer was given with the Messaging API.', object(['userId'], { userId }), read),
	tool('line_push_text', 'Send a text message to one customer', 'Send one text message to one customer. A manager must approve every send in ORCA.',
		object(['userId', 'recipientName', 'text'], { userId, recipientName: { type: 'string', minLength: 1, maxLength: 100 }, text, notificationDisabled: silent }),
		{ destructiveHint: false, openWorldHint: true }, always),
	tool('line_broadcast_text', 'Send a text message to all friends', 'Send one text message to every friend. A manager must approve it in ORCA first.',
		object(['text'], { text, notificationDisabled: silent }), { destructiveHint: true, openWorldHint: true }, always),
	tool('line_default_richmenu_set', 'Set the default rich menu', 'Make a rich menu the default for every friend. A manager must approve it in ORCA first.', object(['richMenuId'], { richMenuId }), menuWrite, always),
	tool('line_default_richmenu_clear', 'Clear the default rich menu', 'Remove the default rich menu set with the Messaging API. A manager must approve it in ORCA first.', empty, menuWrite, always),
	tool('line_user_richmenu_link', 'Set a rich menu for one customer', 'Give one customer their own rich menu. A manager must approve it in ORCA first.', object(['userId', 'richMenuId'], { userId, richMenuId }), menuWrite, always),
	tool('line_user_richmenu_unlink', "Remove one customer's own rich menu", 'Remove the rich menu one customer was given. A manager must approve it in ORCA first.', object(['userId'], { userId }), menuWrite, always)
];

export const lineReadNames = lineTools.slice(0, 10).map((item) => item.name);
export const lineWriteNames = lineTools.slice(10).map((item) => item.name);
