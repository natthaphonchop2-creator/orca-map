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
