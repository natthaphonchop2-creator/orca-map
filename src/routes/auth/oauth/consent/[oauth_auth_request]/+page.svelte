<script lang="ts">
	import { resolve } from '$app/paths';
	import CatalogConfigureForm, {
		type CompositeLaunchFormData,
		type LaunchFormData
	} from '$lib/components/mcp/CatalogConfigureForm.svelte';
	import McpDeprecatedNotice from '$lib/components/mcp/McpDeprecatedNotice.svelte';
	import BetaLogo from '$lib/components/navbar/BetaLogo.svelte';
	import { HttpError } from '$lib/errors';
	import { initializeLocale, t } from '$lib/orca/locale.svelte';
	import { UserService, type OAuthConsent } from '$lib/services';
	import {
		convertCompositeInfoToLaunchFormData,
		convertCompositeLaunchFormDataToPayload,
		convertEnvHeadersToRecord,
		hasEditableConfiguration,
		hasSecretBinding,
		isDeprecatedMCPServer
	} from '$lib/services/user/mcp';
	import { ChevronDown, ExternalLink, SettingsIcon, ShieldAlertIcon } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import '$lib/components/orca/orca.css';

	type Props = {
		data: {
			consent: OAuthConsent;
		};
	};

	let { data }: Props = $props();
	let currentConsent = $state(untrack(() => data.consent));
	let configureForm = $state<LaunchFormData | CompositeLaunchFormData>();
	let configDialog = $state<ReturnType<typeof CatalogConfigureForm>>();
	let configError = $state('');
	let loadingConfig = $state(false);
	let savingConfig = $state(false);
	let hasConfiguredComposite = $state(false);

	const consent = $derived(currentConsent);
	const isCompositeMCPServer = $derived(consent.mcpServer?.manifest.runtime === 'composite');
	const requiresMCPConfiguration = $derived(
		consent.mcpConfigRequired || (isCompositeMCPServer && !hasConfiguredComposite)
	);
	const scopes = $derived(consent.scope?.split(' ').filter(Boolean) ?? []);
	const showMCPAuthNotice = $derived(consent.mcpAuthRequired || consent.userHasSecondLevelOAuthed);
	const deprecated = $derived(isDeprecatedMCPServer(consent.mcpServer));
	const hasConfigurableMCPConfiguration = $derived.by(() => {
		if (consent.mcpServer) {
			return hasEditableConfiguration(consent.mcpServer);
		}
		if (consent.mcpServerInstance) {
			return (consent.mcpServerInstance.multiUserConfig?.userDefinedHeaders ?? []).some(
				(header) => !hasSecretBinding(header)
			);
		}
		return false;
	});
	const clientCredentialSourceLabel = $derived(
		clientCredentialSourceLabelFor(consent.clientCredentialSource)
	);

	type DetailRow =
		| { label: string; type: 'text'; value: string; valueClass?: string }
		| { label: string; type: 'link'; value: string }
		| { label: string; type: 'scopes'; values: string[] };

	const details = $derived.by((): DetailRow[] => {
		const rows: DetailRow[] = [
			{
				label: t('แอปพลิเคชัน', 'Application'),
				type: 'text',
				value: consent.clientName,
				valueClass: 'wrap-break-word font-medium'
			}
		];

		if (consent.clientURI) {
			rows.push({
				label: t('URL ของแอปพลิเคชัน', 'Application URL'),
				type: 'link',
				value: consent.clientURI
			});
		}

		rows.push({
			label: t('ประเภทไคลเอนต์ OAuth', 'OAuth client'),
			type: 'text',
			value: clientCredentialSourceLabel,
			valueClass: 'wrap-break-word'
		});

		rows.push({
			label: t('URL สำหรับส่งกลับ', 'Redirect URL'),
			type: 'text',
			value: consent.redirectURI,
			valueClass: 'break-all'
		});

		if (scopes.length) {
			rows.push({ label: t('สิทธิ์ที่ขอ', 'Requested scopes'), type: 'scopes', values: scopes });
		}

		if (consent.mcpAuthRequired || consent.userHasSecondLevelOAuthed) {
			rows.push({
				label: t('ระบบ', 'System'),
				type: 'text',
				value: consent.mcpServerName ?? '',
				valueClass: 'wrap-break-word'
			});
			rows.push({
				label: t('การลงชื่อเข้าใช้กับระบบ (OAuth)', 'System sign-in (OAuth)'),
				type: 'text',
				value: consent.userHasSecondLevelOAuthed
					? t('อนุญาตแล้ว', 'Already authorized')
					: t('ต้องได้รับอนุญาต', 'Authorization required'),
				valueClass: 'wrap-break-word'
			});

			if (consent.mcpServerURL) {
				rows.push({
					label: t('URL ของระบบ (MCP)', 'System URL (MCP)'),
					type: 'text',
					value: consent.mcpServerURL,
					valueClass: 'break-all'
				});
			}

			if (consent.thirdPartyAuthURL) {
				rows.push({
					label: t('URL สำหรับลงชื่อเข้าใช้ (OAuth)', 'Sign-in URL (OAuth)'),
					type: 'text',
					value: consent.thirdPartyAuthURL,
					valueClass: 'break-all'
				});
			}
		}

		if (consent.policyURI) {
			rows.push({
				label: t('นโยบายความเป็นส่วนตัว', 'Privacy policy'),
				type: 'link',
				value: consent.policyURI
			});
		}

		if (consent.tosURI) {
			rows.push({
				label: t('ข้อกำหนดการใช้งาน', 'Terms of service'),
				type: 'link',
				value: consent.tosURI
			});
		}

		return rows;
	});

	onMount(() => {
		initializeLocale();
		if (requiresMCPConfiguration) {
			void loadMCPConfiguration(currentConsent);
		}
	});

	async function loadMCPConfiguration(nextConsent: OAuthConsent) {
		loadingConfig = true;
		configError = '';
		try {
			let values: Record<string, string> = {};
			if (nextConsent.mcpServerInstance?.id) {
				values = await revealExistingConfiguration(() =>
					UserService.revealMcpServerInstance(nextConsent.mcpServerInstance!.id, {
						dontLogErrors: true
					})
				);
				configureForm = {
					headers: nextConsent.mcpServerInstance.multiUserConfig?.userDefinedHeaders?.map(
						(header) => ({
							...header,
							value: values[header.key] ?? '',
							isStatic: false
						})
					)
				};
			} else if (nextConsent.mcpServer?.id) {
				if (nextConsent.mcpServer.manifest.runtime === 'composite') {
					configureForm = await convertCompositeInfoToLaunchFormData(nextConsent.mcpServer);
					return;
				}

				values = await revealExistingConfiguration(() =>
					UserService.revealSingleOrRemoteMcpServer(nextConsent.mcpServer!.id, {
						dontLogErrors: true
					})
				);
				configureForm = {
					envs: nextConsent.mcpServer.manifest.env?.map((env) => ({
						...env,
						value: values[env.key] ?? ''
					})),
					headers: nextConsent.mcpServer.manifest.remoteConfig?.headers?.map((header) => ({
						...header,
						value: values[header.key] ?? '',
						isStatic: Boolean(header.value)
					})),
					url: nextConsent.mcpServer.manifest.remoteConfig?.url,
					hostname: nextConsent.mcpServer.manifest.remoteConfig?.hostname
				};
			}
		} catch (_err) {
			configureForm = undefined;
			configError = t(
				'โหลดการตั้งค่าปัจจุบันของระบบไม่สำเร็จ กรุณาลองอีกครั้ง',
				'Could not load the current system configuration. Please try again.'
			);
		} finally {
			loadingConfig = false;
		}
	}

	async function openMCPConfiguration() {
		if (!configureForm) {
			await loadMCPConfiguration(consent);
		}
		if (!configureForm) return;
		await tick();
		configDialog?.open();
	}

	async function revealExistingConfiguration(
		reveal: () => Promise<Record<string, string>>
	): Promise<Record<string, string>> {
		try {
			return await reveal();
		} catch (err) {
			if (err instanceof HttpError && err.statusCode === 404) {
				return {};
			}
			throw err;
		}
	}

	async function saveMCPConfiguration() {
		if (!configureForm) return;

		configError = '';
		savingConfig = true;
		try {
			if (consent.mcpServerInstance?.id) {
				if (isCompositeForm(configureForm)) {
					throw new Error(
						t(
							'รูปแบบการตั้งค่าไม่ตรงกับระบบนี้',
							'The configuration does not match this system.'
						)
					);
				}
				const payload = convertEnvHeadersToRecord(undefined, configureForm.headers);
				await UserService.configureMcpServerInstance(consent.mcpServerInstance.id, payload);
			} else if (consent.mcpServer?.id) {
				if (isCompositeForm(configureForm)) {
					const payload = convertCompositeLaunchFormDataToPayload(configureForm);
					await UserService.configureCompositeMcpServer(consent.mcpServer.id, payload);
					hasConfiguredComposite = true;
				} else {
					const payload = convertEnvHeadersToRecord(configureForm.envs, configureForm.headers);
					if (configureForm.hostname && configureForm.url) {
						payload.__url = configureForm.url.trim();
					}
					await UserService.configureSingleOrRemoteMcpServer(consent.mcpServer.id, payload);
				}
			} else {
				throw new Error(
					t('ไม่พบระบบที่ต้องตั้งค่า', 'The system to configure could not be found.')
				);
			}
			const nextConsent = await UserService.getOAuthConsent(consent.authRequestID);
			currentConsent = nextConsent;
			if (nextConsent.mcpConfigRequired) {
				await loadMCPConfiguration(nextConsent);
				configError = t(
					'บันทึกการตั้งค่าแล้ว แต่ยังมีการตั้งค่าที่จำเป็นอื่นที่ยังไม่ได้กรอก',
					'The configuration was saved, but other required settings are still missing.'
				);
			} else {
				configureForm = undefined;
				configDialog?.close();
			}
		} catch (err) {
			configError =
				err instanceof Error
					? err.message
					: t(
							'บันทึกการตั้งค่าของระบบไม่สำเร็จ กรุณาลองอีกครั้ง',
							'Could not save the system configuration. Please try again.'
						);
		} finally {
			savingConfig = false;
		}
	}

	function isCompositeForm(
		form: LaunchFormData | CompositeLaunchFormData
	): form is CompositeLaunchFormData {
		return 'componentConfigs' in form;
	}

	function clientCredentialSourceLabelFor(source: OAuthConsent['clientCredentialSource']) {
		switch (source) {
			case 'client_id_metadata_document':
				return t('เอกสารข้อมูล Client ID', 'Client ID metadata document');
			case 'static_client_credentials':
				return t('ข้อมูลรับรองไคลเอนต์ที่กำหนดไว้', 'Static client credentials');
			case 'dynamic_client':
				return t('ไคลเอนต์ที่ลงทะเบียนอัตโนมัติ', 'Dynamically registered client');
			default:
				return t('ไม่ทราบ', 'Unknown');
		}
	}
