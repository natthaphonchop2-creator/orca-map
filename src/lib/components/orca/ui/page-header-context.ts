import { getContext, setContext } from 'svelte';

// One H1 per page (W0). A frame that renders the page's header and tabs
// (ตั้งค่า, ประวัติ, AI ของฉัน) claims the header; a PageHeader inside it then
// shows only its action and status, never a second H1.

const KEY = Symbol('orca-page-header');

/** Call in a frame's script: the PageHeaders inside it become sub-headers. */
export function claimPageHeader(): void {
	setContext(KEY, true);
}

/** Whether a frame above this component already rendered the page's header. */
export function pageHeaderClaimed(): boolean {
	try {
		return getContext(KEY) === true;
	} catch {
		return false;
	}
}
