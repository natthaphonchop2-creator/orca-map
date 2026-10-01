// Step 2, เชื่อมบัญชี: signing the admin's own account in to a program. This is
// SourceSetup's sign-in logic (the popup reserved during the click, the
// focus/visibility check and the 3-second poll while a sign-in is pending)
// behind a page-sized view state, so the add-program page and program detail
// use it in place, without SourceSetup's disclosures.
//
// Dependencies come in through the constructor, so tests drive it without a
// browser. Nothing here decides access: the server checks every call.
import type { OrcaSourceSetup } from '../services/orca';

export type ConnectorService = {
	sourceSetup(id: string): Promise<OrcaSourceSetup>;
	configureSource(id: string, values: Record<string, string>, url?: string): Promise<OrcaSourceSetup>;
	checkSource(id: string): Promise<{ ready: boolean; oauthRequired: boolean }>;
	startSourceOAuth(id: string): Promise<{ oauthURL: string }>;
	disconnectSourceOAuth(id: string): Promise<{ disconnected: boolean }>;
};

export type ConnectorDeps = {
	service: ConnectorService;
	/** Plain-language text for a failed call. */
	errorText: (cause: unknown) => string;
	t: (th: string, en: string) => string;
	/** The program's name in copy ("ลงชื่อเข้าใช้ FlowAccount"). */
	programName: () => string;
	/** Program-specific reasons the account cannot be connected yet (a provider review). */
	blocked?: (setup: OrcaSourceSetup) => boolean;
	/** The browser, for the sign-in window and the checks on return. */
	browser?: {
		open(url: string, target: string): Window | null;
		setInterval(callback: () => void, ms: number): unknown;
		clearInterval(handle: unknown): void;
		addEventListener(type: 'focus', listener: () => void): void;
		removeEventListener(type: 'focus', listener: () => void): void;
		visible(): boolean;
		onVisibility(listener: () => void): () => void;
	};
	/** The account works: step 2 moves on (discovers the tools). */
	onready?: (sourceID: string) => Promise<void> | void;
};

export type ConnectorPhase =
	| 'idle'
	| 'loading'
	| 'failed'
	| 'unavailable'
	| 'fields'
	| 'signin'
	| 'waiting'
	| 'connected'
	| 'check'
	| 'reconnect'
	| 'ready';

type Action = '' | 'configure' | 'check' | 'return' | 'oauth' | 'disconnect';

/** Only https (or a local http address) without credentials may open as a sign-in page. */
export function safeSignInURL(raw: string): string | undefined {
	try {
		const url = new URL(raw);
		const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
		if ((url.protocol === 'https:' || local) && !url.username && !url.password) return url.href;
	} catch {
		// Invalid upstream URLs never become clickable.
	}
	return undefined;
}

/** A program's own account address: https, no credentials, query or fragment. */
export function validAccountURL(raw: string): boolean {
	try {
		const url = new URL(raw);
		const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
		return (url.protocol === 'https:' || local) && !url.username && !url.password && !url.search && !url.hash;
	} catch {
		return false;
	}
}

export class ProgramConnector {
	setup = $state<OrcaSourceSetup>();
	sourceID = $state('');
	loading = $state(false);
	action = $state<Action>('');
	error = $state('');
	oauthURL = $state('');
	windowOpened = $state(false);
	ready = $state(false);
	oauthRequired = $state(false);
	/** Changing a key-based account's details. */
	editing = $state(false);

	#deps: ConnectorDeps;
	#generation = 0;
	#alive = true;
	#reserved: Window | null = null;

	constructor(deps: ConnectorDeps) {
		this.#deps = deps;
	}

