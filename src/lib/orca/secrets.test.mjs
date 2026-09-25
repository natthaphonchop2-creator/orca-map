import assert from "node:assert/strict";
import { test } from "node:test";
import { STALE_DAYS, canRevokeSecret, secretHolders, secretRows } from "./secrets.ts";

const now = Date.parse("2026-09-25T12:00:00Z");
const daysAgo = (days) => new Date(now - days * 86_400_000).toISOString();
const members = [
  { id: "1", displayName: "Owner Person", email: "owner@example.invalid", role: 8 },
  { id: "2", displayName: "", email: "admin@example.invalid", role: "admin" },
  { id: "3", displayName: "Member Person", email: "member@example.invalid", role: 4 },
];
const hubs = [{ id: "khh-1", name: "Accounting" }];
const isOwner = (role) => role === 8 || role === "owner";
const inventory = {
  keys: [
    { id: 7, name: "Old laptop", userID: "3", createdAt: daysAgo(90), lastUsedAt: daysAgo(45) },
    { id: 8, name: "Script", userID: "3", hubID: "khh-1", createdAt: daysAgo(2), expiresAt: daysAgo(-28) },
    { id: 9, name: "Owner laptop", userID: "1", createdAt: daysAgo(1) },
    { id: 10, name: "Leaver key", userID: "99", createdAt: daysAgo(5), lastUsedAt: daysAgo(0.5) },
  ],
  sessions: [
    { id: "s-old", app: "Claude", userID: "3", createdAt: daysAgo(40), lastRefreshedAt: daysAgo(35), expiresAt: daysAgo(-5) },
    { id: "s-new", app: "ChatGPT", userID: "1", createdAt: daysAgo(3), lastRefreshedAt: daysAgo(0), expiresAt: daysAgo(-27) },
  ],
};

test("rows name the holder and workspace, newest activity first", () => {
  const { keys, sessions } = secretRows(inventory, members, hubs, now, isOwner);
  assert.deepEqual(sessions.map((row) => [row.label, row.member, row.ownerHeld]), [["ChatGPT", "Owner Person", true], ["Claude", "Member Person", false]]);
  assert.deepEqual(keys.map((row) => row.label), ["Leaver key", "Owner laptop", "Script", "Old laptop"]);
  const script = keys.find((row) => row.label === "Script");
  assert.equal(script.hubName, "Accounting");
  assert.equal(script.neverExpires, false);
  assert.equal(script.keyID, 8);
  assert.equal(keys.find((row) => row.label === "Old laptop").hubID, undefined, "an empty hub reaches every workspace");
  assert.equal(keys.find((row) => row.label === "Leaver key").member, "", "a removed member has no name to show");
});

test(`access unused for ${STALE_DAYS} days is flagged, and keys without expiry are marked`, () => {
  const { keys, sessions } = secretRows(inventory, members, hubs, now, isOwner);
  const byLabel = Object.fromEntries([...keys, ...sessions].map((row) => [row.label, row]));
  assert.equal(byLabel["Old laptop"].stale, true);
  assert.equal(byLabel["Old laptop"].neverExpires, true);
  assert.equal(byLabel["Claude"].stale, true);
  assert.equal(byLabel["ChatGPT"].stale, false);
  assert.equal(byLabel["Script"].stale, false, "a new, unused key is not stale yet");
});

test("only an owner revokes an owner's access; everyone may revoke their own", () => {
  const { keys } = secretRows(inventory, members, hubs, now, isOwner);
  const owner = keys.find((row) => row.label === "Owner laptop");
  const member = keys.find((row) => row.label === "Script");
  assert.equal(canRevokeSecret(owner, "2", false), false);
  assert.equal(canRevokeSecret(owner, "1", false), true);
  assert.equal(canRevokeSecret(owner, "2", true), true);
  assert.equal(canRevokeSecret(member, "2", false), true);
});

test("the holder filter lists each member once, by name", () => {
  const { keys, sessions } = secretRows(inventory, members, hubs, now, isOwner);
  assert.deepEqual(secretHolders([...sessions, ...keys]), [
    { userID: "99", member: "" },
    { userID: "3", member: "Member Person" },
    { userID: "1", member: "Owner Person" },
  ]);
});
