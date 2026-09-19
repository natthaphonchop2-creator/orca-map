import { importTypeScript } from './test-import.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const { sourceAccountState, sourcePresentationName, sourcePresentationNames } = await importTypeScript(new URL('./connection-presentation.ts', import.meta.url));

const publicSource = {
  configured: true,
  oauthSupported: true,
  oauthConnected: false,
  oauthClientRequired: false,
};

test("a configured public remote source never requires an account just because OAuth is supported", () => {
  assert.equal(sourceAccountState(publicSource), "configured");
  assert.equal(
    sourceAccountState({ ...publicSource, oauthSupported: false }),
    "configured",
  );
});

test("a declared static OAuth requirement needs an account until its grant is connected", () => {
  assert.equal(
    sourceAccountState({ ...publicSource, oauthClientRequired: true }),
    "account-needed",
  );
  assert.equal(
    sourceAccountState({
      ...publicSource,
      oauthClientRequired: true,
      oauthConnected: true,
    }),
    "account-connected",
  );
});

test("missing setup evidence and incomplete configuration do not claim an OAuth requirement", () => {
  assert.equal(sourceAccountState(undefined), "unverified");
  assert.equal(
    sourceAccountState({ ...publicSource, configured: false }),
    "not-configured",
  );
});

test("Microsoft Learn custom saved identity resolves its provider logo from an exact known endpoint", () => {
  const candidate = {
    id: "ms-learn-qa",
    name: "Microsoft Learn · ORCA QA",
    endpointHost: "learn.microsoft.com",
  };
  const original = structuredClone(candidate);
  assert.equal(
    sourcePresentationNames([candidate])[candidate.id],
    "Microsoft Learn",
  );
  assert.deepEqual(candidate, original);
});

test("only recognized catalog names normalize the known ORCA suffix for logo lookup", () => {
  assert.equal(
    sourcePresentationName({ name: "Microsoft Learn · ORCA QA" }),
    "Microsoft Learn",
  );
  assert.equal(
    sourcePresentationName({ name: "Google Drive · ORCA" }),
    "Google Drive",
  );
  assert.equal(
    sourcePresentationName({ name: "Hotel manual · ORCA QA" }),
    "Hotel manual · ORCA QA",
  );
});

test("custom names and misleading host suffixes never acquire a provider logo", () => {
  assert.equal(
    sourcePresentationName({
      name: "Hotel manual",
      endpointHost: "learn.microsoft.com.example.org",
    }),
    "Hotel manual",
  );
  assert.equal(
    sourcePresentationName({
      name: "Our Microsoft Learn mirror",
      endpointHost: "internal.example.org",
    }),
    "Our Microsoft Learn mirror",
  );
});

test('managed Drive uses the shared product logo without changing saved source identity', () => {
  const candidates = [
    { id: 'managed', name: 'Company documents', managedProvider: 'google-drive', endpointHost: '127.0.0.1' },
    { id: 'google', name: 'Google preview', endpointHost: 'drivemcp.googleapis.com' },
    { id: 'legacy', name: 'Previous Drive source', endpointHost: 'google-drive-mcp.obot.ai' },
    { id: 'custom', name: 'Hotel documents', endpointHost: '127.0.0.1', oauthProvider: 'google' },
  ];
  const before = structuredClone(candidates);
  assert.deepEqual(sourcePresentationNames(candidates), {
    managed: 'Google Drive', google: 'Google Drive', legacy: 'Google Drive', custom: 'Hotel documents',
  });
  assert.equal(sourcePresentationName({ name: 'Company documents', managedProvider: 'google-drive' }), 'Google Drive');
  assert.deepEqual(candidates, before);
});