	get busy() {
		return this.loading || this.action !== '';
	}
	get fields() {
		return this.setup?.fields ?? [];
	}
	get requiresURL() {
		return Boolean(this.setup?.requiresURL);
	}
	get configured() {
		return Boolean(this.setup?.configured);
	}
	/** Signing in needs nothing typed first. */
	get directSignIn() {
		return Boolean(this.setup && !this.requiresURL && !this.fields.some((field) => field.required));
	}
	/** The ORCA team still has to set the program up (its OAuth app, or a provider review). */
	get unavailable() {
		const setup = this.setup;
		if (!setup) return false;
		const needsApp = Boolean(setup.oauthClientRequired && !setup.oauthClientConfigured);
		// A record saved with no field reads as configured: only a grant (or a
		// saved key, where the program takes one) is an account to keep.
		const review = setup.setupStatus === 'review_required' && !(setup.oauthSupported ? setup.oauthConnected : setup.configured);
		return needsApp || review || Boolean(this.#deps.blocked?.(setup));
	}
	get signInAvailable() {
		const setup = this.setup;
		return Boolean(
			setup?.oauthSupported &&
				(this.directSignIn || (!this.fields.length && !this.requiresURL) || setup.oauthConnected || this.oauthRequired || this.oauthURL)
		);
	}
	/** Signed in before, with this person's own account. */
	get alreadyConnected() {
		const setup = this.setup;
		return Boolean(setup && (setup.oauthConnected || (setup.configured && (this.fields.length > 0 || this.requiresURL))));
	}

	/** What step 2 shows. */
	get phase(): ConnectorPhase {
		if (!this.sourceID) return 'idle';
		if (this.loading) return 'loading';
		if (!this.setup) return 'failed';
		if (this.unavailable) return 'unavailable';
		if (this.editing || (!this.configured && !this.directSignIn)) return 'fields';
		if (this.ready) return 'ready';
		if (this.oauthURL) return 'waiting';
		if (this.signInAvailable && this.setup.oauthConnected && this.oauthRequired) return 'reconnect';
		if (this.signInAvailable && !this.setup.oauthConnected) return 'signin';
		return this.alreadyConnected ? 'connected' : 'check';
	}

	#request(id = this.sourceID) {
		return { generation: ++this.#generation, sourceID: id };
	}
	#current(request: { generation: number; sourceID: string }) {
		return this.#alive && request.generation === this.#generation && request.sourceID === this.sourceID;
	}
	#clear() {
		this.ready = false;
		this.oauthRequired = false;
		this.oauthURL = '';
		this.windowOpened = false;
		this.error = '';
	}

	/** Loads a program's setup (a new program resets everything). */
	async load(id = this.sourceID) {
		this.#closeReserved();
		const request = this.#request(id);
		this.sourceID = id;
		this.loading = Boolean(id);
		this.action = '';
		this.#clear();
		this.setup = undefined;
		this.editing = false;
		if (!id) return;
		try {
			const setup = await this.#deps.service.sourceSetup(id);
			if (this.#current(request)) this.setup = setup;
		} catch (cause) {
			if (this.#current(request)) this.error = this.#deps.errorText(cause);
		} finally {
			if (this.#current(request)) this.loading = false;
		}
	}

	async #check(request: { generation: number; sourceID: string }, metadata?: OrcaSourceSetup) {
		const result = await this.#deps.service.checkSource(request.sourceID);
		if (!this.#current(request)) return;
		const latest = metadata ?? (await this.#deps.service.sourceSetup(request.sourceID));
		if (!this.#current(request)) return;
		this.setup = latest;
		this.oauthRequired = result.oauthRequired;
		if (result.ready && !result.oauthRequired) {
			await this.#deps.onready?.(request.sourceID);
			if (!this.#current(request)) return;
			this.ready = true;
			this.oauthURL = '';
		} else if (!this.oauthRequired) {
			if (this.fields.length || this.requiresURL) this.editing = true;
			const { t } = this.#deps;
			this.error = t(
				`${this.#deps.programName()} ยังไม่รับบัญชีนี้ ตรวจข้อมูลแล้วลองอีกครั้ง`,
				`${this.#deps.programName()} did not accept this account. Check the details and try again.`
			);
		}
	}

	// A window is opened during the click, so a popup blocker never stops the
	// sign-in page; the program's page never gets a handle on ORCA.
	#reserve(): Window | null {
		this.#closeReserved();
		const browser = this.#deps.browser;
		const setup = this.setup;
		if (!browser || !setup?.oauthSupported || setup.oauthConnected || this.fields.some((field) => field.key.toLowerCase() === 'authorization' && field.required))
			return null;
		try {
			const popup = browser.open('about:blank', '_blank');
			if (!popup) return null;
			this.#reserved = popup;
			popup.opener = null;
			const { t } = this.#deps;
			popup.document.title = t('กำลังเชื่อม · ORCA', 'Connecting · ORCA');
			popup.document.body.textContent = t(
				`กำลังเปิดหน้าลงชื่อเข้าใช้ ${this.#deps.programName()}…`,
				`Opening the ${this.#deps.programName()} sign-in page…`
			);
			return popup;
		} catch {
			this.#closeReserved();
			return null;
		}
	}
	#closeReserved(popup = this.#reserved) {
		if (!popup || popup !== this.#reserved) return;
		try {
			popup.close();
		} catch {
			// Already closed.
		}
		this.#reserved = null;
	}

	async #connect(request: { generation: number; sourceID: string }, popup: Window | null, usingToken = false) {
		await this.#check(request);
		if (!this.#current(request) || this.ready || !this.oauthRequired || this.setup?.oauthConnected) return;
		if (usingToken || this.fields.some((field) => field.key.toLowerCase() === 'authorization' && field.required)) {
			this.editing = true;
			const { t } = this.#deps;
			this.error = t(
				`${this.#deps.programName()} ยังไม่รับคีย์นี้ ตรวจคีย์และสิทธิ์ของบัญชีแล้วลองอีกครั้ง`,
				`${this.#deps.programName()} did not accept this key. Check the key and the account's permissions.`
			);
			return;
		}
		if (!this.setup?.oauthSupported || this.unavailable) return;
		const result = await this.#deps.service.startSourceOAuth(request.sourceID);
		if (!this.#current(request)) return;
		if (!result.oauthURL) {
			await this.#check(request);
			return;
		}
		const url = safeSignInURL(result.oauthURL);
		if (!url) {
			const { t } = this.#deps;
			this.error = t('ลิงก์ลงชื่อเข้าใช้ที่ได้รับไม่ถูกต้อง แจ้งทีม ORCA', 'The sign-in link is not valid. Tell the ORCA team.');
			return;
		}
		this.oauthURL = url;
		this.oauthRequired = true;
		if (popup && popup === this.#reserved && !popup.closed) {
			try {
				popup.location.replace(url);
				this.#reserved = null;
				this.windowOpened = true;
			} catch {
				// The link stays available as "เปิดหน้าต่างอีกครั้ง".
			}
		}
	}

	async #run(action: Action, work: (request: { generation: number; sourceID: string }) => Promise<void>, popup: Window | null = null) {
		const request = this.#request();
		this.action = action;
		this.#clear();
		try {
			await work(request);
		} catch (cause) {
			if (this.#current(request)) {
				this.error = this.#deps.errorText(cause);
				if (this.fields.length || this.requiresURL) this.editing = this.editing || action === 'configure';
			}
		} finally {
			this.#closeReserved(popup);
			if (this.#current(request)) this.action = '';
		}
	}

	/** "ลงชื่อเข้าใช้ {โปรแกรม}": opens the program's sign-in page. */
	signIn() {
		if (this.busy || !this.setup?.oauthSupported || this.setup.oauthConnected || this.unavailable) return Promise.resolve();
		if (!this.configured && !this.directSignIn) return Promise.resolve();
		const popup = this.#reserve();
		return this.#run(
			'oauth',
			async (request) => {
				if (!this.configured) {
					const prepared = await this.#deps.service.configureSource(request.sourceID, {});
					if (!this.#current(request)) return;
					this.setup = prepared;
					if (!prepared.configured || !prepared.oauthSupported || this.unavailable) {
						const { t } = this.#deps;
						this.error = t(
							`ยังเชื่อม ${this.#deps.programName()} ไม่ได้ ลองอีกครั้งหรือแจ้งทีม ORCA`,
							`${this.#deps.programName()} is not ready to connect. Try again or tell the ORCA team.`
						);
						return;
					}
				}
				await this.#connect(request, popup);
			},
			popup
		);
	}

	/**
	 * "เชื่อมต่อ" with typed keys (and the account's own address, when the program
	 * needs one). Resolves true once the keys were sent, so the page can forget
	 * them whatever the answer; false when nothing left the page.
	 */
	async configure(values: Record<string, string>, accountURL = ''): Promise<boolean> {
		if (this.busy || !this.setup || this.unavailable) return false;
		const { t } = this.#deps;
		if (this.requiresURL && !validAccountURL(accountURL.trim())) {
			this.error = t(
				'กรอกที่อยู่บัญชีที่ขึ้นต้นด้วย https:// โดยไม่มีรหัสผ่านในที่อยู่',
				'Enter the account address starting with https://, without a password in it.'
			);
			return false;
		}
		const missing = this.fields.find((field) => field.required && !values[field.key]?.trim());
		if (missing) {
			this.error = t(`กรอก ${missing.name || missing.key}`, `Enter ${missing.name || missing.key}`);
			return false;
		}
		const usingToken = Object.entries(values).some(([key, value]) => key.toLowerCase() === 'authorization' && value.trim());
		const popup = usingToken ? null : this.#reserve();
		await this.#run(
			'configure',
			async (request) => {
				const result = await this.#deps.service.configureSource(request.sourceID, values, this.requiresURL ? accountURL.trim() : undefined);
				if (!this.#current(request)) return;
				this.setup = result;
				this.editing = false;
				await this.#connect(request, popup, usingToken);
			},
			popup
		);
		return true;
	}

	/** "ใช้บัญชีนี้ต่อ" / "เชื่อมต่อ": checks the saved account and moves on. */
	verify() {
		if (this.busy || !this.setup || this.unavailable || this.editing) return Promise.resolve();
		if (!this.configured && !this.directSignIn) return Promise.resolve();
		const popup = this.#reserve();
		return this.#run(
			'check',
			async (request) => {
				if (!this.configured) {
					const prepared = await this.#deps.service.configureSource(request.sourceID, {});
					if (!this.#current(request)) return;
					this.setup = prepared;
				}
				await this.#connect(request, popup);
			},
			popup
		);
	}

	/** Signs the current account out of this program in ORCA ("ใช้บัญชีอื่น", or cancelling a pending sign-in). */
	disconnect() {
		if (this.busy || !this.setup?.oauthSupported || (!this.setup.oauthConnected && !this.oauthURL)) return Promise.resolve();
		return this.#run('disconnect', async (request) => {
			const result = await this.#deps.service.disconnectSourceOAuth(request.sourceID);
			if (!this.#current(request)) return;
			if (!result.disconnected) {
				const { t } = this.#deps;
				this.error = t('ตัดการเชื่อมต่อไม่สำเร็จ ลองอีกครั้ง', 'Could not disconnect. Try again.');
				return;
			}
			if (this.setup) this.setup = { ...this.setup, oauthConnected: false };
		});
	}

	/** "ลงชื่อเข้าใช้ใหม่": signs the old account out, then opens the sign-in page. */
	signInAgain() {
		if (this.busy || !this.setup?.oauthSupported || this.unavailable) return Promise.resolve();
		// The window is reserved now, while the click still counts.
		this.#closeReserved();
		const browser = this.#deps.browser;
		let popup: Window | null = null;
		try {
			popup = browser?.open('about:blank', '_blank') ?? null;
			if (popup) {
				popup.opener = null;
				this.#reserved = popup;
			}
		} catch {
			popup = null;
		}
		return this.#run(
			'oauth',
			async (request) => {
				if (this.setup?.oauthConnected) {
					const result = await this.#deps.service.disconnectSourceOAuth(request.sourceID);
					if (!this.#current(request)) return;
					if (!result.disconnected) throw new Error('not disconnected');
					if (this.setup) this.setup = { ...this.setup, oauthConnected: false };
				}
				await this.#connect(request, popup);
			},
			popup
		);
	}

	/** Changing a key-based account's details, or leaving that form. */
	edit(value: boolean) {
		if (this.busy) return;
		this.#generation += 1;
		this.#clear();
		this.editing = value;
	}

	/** After the sign-in window: the grant is saved, so check the account and move on. */
	async checkReturn() {
		if (!this.#alive || this.busy || !this.oauthURL || !this.setup?.oauthSupported || this.editing || this.unavailable) return;
		const request = this.#request();
		this.action = 'return';
		this.ready = false;
		this.error = '';
		try {
			const latest = await this.#deps.service.sourceSetup(request.sourceID);
			if (!this.#current(request)) return;
			this.setup = latest;
			if (!latest.oauthConnected || !latest.configured || !latest.oauthSupported || this.unavailable) return;
			this.oauthURL = '';
			this.oauthRequired = false;
			await this.#check(request, latest);
		} catch (cause) {
			if (this.#current(request)) this.error = this.#deps.errorText(cause);
		} finally {
			if (this.#current(request)) this.action = '';
		}
	}

	/**
	 * Checks when the person comes back to the page, and every 3 seconds while a
	 * sign-in is pending (embedded browsers may never fire focus). Returns the cleanup.
	 */
	watch(): () => void {
		const browser = this.#deps.browser;
		if (!browser) return () => {};
		const onReturn = () => {
			if (browser.visible()) void this.checkReturn();
		};
		browser.addEventListener('focus', onReturn);
		const stopVisibility = browser.onVisibility(onReturn);
		const timer = browser.setInterval(() => {
			if (this.oauthURL && browser.visible()) void this.checkReturn();
		}, 3000);
		return () => {
			browser.removeEventListener('focus', onReturn);
			stopVisibility();
			browser.clearInterval(timer);
		};
	}

	destroy() {
		this.#alive = false;
		this.#generation += 1;
		this.#closeReserved();
	}
}

/** The page's browser for a connector (undefined outside a browser). */
export function pageBrowser(): ConnectorDeps['browser'] {
	if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
	return {
		open: (url, target) => window.open(url, target),
		setInterval: (callback, ms) => window.setInterval(callback, ms),
		clearInterval: (handle) => window.clearInterval(handle as number),
		addEventListener: (type, listener) => window.addEventListener(type, listener),
		removeEventListener: (type, listener) => window.removeEventListener(type, listener),
		visible: () => document.visibilityState === 'visible',
		onVisibility: (listener) => {
			document.addEventListener('visibilitychange', listener);
			return () => document.removeEventListener('visibilitychange', listener);
		}
	};
}
