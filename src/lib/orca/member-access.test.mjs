import assert from "node:assert/strict";
import { test } from "node:test";
import {
  organizationRole,
  canResetMemberPassword,
  memberRoleConflict,
} from "./member-access.ts";

test("organization roles support server bitmasks and legacy member labels", () => {
  assert.equal(organizationRole(8 | 16 | 4), "owner");
  assert.equal(organizationRole(16 | 4), "admin");
  assert.equal(organizationRole(4), "employee");
  assert.equal(organizationRole("member"), "employee");
  assert.equal(organizationRole("employee"), "employee");
  assert.equal(organizationRole(0), undefined);
  assert.equal(organizationRole("unknown"), undefined);
});
test("password controls cannot be used to bypass organization role hierarchy", () => {
  assert.equal(canResetMemberPassword(true, 8, 16), true);
  assert.equal(canResetMemberPassword(true, 16, 4), true);
  for (const target of [8, 16, undefined, 0])
    assert.equal(canResetMemberPassword(true, 16, target), false);
  assert.equal(canResetMemberPassword(false, 8, 4), false);
  assert.equal(canResetMemberPassword(true, 8, 4, true), false);
  assert.equal(canResetMemberPassword(true, 4, 4), false);
});

test("last-owner protection is distinct from a stale version conflict", () => {
  assert.equal(
    memberRoleConflict({
      status: 409,
      message: "appoint another owner before changing the last owner's role",
    }),
    "last-owner",
  );
  assert.equal(
    memberRoleConflict({
      status: 409,
      message: "member role changed; reload and try again",
    }),
    "stale",
  );
  assert.equal(
    memberRoleConflict({ status: 403, message: "forbidden" }),
    undefined,
  );
});
