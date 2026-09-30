import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthProviderSetup } from './oauth-provider-setup.ts';

test('each audited static OAuth provider has a concrete official action and app type', () => {
  const providers = [
    ['', 'mcp.slack.com', 'Slack App · MCP enabled', 'api.slack.com'],
    ['', 'mcp.asana.com', 'MCP app', 'app.asana.com'],
    ['', 'mcp.box.com', 'Box MCP server · Integration Credentials', 'developer.box.com'],
    ['', 'mcp.docusign.com', 'Integration Key · Authorization Code Grant', 'developers.docusign.com'],
    ['', 'mcp.hubspot.com', 'MCP connector', 'app.hubspot.com'],
    ['', 'mcp.zoom.us', 'General app', 'marketplace.zoom.us'],
    ['', 'api.harvey.ai', 'Harvey MCP · vendor confirmation', 'developers.harvey.ai'],
    ['', 'bigquery.googleapis.com', 'OAuth client ID · Web application', 'console.cloud.google.com'],
    ['', 'run.googleapis.com', 'OAuth client ID · Web application', 'console.cloud.google.com'],
    ['', 'compute.googleapis.com', 'OAuth client ID · Web application', 'console.cloud.google.com'],
    ['default-salesforce-f032ecc7', '', 'External Client App', 'developer.salesforce.com'],
    ['default-snowflake-823eb1a7', '', 'OAuth Security Integration · Confidential client', 'docs.snowflake.com'],
    ['default-github-enterprise-cloud-c720e58d', '', 'GitHub OAuth App / GitHub App', 'docs.github.com'],
    ['', 'api.githubcopilot.com', 'GitHub OAuth App', 'github.com'],
  ];
  for (const [id, host, appType, actionHost] of providers) {
    const setup = oauthProviderSetup(id, host);
    assert.ok(setup, id || host);
    assert.equal(setup.appType, appType);
    const url = new URL(setup.actionURL);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, actionHost);
    assert.equal(url.username + url.password + url.search, '');
    assert.equal(setup.steps.length >= 2, true);
    assert.ok(setup.steps.every(([th, en]) => th && en));
  }
});

test('Harvey requires vendor confirmation rather than promising OAuth registration', () => {
  const setup = oauthProviderSetup('', 'api.harvey.ai');
  assert.equal(setup.vendorConfirmationRequired, true);
  assert.match(setup.steps.map((step) => step[1]).join(' '), /does not document custom-client registration/);
  assert.equal(oauthProviderSetup('', 'mcp.slack.com').vendorConfirmationRequired, undefined);
});

test('instructions are matched to exact endpoints or curated tenant entries, never provider-name lookalikes', () => {
  assert.equal(oauthProviderSetup('Asana', ''), undefined);
  assert.equal(oauthProviderSetup('Salesforce', ''), undefined);
  assert.equal(oauthProviderSetup('default-salesforce-f032ecc7-lookalike', ''), undefined);
  for (const host of ['mcp.asana.com.evil.test', 'https://mcp.asana.com', 'mcp.asana.com:443', 'user@mcp.asana.com']) {
    assert.equal(oauthProviderSetup('', host), undefined);
  }
  assert.equal(oauthProviderSetup('', 'MCP.ASANA.COM').key, 'asana');
});

test('legacy Dropbox help stays tied to its catalog entry, leaving other Dropbox endpoints alone', () => {
  assert.equal(oauthProviderSetup('default-dropbox-8dc6ea2b', 'mcp.dropbox.com').key, 'dropbox');
  assert.equal(oauthProviderSetup('custom-dropbox', 'mcp.dropbox.com'), undefined);
});

test('GitHub: the guide follows the entry’s remote host api.githubcopilot.com, never a catalog ID', () => {
  const setup = oauthProviderSetup('default-orca-github', 'api.githubcopilot.com');
  assert.equal(setup.key, 'github');
  assert.equal(setup.appType, 'GitHub OAuth App');
  // Fixed official links only.
  assert.equal(setup.actionURL, 'https://github.com/settings/applications/new');
  assert.equal(setup.documentationURL, 'https://github.com/github/github-mcp-server');
  assert.deepEqual(setup.action, ['เปิดหน้าลงทะเบียน OAuth App ของ GitHub', "Open GitHub's new OAuth App page"]);
  // Any case, and whatever the synced catalog ID is.
  assert.equal(oauthProviderSetup('default-github-0f1e2d3c', 'API.GitHubCopilot.com').key, 'github');
  assert.equal(oauthProviderSetup('', 'api.githubcopilot.com').key, 'github');
  // A GitHub catalog entry with no host (Obot's PAT entry, a URL template) gets no guide, nor do lookalike hosts.
  for (const id of ['default-orca-github', 'default-github-0f1e2d3c', 'obot-github', 'github']) assert.equal(oauthProviderSetup(id, ''), undefined, id);
  for (const host of ['api.githubcopilot.com.evil.test', 'https://api.githubcopilot.com', 'api.githubcopilot.com:443', 'github.com', 'api.github.com', 'copilot-api.githubcopilot.com']) {
    assert.equal(oauthProviderSetup('default-orca-github', host), undefined, host);
  }
  // The enterprise tenant entry keeps its own guide.
  assert.equal(oauthProviderSetup('default-github-enterprise-cloud-c720e58d', '').key, 'github-enterprise');
});

test('GitHub: the steps register ORCA as an OAuth App, name the homepage and callback, and leave the secret to the owner', () => {
  const { steps } = oauthProviderSetup('', 'api.githubcopilot.com');
  assert.equal(steps.length, 5);
  assert.ok(steps.every(([th, en]) => /[\u0E00-\u0E7F]/.test(th) && en && !/[\u0E00-\u0E7F]/.test(en)));
  const [th, en] = [steps.map((step) => step[0]).join(' '), steps.map((step) => step[1]).join(' ')];
  assert.match(en, /Register ORCA as a GitHub OAuth App/);
  assert.match(th, /Homepage URL เป็น https:\/\/orca-0w10\.onrender\.com\//);
  assert.match(en, /Homepage URL to https:\/\/orca-0w10\.onrender\.com\//);
  assert.match(en, /Paste the Callback URL below into Authorization callback URL/);
  assert.match(th, /Callback URL ด้านล่าง/);
  assert.match(en, /Generate a new client secret/);
  assert.match(en, /GitHub shows the secret only once/);
  assert.match(th, /ใส่ Client ID และ Client secret ที่นี่ด้วยตัวเอง/);
  assert.match(en, /Enter the Client ID and Client secret here yourself/);
  assert.match(en, /restricts third-party apps.*must approve ORCA/);
  assert.match(th, /Third-party access.*ต้องอนุมัติ ORCA ก่อน/);
  // Step 4 names where the permissions come from (the backend's fake-GitHub
  // check: ORCA asks for exactly what GitHub's MCP server lists).
  assert.match(steps[3][1], /OAuth Apps have no permission settings: GitHub shows each member the permissions its MCP server asks for, and ORCA asks for nothing beyond that list\./);
  assert.match(steps[3][0], /OAuth App ไม่มีหน้าตั้งสิทธิ์: GitHub แสดงสิทธิ์ที่เซิร์ฟเวอร์ MCP ของ GitHub ขอ ให้สมาชิกกดอนุญาตเอง ORCA ไม่ขอเพิ่มจากรายการนั้น/);
  // The guide never carries a callback host of its own: the page shows the installation's.
  assert.doesNotMatch(th + en, /oauth\/mcp\/callback|127\.0\.0\.1|localhost/);
});
