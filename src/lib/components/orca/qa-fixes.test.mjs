import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The merged-branch QA round (W1): contracts that live in markup and CSS.
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the workspace list has one "เชื่อม AI ของฉัน" (the header); a row links only a workspace with its own sign-in', async () => {
	const list = await read('./AppOverview.svelte');
	assert.doesNotMatch(list, /เชื่อม AI กับ \$\{hub\.name\}/);
	assert.match(list, /\{#if hub\.userSourceID && hub\.status === 'active'\}<a[\s\S]*?hubHref\(hub, 'overview'\) \+ '#connect-ai'/);
	// Rows become cards by the list's own width, so the sidebar can't push the actions off screen.
	assert.match(list, /container: spaces \/ inline-size/);
	assert.match(list, /@container spaces \(max-width: 880px\)/);
});

test('sticky save bars keep keyboard focus in view, and the phone drawer closes on its backdrop and locks the page', async () => {
	const css = await read('./orca-system.css');
	assert.match(css, /html:has\(\.orca-workspace\.orca-app :is\(\.save-bar, \.ws-bar, \.sbar\)\) \{\s*scroll-padding-bottom: 150px;/);
	assert.match(css, /html:has\(\.orca-workspace\.orca-app \.workspace-drawer\[open\]\) \{\s*overflow: hidden;/);
	const shell = await read('./AppShell.svelte');
	assert.match(shell, /onclick=\{\(event\) => \{\s*if \(event\.target === drawer\) closeDrawer\(\);/);
	// W0: the company sits under the logo in the sidebar and in the phone drawer alike.
	assert.match(shell, /\{#if data && !compact\}[\s\S]*?<div class="workspace-company">/);
});

test('an "#accounts" link reaches the program sign-ins once they render', async () => {
	const view = await read('./views/ConnectAIView.svelte');
	assert.match(view, /anchorPending = window\.location\.hash === '#accounts'/);
	assert.match(view, /<ProgramSignIns \{data\} onshown=\{\(\) => requestAnimationFrame\(revealAccounts\)\} \/>/);
	const signIns = await read('./connect-ai/ProgramSignIns.svelte');
	assert.match(signIns, /if \(event\.status === 'loading' && known\?\.status === 'ready'\) return;/, 'rechecking keeps the rows (and the focus target) on screen');
});

test('ChatGPT\'s long menu path can wrap on a phone', async () => {
	assert.match(await read('./connect-ai/AppSteps.svelte'), /\{#snippet arrow\(\)\}<span class="ca-arrow" aria-hidden="true">→<\/span><wbr \/>\{\/snippet\}/);
});

test('someone who never signed in gets no empty "จัดการการเชื่อมต่อ", and their own account is named', async () => {
	const setup = await read('./SourceSetup.svelte');
	assert.match(setup, /\{#if !editing && manageActions && /);
	assert.match(setup, /t\(`บัญชี \$\{providerName\} ของคุณ`, `Your \$\{providerName\} account`\)/);
	// The operator's app set-up shows no account steps, and the callback URL copies in one click.
	assert.match(setup, /\{#if apiGuide && !connectionReady && !appSetupRequired\}/);
	assert.match(setup, /onclick=\{copyCallback\}/);
});

// Codex review 2 of deploy41: under review, step 2 offers no account switch (it
// signs the saved grant out before a sign-in the review stops).
test('step 2 offers no other account while the program waits for review', async () => {
	const account = await read('./programs/ProgramAccount.svelte');
	assert.match(account, /\{#if !connector\.underReview\}<button type="button" class="k-button quiet" onclick=\{useAnother\}>/);
	assert.match(account, /\{#if connector\.alreadyConnected && !connector\.underReview\}<button type="button" class="k-button small" onclick=\{useAnother\}>/);
	assert.match(account, /\{:else if phase === 'ready' && connector\.alreadyConnected && !connector\.underReview\}/);
	assert.equal((account.match(/onclick=\{useAnother\}/g) ?? []).length, 3, 'every switch button is guarded above');
});

test('the operator is sent where each unavailable program is handled, and the overview counts the catalog\'s waiting programs', async () => {
	const account = await read('./programs/ProgramAccount.svelte');
	assert.match(account, /\{#if operator && waitingForReview\}[\s\S]*?platformHref\('catalog'\)[\s\S]*?\{:else if operator\}[\s\S]*?platformHref\('oauth-apps'\)/);
	const overview = await read('./views/PlatformOverview.svelte');
	assert.match(overview, /catalogSummary\(catalog\)\.attention\.length/);
	assert.match(overview, /โปรแกรมในคลังรอทีม ORCA/);
});

test('an employee\'s settings history speaks of their own changes; the logo picker is a Thai button', async () => {
	const audit = await read('./Audit.svelte');
	assert.match(audit, /สิ่งที่คุณเปลี่ยนเอง/);
	assert.match(audit, /คุณยังไม่ได้เปลี่ยนอะไร/);
	const settings = await read('./OrganizationSettings.svelte');
	assert.match(settings, /class="organization-logo-input"/);
	assert.match(settings, /เลือกไฟล์โลโก้/);
});

test('the ORCA team\'s own company has one name on the platform pages', async () => {
	for (const file of ['./platform/BreakGlassAccounts.svelte', './GoogleSignInSettings.svelte', './platform/PlatformCatalog.svelte', './PlatformCompanies.svelte']) {
		const source = await read(file);
		assert.doesNotMatch(source, /บริษัทหลัก|main company/, file);
	}
	assert.match(await read('./platform/BreakGlassAccounts.svelte'), /resettingSelf[\s\S]*?นี่คือบัญชีของคุณ/, 'resetting your own password warns first');
});

test('an outlined o-button draws no outline but its focus ring, in one rule for every page', async () => {
	// "outline" is also Tailwind's .outline utility (a 1px solid outline): orca.css, which every
	// page with these buttons loads, turns it off outside :focus-visible, scoped to .orca.
	const orca = (await read('./orca.css')).replace(/\/\*[\s\S]*?\*\//g, '');
	assert.match(orca, /\.orca \.o-button\.outline:not\(:focus-visible\) \{\s*outline: none;\s*\}/);
	assert.match(orca, /\.orca :focus-visible \{\s*outline: 3px solid/);
	for (const file of ['./login.css', './forms.css']) {
		const css = (await read(file)).replace(/\/\*[\s\S]*?\*\//g, '');
		assert.doesNotMatch(css, /\.o-button\.outline[^{]*\{[^}]*outline(?:-color)?:\s*(?:0|none|transparent)/, `${file} has no second workaround`);
		assert.match(css, /\.orca\.o-auth-page(?:\.o-login)? :focus-visible \{\s*outline: 2px solid var\(--(?:login-citron|orca-ink)\);/, `${file} keeps its focus ring`);
	}
	// The sign-in page stays dark, and Google keeps its white button.
	const login = (await read('./login.css')).replace(/\/\*[\s\S]*?\*\//g, '');
	assert.match(login, /\.orca\.o-auth-page\.o-login \.o-button\.outline\.o-google \{[^}]*background: #f7f8f8;[^}]*color: #08090a !important;/);
	for (const page of ['../../../routes/login/+page.svelte', '../../../routes/login/ai/+page.svelte', '../../../routes/invite/[token]/+page.svelte', './CompanyGate.svelte']) {
		assert.match(await read(page), /import "(?:\$lib\/components\/orca|\.)\/orca\.css";/, `${page} loads orca.css`);
	}
});
