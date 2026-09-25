import assert from "node:assert/strict";
import { test } from "node:test";
import { invitationLink, invitationTone, lineShareURL, splitInvitations } from "./invitations.ts";

test("the link carries only the token, under the workspace's own origin", () => {
  assert.equal(invitationLink("https://orca.example.test/", "abc_DEF-123"), "https://orca.example.test/invite/abc_DEF-123");
  assert.equal(invitationLink("https://orca.example.test", "a/b"), "https://orca.example.test/invite/a%2Fb");
});

test("LINE receives the whole message as one encoded text", () => {
  const url = new URL(lineShareURL("เชิญเข้าร่วม ORCA: https://orca.example.test/invite/x?y=1&z=2"));
  assert.equal(url.origin + url.pathname, "https://line.me/R/share");
  assert.equal(url.searchParams.get("text"), "เชิญเข้าร่วม ORCA: https://orca.example.test/invite/x?y=1&z=2");
  assert.deepEqual([...url.searchParams.keys()], ["text"]);
});

test("waiting and expired invitations stay actionable; the rest is history", () => {
  assert.deepEqual(["pending", "accepted", "expired", "revoked"].map(invitationTone), ["waiting", "ok", "bad", "muted"]);
  const { open, closed } = splitInvitations([{ id: "a", status: "pending" }, { id: "b", status: "accepted" }, { id: "c", status: "expired" }, { id: "d", status: "revoked" }]);
  assert.deepEqual(open.map((item) => item.id), ["a", "c"]);
  assert.deepEqual(closed.map((item) => item.id), ["b", "d"]);
});
