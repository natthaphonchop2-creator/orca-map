/** UI policy mirrors server capabilities; a missing capability never grants access. */
export type OrganizationRole = "owner" | "admin" | "employee";
export function organizationRole(
  role: string | number,
): OrganizationRole | undefined {
  if (typeof role === "number") {
    if (role & 8) return "owner";
    if (role & 16) return "admin";
    if (role & 4) return "employee";
    return undefined;
  }
  const value = role.toLowerCase();
  if (value === "owner" || value === "admin") return value;
  if (["employee", "basic", "member", "user"].includes(value))
    return "employee";
  return undefined;
}
export function canResetMemberPassword(
  canManage: boolean,
  actorRole: string | number | undefined,
  targetRole: string | number | undefined,
  roleLocked = false,
): boolean {
  if (
    !canManage ||
    roleLocked ||
    actorRole === undefined ||
    targetRole === undefined
  )
    return false;
  const actor = organizationRole(actorRole);
  const target = organizationRole(targetRole);
  return Boolean(
    target &&
    (actor === "owner" || (actor === "admin" && target === "employee")),
  );
}

export function memberRoleConflict(error: {
  status: number;
  message: string;
}): "last-owner" | "stale" | undefined {
  if (error.status !== 409) return undefined;
  return error.message.trim().toLowerCase() ===
    "appoint another owner before changing the last owner's role"
    ? "last-owner"
    : "stale";
}