</script>

<svelte:head>
	<title>{t('อนุญาตการเข้าถึง · ORCA', 'Authorize access · ORCA')}</title>
</svelte:head>

<div class="orca oauth-page">
	<main class="oauth-card">
		<BetaLogo class="oauth-logo" />
		<h1>
			{requiresMCPConfiguration
				? t(
						`ตั้งค่า ${consent.mcpServerName || 'ระบบ'}`,
						`Configure ${consent.mcpServerName || 'the system'}`
					)
				: t(
						`อนุญาตให้ ${consent.clientName} เข้าถึง ORCA`,
						`Authorize ${consent.clientName} to access ORCA`
					)}
		</h1>

		{#if requiresMCPConfiguration}
			<section class="oauth-body">
				<McpDeprecatedNotice {deprecated} variant="notification" />

				<div class="oauth-note">
					<SettingsIcon class="size-4 shrink-0" />
					<p>
						{#if isCompositeMCPServer && !hasConfiguredComposite}
							{t('ตั้งค่า', 'Configure')}
							<b>{consent.mcpServerName || t('ระบบนี้', 'this system')}</b>
							{t(
								'เพื่อเลือกระบบที่จะใช้ก่อนดำเนินการต่อ',
								'to choose which systems to use before continuing.'
							)}
						{:else}
							<b>{consent.mcpServerName || t('ระบบนี้', 'This system')}</b>
							{t(
								'ต้องได้รับการตั้งค่าที่จำเป็นก่อน ORCA จึงจะอนุญาตการเชื่อมต่อนี้ได้',
								'requires configuration before ORCA can finish authorizing this connection.'
							)}
						{/if}
					</p>
				</div>

				{#if configError}
					<p class="oauth-error">{configError}</p>
				{/if}
			</section>
		{:else}
			<section class="oauth-body">
				<McpDeprecatedNotice {deprecated} variant="notification" />

				{#if showMCPAuthNotice}
					<div class="oauth-note">
						<ShieldAlertIcon class="size-4 shrink-0" />
						<p>
							{#if consent.mcpAuthRequired}
								<b>{consent.mcpServerName || t('ระบบนี้', 'This system')}</b>
								{t(
									'กำหนดให้ลงชื่อเข้าใช้ด้วยบัญชีของระบบนั้นเพิ่มเติม ORCA จะนำคุณไปยังหน้าลงชื่อเข้าใช้ของผู้ให้บริการเพื่อดำเนินการให้เสร็จสิ้น',
									'requires you to sign in with that system’s account (OAuth). You will be redirected to the provider to complete sign-in.'
								)}
							{:else if consent.userHasSecondLevelOAuthed}
								<b>{consent.mcpServerName || t('ระบบนี้', 'This system')}</b>
								{t(
									'กำหนดให้ลงชื่อเข้าใช้ด้วยบัญชีของระบบนั้น และคุณได้อนุญาตไว้แล้ว',
									'requires you to sign in with that system’s account (OAuth), and you have already authorized it.'
								)}
							{/if}
						</p>
					</div>
				{/if}

				{#if hasConfigurableMCPConfiguration}
					<div class="oauth-config">
						<SettingsIcon class="size-4 shrink-0" />
						<p>
							{t('คุณสามารถแก้ไขการตั้งค่าของ', 'You can update the configuration for')}
							<b>{consent.mcpServerName || t('ระบบนี้', 'this system')}</b>
						</p>
						<button
							class="oauth-button small"
							type="button"
							onclick={openMCPConfiguration}
							disabled={loadingConfig || savingConfig}
						>
							<SettingsIcon class="size-4" />
							{loadingConfig ? t('กำลังโหลด…', 'Loading…') : t('ตั้งค่า', 'Configure')}
						</button>
					</div>
				{/if}

				{#if configError}
					<p class="oauth-error">{configError}</p>
				{/if}

				<p class="oauth-text">
					{t(
						`${consent.clientName} ขอสิทธิ์เข้าถึง ORCA ผ่านลิงก์เชื่อม AI (MCP URL) หากคุณอนุญาต ORCA จะนำคุณกลับไปยังแอปที่ส่งคำขอนี้`,
						`${consent.clientName} is requesting access to ORCA through the AI connection link (MCP URL). If you approve, ORCA will return you to the application that started this request.`
					)}
				</p>

				<details class="oauth-details" name="more-details-content">
					<summary
						>{t('ดูรายละเอียด', 'View details')}<ChevronDown
							class="oauth-chevron size-4 shrink-0"
						/></summary
					>

					<dl>
						{#each details as detail (detail.label)}
							<div>
								<dt>{detail.label}</dt>

								{#if detail.type === 'text'}
									<dd class={detail.valueClass ?? ''}>{detail.value}</dd>
								{:else if detail.type === 'link'}
									<dd>
										<a href={detail.value} rel="external noreferrer noopener">
											<span>{detail.value}</span>
											<ExternalLink class="size-3 shrink-0" />
										</a>
									</dd>
								{:else}
									<dd class="oauth-scopes">
										{#each detail.values as scope, i (i)}
											<span>{scope}</span>
										{/each}
									</dd>
								{/if}
							</div>
						{/each}
					</dl>
				</details>
			</section>
		{/if}

		<footer class="oauth-actions" class:configuring={requiresMCPConfiguration}>
			<form method="POST" action={resolve(consent.cancelURL as `/${string}`)}>
				<button class="oauth-button" type="submit" disabled={savingConfig}
					>{t('ยกเลิก', 'Cancel')}</button
				>
			</form>
			{#if requiresMCPConfiguration}
				<button
					class="oauth-button primary"
					type="button"
					onclick={openMCPConfiguration}
					disabled={loadingConfig || savingConfig}
				>
					<SettingsIcon class="size-4" />
					{loadingConfig ? t('กำลังโหลด…', 'Loading…') : t('ตั้งค่า', 'Configure')}
				</button>
			{:else}
				<form method="POST" action={resolve(consent.continueURL as `/${string}`)}>
					<button class="oauth-button primary" type="submit"
						>{t('อนุญาตและดำเนินการต่อ', 'Allow and continue')}</button
					>
				</form>
			{/if}
		</footer>
	</main>
</div>

<CatalogConfigureForm
	bind:this={configDialog}
	bind:form={configureForm}
	name={consent.mcpServerName || t('ระบบ', 'System')}
	onSave={saveMCPConfiguration}
	onCancel={() => configDialog?.close()}
	loading={savingConfig}
	error={configError}
	{deprecated}
	cancelText={t('ปิด', 'Close')}
	submitText={t('บันทึก', 'Save')}
	configurationTitle={t('การตั้งค่าระบบ', 'System configuration')}
	disableOutsideClick
/>

<style>
	/* Formal authorization card that matches the ORCA sign-in page. */
	.oauth-page {
		--orca-ink: #151823;
		--orca-surface: #ffffff;
		--orca-surface-2: #fafafa;
		--orca-secondary: #f4f4f5;
		--orca-line: #e5e7eb;
		--orca-line-strong: #d4d4d8;
		--orca-muted: #5b6270;
		--orca-subtle: #6b7280;
		--orca-nav: #3f4452;
		--orca-deny: #b3262f;
		--orca-deny-bg: #fdecee;
		--orca-radius: 8px;
		--orca-radius-lg: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px 16px;
		background: var(--orca-surface-2);
		color: var(--orca-ink);
		font-size: 14px;
		line-height: 1.6;
	}
	.oauth-page :focus-visible {
		outline: 2px solid var(--orca-ink);
		outline-offset: 2px;
	}
	.oauth-card {
		width: 100%;
		max-width: 480px;
		overflow: hidden;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-surface);
	}
	.oauth-card :global(.oauth-logo) {
		margin: 28px 28px 0;
	}
	.oauth-card h1 {
		margin: 16px 28px 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.oauth-body {
		display: grid;
		gap: 16px;
		padding: 16px 28px 24px;
	}
	.oauth-note,
	.oauth-config {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface-2);
		font-size: 13.5px;
		line-height: 1.6;
	}
	.oauth-note :global(svg),
	.oauth-config :global(svg) {
		margin-top: 2px;
		color: var(--orca-subtle);
	}
	.oauth-note p,
	.oauth-config p {
		flex: 1;
		min-width: 0;
		margin: 0;
	}
	.oauth-note b,
	.oauth-config b {
		font-weight: 600;
	}
	.oauth-config {
		flex-wrap: wrap;
		align-items: center;
		background: var(--orca-surface);
		color: var(--orca-muted);
		font-size: 13px;
	}
	.oauth-config p {
		min-width: 200px;
	}
	.oauth-error {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid color-mix(in srgb, var(--orca-deny) 28%, transparent);
		border-radius: var(--orca-radius);
		background: var(--orca-deny-bg);
		color: var(--orca-deny);
		font-size: 13.5px;
	}
	.oauth-text {
		margin: 0;
		line-height: 1.7;
	}
	.oauth-details {
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
	}
	.oauth-details summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 14px;
		color: var(--orca-muted);
		font-size: 13px;
		font-weight: 500;
		list-style: none;
		cursor: pointer;
	}
	.oauth-details summary::-webkit-details-marker {
		display: none;
	}
	.oauth-details summary:hover {
		color: var(--orca-ink);
	}
	.oauth-details[open] :global(.oauth-chevron) {
		transform: rotate(180deg);
	}
	.oauth-details dl {
		max-height: 16rem;
		margin: 0;
		padding: 0 14px;
		overflow-y: auto;
		border-top: 1px solid var(--orca-line);
	}
	.oauth-details dl > div {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		gap: 4px 12px;
		padding: 8px 0;
		border-bottom: 1px solid #eff0f2;
		font-size: 13px;
	}
	.oauth-details dl > div:last-child {
		border-bottom: 0;
	}
	.oauth-details dt {
		color: var(--orca-muted);
	}
	.oauth-details dd {
		min-width: 0;
		margin: 0;
		color: var(--orca-ink);
	}
	.oauth-details dd a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 100%;
		color: var(--orca-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		word-break: break-all;
	}
	.oauth-scopes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.oauth-scopes span {
		padding: 1px 8px;
		border-radius: 6px;
		background: var(--orca-secondary);
		color: var(--orca-nav);
		font-size: 12px;
		font-weight: 500;
	}
	.oauth-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 14px 28px;
		border-top: 1px solid var(--orca-line);
		background: var(--orca-surface-2);
	}
	.oauth-actions.configuring {
		border-top: 0;
	}
	.oauth-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 14px;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius);
		background: var(--orca-surface);
		color: var(--orca-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
	.oauth-button:hover:not(:disabled) {
		border-color: var(--orca-line-strong);
		background: var(--orca-secondary);
	}
	.oauth-button.primary {
		border-color: transparent;
		background: var(--orca-ink);
		color: white;
		font-weight: 600;
	}
	.oauth-button.primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--orca-ink) 86%, white);
	}
	.oauth-button.small {
		min-height: 32px;
		padding: 0 10px;
		font-size: 13px;
	}
	.oauth-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	@media (max-width: 480px) {
		.oauth-card :global(.oauth-logo) {
			margin: 24px 20px 0;
		}
		.oauth-card h1 {
			margin-inline: 20px;
		}
		.oauth-body {
			padding: 16px 20px 20px;
		}
		.oauth-details dl > div {
			grid-template-columns: minmax(0, 1fr);
		}
		.oauth-actions {
			flex-direction: column-reverse;
			padding: 14px 20px;
		}
		.oauth-actions form,
		.oauth-actions .oauth-button {
			width: 100%;
		}
	}
</style>
