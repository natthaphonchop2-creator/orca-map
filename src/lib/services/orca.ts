import { parseErrorContent } from "$lib/errors";
import { orcaLocale, t } from "$lib/orca/locale.svelte";
import {
  organizationRole,
  type OrganizationRole,
} from "$lib/orca/member-access";
import type {
  MCPCatalogEntry,
  MCPCatalogEntryServerManifest,
  LocalAuthUser,
  AuthProvider,
} from "./admin/types";
import type { APIKey, APIKeyCreateResponse } from "./api-keys/types";
import { doDelete, doGet, doPatch, doPost, doPut, doWithBody } from "./http";

export type PilotStatus = "received" | "contacted" | "qualified" | "closed";
export interface PilotRequestInput {
  name: string;
  email: string;
  organization: string;
  teamSize: "1-5" | "6-20" | "21-50" | "51+";
  useCase: string;
  locale: "th" | "en";
  consent: boolean;
  website: string;
}
export interface PilotRequest extends Omit<
  PilotRequestInput,
  "consent" | "website"
> {
  id: string;
  reference: string;
  status: PilotStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface OrcaOrganization {
  displayName: string;
  logoDataURL?: string;
  timezone: string;
  version: number;
}

export interface OrcaMember {
  id: string;
  displayName: string;
  email: string;
  role: string | number;
  roleLocked?: boolean;
  status?: "active" | "suspended" | "removed";
  version?: number;
}

export type UnitKind = "department" | "team" | "branch" | "project";
export interface OrcaUnit {
  id: string;
  name: string;
  kind: UnitKind;
  parentID: string;
  version: number;
  archivedAt?: string;
  deletedAt?: string;
}

export interface OrcaTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface OrcaConnection {
  id: string;
  name: string;
  description: string;
  mcpID: string;
  toolNames: string[];
  tools: OrcaTool[];
  scopeNote: string;
  reviewedReadOnly: boolean;
  reviewedTools?: boolean;
  enabled: boolean;
  archivedAt?: string;
  deletedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type HubStatus = "draft" | "active" | "paused" | "archived" | "deleted";
export interface OrcaHubSource {
  connectionID: string;
  toolNames: string[];
}
export interface OrcaHub {
  id: string;
  name: string;
  description: string;
  /** Administrators' guidance sent to AI apps that connect; never adds permissions. */
  instructions?: string;
  /** "approval" holds tools that change data for a manager; empty or "direct" runs them at once. */
  writeMode?: "" | "direct" | "approval";
  connectionID: string;
  toolNames: string[];
  /** Authoritative when present. Legacy fields project the first source. */
  sources?: OrcaHubSource[];
  memberIDs: string[];
  unitIDs: string[];
  /** Explicit live department grants; legacy unitIDs remain organizational labels. */
  accessUnitIDs?: string[];
  /** Server-resolved direct and inherited members. An empty list grants nobody. */
  effectiveMemberIDs?: string[];
  /** OIDC identity provider for employee authentication; empty uses existing ORCA access. */
  userSourceID?: string;
  dailyLimit: number;
  status: HubStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  connectURL: string;
  usedToday: number;
}

export interface OrcaBootstrap {
  organization: OrcaOrganization;
  currentUserID: string;
  canManage: boolean;
  canManageRoles?: boolean;
  canReviewPilotRequests?: boolean;
  members: OrcaMember[];
  units: OrcaUnit[];
  connections: OrcaConnection[];
  hubs: OrcaHub[];
  unifiedConnectURL?: string;
}

export interface OrcaCandidate {
  id: string;
  name: string;
  description?: string;
  endpointHost?: string;
  /** Issued by the backend only for an enabled, recognized managed connector. */
  managedProvider?: string;
  oauthProvider?: string;
  protocol?: "MCP" | "API";
  /** Confirmed source authentication capabilities; absent/empty means unknown. */
  authMethods?: ("oauth" | "secrets" | "none")[];
  /** Setup availability only; never an authenticated connection health claim. */
  setupStatus?: "available" | "admin_setup_required" | "review_required" | "unknown";
  setupCanConfigure?: boolean;
  setupReason?: string;
  /** Whether a source signing in through an operator app has one saved; absent for other sources. */
  oauthApp?: "configured" | "missing";
  /** From the catalog's tool preview; absent means not known yet. */
  toolCount?: number;
}

/** A key a member created for ORCA; its value exists only in the response that created it. */
export interface OrcaSecretKey {
  id: number;
  name: string;
  userID: string;
  /** Empty for a key that reaches every workspace the member may use. */
  hubID?: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

/** An AI app signed in to ORCA through OAuth. */
export interface OrcaSecretSession {
  id: string;
  app: string;
  userID: string;
  createdAt: string;
  lastRefreshedAt: string;
  expiresAt: string;
}

/** A write an AI app asked for, held until a manager decides; arguments and results are the member's data. */
export interface OrcaApproval {
  id: string;
  createdAt: string;
  expiresAt: string;
  userID: string;
  hubID: string;
  connectionID: string;
  toolName: string;
  arguments?: unknown;
  status: "pending" | "running" | "succeeded" | "failed" | "rejected" | "expired";
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  result?: string;
  errorCategory?: string;
}

/** A manager's invitation for one email; the link's token exists only in the response that made it. */
export interface OrcaInvitation {
  id: string;
  createdAt: string;
  expiresAt: string;
  email: string;
  role: "employee" | "admin";
  unitIDs: string[];
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  revokedAt?: string;
}
export interface OrcaInvitationLink {
  invitation: OrcaInvitation;
  token: string;
}
/** What the public invite page may show before sign-in; the email is masked. */
export interface OrcaInvitationPreview {
  organization: string;
  role: "employee" | "admin";
  email: string;
  expiresAt: string;
  status: OrcaInvitation["status"];
}

/** A connected system's last week of finished tool calls, from ORCA's activity records. */
export interface OrcaConnectionHealth {
  connectionID: string;
  status: "healthy" | "degraded" | "failing" | "idle";
  calls: number;
  succeeded: number;
  failed: number;
  changed: number;
  needsSignIn: number;
  toolErrors: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureCategory?: string;
}

export interface OrcaSecrets {
  keys: OrcaSecretKey[];
  sessions: OrcaSecretSession[];
}

export interface OrcaSourceSetup {
  sourceID: string;
  name: string;
  endpointHost?: string;
  managedProvider?: string;
  oauthProvider?: string;
  protocol?: "MCP" | "API";
  runtime: string;
  kind: "entry" | "shared";
  fields: {
    key: string;
    name: string;
    description: string;
    required: boolean;
    sensitive: boolean;
  }[];
  requiresURL: boolean;
  configured: boolean;
  oauthSupported: boolean;
  oauthConnected: boolean;
  oauthClientRequired: boolean;
  oauthClientConfigured: boolean;
  oauthClientCanConfigure?: boolean;
  oauthScopeProfile?: 'slack-public-read-v1';
  setupStatus?: string;
  setupReason?: string;
  oauthRedirectURL: string;
}

export interface OrcaAuditEvent {
  id: string;
  createdAt: string;
  finishedAt?: string;
  resourceID?: string;
  userID: string;
  hubID: string;
  connectionID?: string;
  action?: string;
  toolName?: string;
  method?: string;
  outcome: string;
  message?: string;
  durationMs?: number;
  version?: number;
  connectionVersion?: number;
  toolSchemaHash?: string;
  errorCategory?: string;
}

export interface OrcaConnectionMember {
  memberID: string;
  relevantHubIDs: string[];
  activeHubIDs: string[];
  pausedHubIDs: string[];
  draftHubIDs: string[];
  configured: boolean | null;
  oauthTokenPresent: boolean | null;
  configurationEvidence:
    | "no_account"
    | "metadata"
    | "credentials_not_inspected"
    | "unavailable";
}

export interface OrcaConnectionMembers {
  connectionID: string;
  checkedAt: string;
  oauthSupported: boolean | null;
  items: OrcaConnectionMember[];
}

export type ConnectionInput = Pick<
  OrcaConnection,
  | "name"
  | "description"
  | "mcpID"
  | "toolNames"
  | "scopeNote"
  | "reviewedReadOnly"
  | "reviewedTools"
  | "enabled"
> & { version?: number };
export type HubInput = Pick<
  OrcaHub,
  | "name"
  | "description"
  | "connectionID"
  | "toolNames"
  | "sources"
  | "memberIDs"
  | "unitIDs"
  | "accessUnitIDs"
  | "userSourceID"
  | "dailyLimit"
  | "status"
> & { version?: number; instructions?: string; writeMode?: "" | "direct" | "approval" };
export type UnitInput = Pick<OrcaUnit, "name" | "kind" | "parentID"> & {
  version?: number;
};
export type OrcaKey = APIKey;
export type OrcaCreatedKey = APIKeyCreateResponse & { connectURL: string };

const options = { dontLogErrors: true };
const part = encodeURIComponent;
async function list<T>(path: string): Promise<T[]> {
  const response = (await doGet(path, options)) as { items: T[] | null };
  return response.items ?? [];
}

export const OrcaService = {
  departmentLifecycle: (id: string, action: "archive" | "restore" | "delete", version: number) =>
    doWithBody(action === "delete" ? "DELETE" : "POST", `/orca/units/${part(id)}${action === "delete" ? "" : `/${action}`}`, {version}, options) as Promise<OrcaUnit>,
  memberLifecycle: (id: string, action: "suspend" | "restore" | "delete", version: number) =>
    doWithBody(action === "delete" ? "DELETE" : "POST", `/orca/members/${part(id)}${action === "delete" ? "" : `/${action}`}`, {version}, options) as Promise<OrcaMember>,
  async bootstrap(): Promise<OrcaBootstrap> {
    const data = (await doGet("/orca/bootstrap", options)) as OrcaBootstrap;
    return {
      ...data,
      members: data.members ?? [],
      units: data.units ?? [],
      connections: data.connections ?? [],
      hubs: data.hubs ?? [],
    };
  },
  organization: (displayName: string, version: number, logoDataURL?: string) =>
    doPut(
      "/orca/organization",
      { displayName, version, logoDataURL },
      options,
    ) as Promise<OrcaOrganization>,
  unit: (input: UnitInput, id?: string) =>
    (id
      ? doPut(`/orca/units/${part(id)}`, input, options)
      : doPost("/orca/units", input, options)) as Promise<OrcaUnit>,
  candidates: () => list<OrcaCandidate>("/orca/candidates"),
  async discover(mcpID: string): Promise<OrcaTool[]> {
    const response = (await doPost("/orca/discover", { mcpID }, options)) as {
      tools: OrcaTool[] | null;
    };
    return response.tools ?? [];
  },
  connection: (input: ConnectionInput, id?: string) =>
    (id
      ? doPut(`/orca/connections/${part(id)}`, input, options)
      : doPost("/orca/connections", input, options)) as Promise<OrcaConnection>,
  hub: (input: HubInput, id?: string) =>
    (id
      ? doPut(`/orca/hubs/${part(id)}`, input, options)
      : doPost("/orca/hubs", input, options)) as Promise<OrcaHub>,
  archiveHub: (id: string, version: number) =>
    doPost(`/orca/hubs/${part(id)}/archive`, { version }, options) as Promise<OrcaHub>,
  restoreHub: (id: string, version: number) =>
    doPost(`/orca/hubs/${part(id)}/restore`, { version }, options) as Promise<OrcaHub>,
  deleteHub: (id: string, version: number) =>
    doWithBody("DELETE", `/orca/hubs/${part(id)}`, { version }, options) as Promise<OrcaHub>,
  archiveConnection: (id: string, version: number) =>
    doPost(`/orca/connections/${part(id)}/archive`, { version }, options) as Promise<OrcaConnection>,
  restoreConnection: (id: string, version: number) =>
    doPost(`/orca/connections/${part(id)}/restore`, { version }, options) as Promise<OrcaConnection>,
  deleteConnection: (id: string, version: number) =>
    doWithBody("DELETE", `/orca/connections/${part(id)}`, { version }, options) as Promise<OrcaConnection>,
  keys: (hubID: string) => list<OrcaKey>(`/orca/hubs/${part(hubID)}/keys`),
  createKey: (hubID: string, name: string, expiresInDays: number) =>
    doPost(
      `/orca/hubs/${part(hubID)}/keys`,
      { name, ...(expiresInDays === 0 ? { neverExpires: true } : { expiresInDays }) },
      options,
    ) as Promise<OrcaCreatedKey>,
  revokeKey: (hubID: string, keyID: number) =>
    doDelete(`/orca/hubs/${part(hubID)}/keys/${part(String(keyID))}`, options),
  orcaKeys: () => list<OrcaKey>("/orca/keys"),
  createOrcaKey: (name: string, expiresInDays: number) =>
    doPost("/orca/keys", { name, ...(expiresInDays === 0 ? { neverExpires: true } : { expiresInDays }) }, options) as Promise<OrcaCreatedKey>,
  revokeOrcaKey: (keyID: number) =>
    doDelete(`/orca/keys/${part(String(keyID))}`, options),
  audit: (hubID?: string) =>
    list<OrcaAuditEvent>(`/orca/audit${hubID ? `?hubID=${part(hubID)}` : ""}`),
  connectionMembers: (connectionID: string, signal?: AbortSignal) =>
    doGet(`/orca/connections/${part(connectionID)}/members`, {
      ...options,
      signal,
    }) as Promise<OrcaConnectionMembers>,
  updateMemberRole: (
    id: string,
    role: OrganizationRole,
    expectedRole: number,
  ) =>
    doPut(
      `/orca/members/${part(id)}/role`,
      { role, expectedRole },
      options,
    ) as Promise<OrcaMember>,
  localUsers: () => list<LocalAuthUser>("/local-auth/users"),
  authProviders: () => list<AuthProvider>("/auth-providers"),
  createLocalUser: (email: string, password: string) =>
    doPost(
      "/local-auth/users",
      { email, password },
      options,
    ) as Promise<LocalAuthUser>,
  resetLocalPassword: (id: string, password: string) =>
    doPost(`/local-auth/users/${part(id)}/password`, { password }, options),
  createRemoteEntry: (manifest: MCPCatalogEntryServerManifest) =>
    doPost(
      "/mcp-catalogs/default/entries",
      manifest,
      options,
    ) as Promise<MCPCatalogEntry>,
  sourceSetup: (id: string, signal?: AbortSignal) =>
    doGet(
      `/orca/sources/${part(id)}/setup`,
      { ...options, signal },
    ) as Promise<OrcaSourceSetup>,
  configureSource: (id: string, values: Record<string, string>, url?: string) =>
    doPost(
      `/orca/sources/${part(id)}/configure`,
      { values, ...(url ? { url } : {}) },
      options,
    ) as Promise<OrcaSourceSetup>,
  checkSource: (id: string) =>
    doPost(`/orca/sources/${part(id)}/check`, {}, options) as Promise<{
      ready: boolean;
      oauthRequired: boolean;
    }>,
  /** `replace` swaps a saved app; a new client ID asks members to connect again. */
  configureSourceOAuthClient: (id: string, clientID: string, clientSecret: string, scopeProfile?: OrcaSourceSetup['oauthScopeProfile'], replace = false) =>
    doPost(
      `/orca/sources/${part(id)}/oauth/client`,
      { clientID, clientSecret, ...(scopeProfile ? { scopeProfile } : {}), ...(replace ? { replace: true } : {}) },
      options,
    ) as Promise<OrcaSourceSetup>,
  approvals: (status?: "pending" | "decided", mine = false) => {
    const query = new URLSearchParams({ ...(status ? { status } : {}), ...(mine ? { mine: "1" } : {}) }).toString();
    return list<OrcaApproval>(`/orca/approvals${query ? `?${query}` : ""}`);
  },
  invitations: () => list<OrcaInvitation>("/orca/invitations"),
  invite: (email: string, role: OrcaInvitation["role"], unitIDs: string[]) =>
    doPost("/orca/invitations", { email, role, unitIDs }, options) as Promise<OrcaInvitationLink>,
  reissueInvitation: (id: string) =>
    doPost(`/orca/invitations/${part(id)}/reissue`, {}, options) as Promise<OrcaInvitationLink>,
  revokeInvitation: (id: string) =>
    doPost(`/orca/invitations/${part(id)}/revoke`, {}, options) as Promise<OrcaInvitation>,
  previewInvitation: (token: string) =>
    doPost("/orca/invitations/preview", { token }, options) as Promise<OrcaInvitationPreview>,
  acceptInvitation: (token: string) =>
    doPost("/orca/invitations/accept", { token }, options) as Promise<OrcaInvitation>,
  approveRequest: (id: string) => doPost(`/orca/approvals/${part(id)}/approve`, {}, options) as Promise<OrcaApproval>,
  rejectRequest: (id: string, note: string) =>
    doPost(`/orca/approvals/${part(id)}/reject`, { note }, options) as Promise<OrcaApproval>,
  connectionHealth: () =>
    doGet("/orca/connections/health", options) as Promise<{ since: string; items: OrcaConnectionHealth[] }>,
  /** Metadata only; administrators revoke a leaver's keys and AI app sign-ins here. */
  secrets: () => doGet("/orca/secrets", options) as Promise<OrcaSecrets>,
  revokeSecretKey: (id: number) =>
    doPost(`/orca/secrets/keys/${id}/revoke`, {}, options) as Promise<{ revoked: boolean }>,
  revokeSecretSession: (id: string) =>
    doPost(`/orca/secrets/sessions/${part(id)}/revoke`, {}, options) as Promise<{ revoked: boolean }>,
  /** Removes the app and every member grant issued through it. */
  removeSourceOAuthClient: (id: string) =>
    doPost(`/orca/sources/${part(id)}/oauth/client/remove`, {}, options) as Promise<OrcaSourceSetup>,
  startSourceOAuth: (id: string) =>
    doPost(`/orca/sources/${part(id)}/oauth`, {}, options) as Promise<{
      oauthURL: string;
    }>,
  disconnectSourceOAuth: (id: string) =>
    doPost(
      `/orca/sources/${part(id)}/oauth/disconnect`,
      {},
      options,
    ) as Promise<{
      disconnected: boolean;
    }>,
  async requestPilot(input: PilotRequestInput, idempotencyKey: string) {
    return (await doPost("/orca/pilot-requests", input, {
      dontLogErrors: true,
      headers: { "Idempotency-Key": idempotencyKey },
    })) as { reference: string; status: "received" };
  },
  async listPilotRequests() {
    return (await doGet("/orca/pilot-requests", { dontLogErrors: true })) as {
      items: PilotRequest[];
    };
  },
  async updatePilotRequest(id: string, status: PilotStatus, version: number) {
    return (await doPatch(
      `/orca/pilot-requests/${encodeURIComponent(id)}`,
      { status, version },
      { dontLogErrors: true },
    )) as PilotRequest;
  },
};

export function orcaError(error: unknown): string {
  const parsed = parseErrorContent(error);
  if (parsed.status === 409)
    return t(
      "ข้อมูลนี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง",
      "This record has changed. Reload the latest data before saving again.",
    );
  if (parsed.status === 401)
    return t(
      "การเข้าสู่ระบบหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง",
      "Your session has expired. Please sign in again.",
    );
  if (parsed.status === 403)
    return t(
      "บัญชีของคุณไม่มีสิทธิ์ดำเนินการนี้ หรือสิทธิ์มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
      "Your account does not have permission for this action, or its access has changed. Reload the latest data.",
    );
  if (parsed.status === 429)
    return t(
      "มีการใช้งานครบตามจำนวนที่กำหนดแล้ว กรุณาลองอีกครั้งภายหลัง",
      "The usage limit has been reached. Please try again later.",
    );
  return (
    parsed.message ||
    t(
      "ไม่สามารถเชื่อมต่อได้ กรุณาลองอีกครั้ง",
      "Could not connect. Please try again.",
    )
  );
}

export const unitLabels: Record<UnitKind, string> = {
  get department() {
    return t("แผนก", "Department");
  },
  get team() {
    return t("ทีม", "Team");
  },
  get branch() {
    return t("สาขา", "Branch");
  },
  get project() {
    return t("โครงการ", "Project");
  },
};
export const statusLabels: Record<HubStatus, string> = {
  get draft() {
    return t("ฉบับร่าง", "Draft");
  },
  get active() {
    return t("เปิดใช้งาน", "Active");
  },
  get paused() {
    return t("ระงับ", "Paused");
  },
  get archived() {
    return t("จัดเก็บแล้ว", "Archived");
  },
  get deleted() {
    return t("ลบแล้ว", "Deleted");
  },
};
export const memberName = (member: OrcaMember) =>
  member.displayName || member.email || member.id;
export function memberRole(role: string | number): string {
  const key = organizationRole(role);
  return key === "owner"
    ? t("เจ้าของระบบ", "Owner")
    : key === "admin"
      ? t("ผู้ดูแลระบบ", "Admin")
      : key === "employee"
        ? t("สมาชิกทั่วไป", "Member")
        : t("ยังไม่กำหนดบทบาท", "Role not assigned");
}
export function displayDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(orcaLocale.value === "en" ? "en-GB" : "th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(date);
}
