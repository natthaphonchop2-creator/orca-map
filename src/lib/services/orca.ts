import { parseErrorContent } from "$lib/errors";
import { orcaPath, type OrcaCompanyChoice } from "$lib/orca/company";
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
  /** Suspending, restoring and removing members. In the default company that changes the person's account, so only the platform operator may. */
  canChangeMemberStatus?: boolean;
  /** A live ORCA platform operator; only they may manage Local passwords, as break-glass. */
  platformOperator?: boolean;
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

/** A company's managers invite employees and admins. */
export type OrcaManagerInvitationRole = "employee" | "admin";
/**
 * An invitation for one email; the link's token exists only in the response that made it.
 * Owner invitations come only from the platform, handing a company to its first owner.
 */
export interface OrcaInvitation {
  id: string;
  createdAt: string;
  expiresAt: string;
  email: string;
  role: OrcaManagerInvitationRole | "owner";
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
  role: OrcaInvitation["role"];
  email: string;
  expiresAt: string;
  status: OrcaInvitation["status"];
  /** Only for the signed-in person who accepted it. */
  target?: OrcaInvitationTarget;
}

/** One company as the platform operator's list shows it: names and counts, never its members. */
export interface OrcaPlatformCompany {
  id: string;
  displayName: string;
  createdAt: string;
  /** Members who can use the company now. */
  seats: number;
  /** Owners who can act now. */
  owners: number;
  /** The platform's owner invitations still pending, expired ones included. */
  ownerInvitations: OrcaPlatformOwnerInvitation[];
}
export interface OrcaPlatformOwnerInvitation {
  id: string;
  email: string;
  expiresAt: string;
  status: "pending" | "expired";
}
/**
 * The link handing a company to its owner. `reissued` says it replaced a waiting
 * link for the same email; the two sign-in facts inform and never refuse.
 */
export interface OrcaOwnerInvitationLink {
  invitation: OrcaInvitation;
  token: string;
  companyID: string;
  reissued: boolean;
  googleSignIn: boolean;
  emailDomainAllowed: boolean;
}

/** Where an accepted invitation leads: its company, and the page that opens it. */
export interface OrcaInvitationTarget {
  companyID: string;
  companyName: string;
  returnTo: string;
}

/** Signing in to the workspace with Google; the client secret is write-only. */
export interface OrcaGoogleSignIn {
  clientID: string;
  allowedDomains: string[];
  redirectURI: string;
  enabled: boolean;
  secretConfigured: boolean;
  version: number;
  updatedAt?: string;
}
export interface OrcaGoogleSignInInput {
  clientID: string;
  clientSecret?: string;
  allowedDomains: string[];
  redirectURI: string;
  enabled: boolean;
  version: number;
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
    doWithBody(action === "delete" ? "DELETE" : "POST", orcaPath(`/units/${part(id)}${action === "delete" ? "" : `/${action}`}`), {version}, options) as Promise<OrcaUnit>,
  memberLifecycle: (id: string, action: "suspend" | "restore" | "delete", version: number) =>
    doWithBody(action === "delete" ? "DELETE" : "POST", orcaPath(`/members/${part(id)}${action === "delete" ? "" : `/${action}`}`), {version}, options) as Promise<OrcaMember>,
  async bootstrap(): Promise<OrcaBootstrap> {
    const data = (await doGet(orcaPath("/bootstrap"), options)) as OrcaBootstrap;
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
      orcaPath("/organization"),
      { displayName, version, logoDataURL },
      options,
    ) as Promise<OrcaOrganization>,
  unit: (input: UnitInput, id?: string) =>
    (id
      ? doPut(orcaPath(`/units/${part(id)}`), input, options)
      : doPost(orcaPath("/units"), input, options)) as Promise<OrcaUnit>,
  candidates: () => list<OrcaCandidate>(orcaPath("/candidates")),
  async discover(mcpID: string): Promise<OrcaTool[]> {
    const response = (await doPost(orcaPath("/discover"), { mcpID }, options)) as {
      tools: OrcaTool[] | null;
    };
    return response.tools ?? [];
  },
  connection: (input: ConnectionInput, id?: string) =>
    (id
      ? doPut(orcaPath(`/connections/${part(id)}`), input, options)
      : doPost(orcaPath("/connections"), input, options)) as Promise<OrcaConnection>,
  hub: (input: HubInput, id?: string) =>
    (id
      ? doPut(orcaPath(`/hubs/${part(id)}`), input, options)
      : doPost(orcaPath("/hubs"), input, options)) as Promise<OrcaHub>,
  archiveHub: (id: string, version: number) =>
    doPost(orcaPath(`/hubs/${part(id)}/archive`), { version }, options) as Promise<OrcaHub>,
  restoreHub: (id: string, version: number) =>
    doPost(orcaPath(`/hubs/${part(id)}/restore`), { version }, options) as Promise<OrcaHub>,
  deleteHub: (id: string, version: number) =>
    doWithBody("DELETE", orcaPath(`/hubs/${part(id)}`), { version }, options) as Promise<OrcaHub>,
  archiveConnection: (id: string, version: number) =>
    doPost(orcaPath(`/connections/${part(id)}/archive`), { version }, options) as Promise<OrcaConnection>,
  restoreConnection: (id: string, version: number) =>
    doPost(orcaPath(`/connections/${part(id)}/restore`), { version }, options) as Promise<OrcaConnection>,
  deleteConnection: (id: string, version: number) =>
    doWithBody("DELETE", orcaPath(`/connections/${part(id)}`), { version }, options) as Promise<OrcaConnection>,
  keys: (hubID: string) => list<OrcaKey>(orcaPath(`/hubs/${part(hubID)}/keys`)),
  createKey: (hubID: string, name: string, expiresInDays: number) =>
    doPost(
      orcaPath(`/hubs/${part(hubID)}/keys`),
      { name, ...(expiresInDays === 0 ? { neverExpires: true } : { expiresInDays }) },
      options,
    ) as Promise<OrcaCreatedKey>,
  revokeKey: (hubID: string, keyID: number) =>
    doDelete(orcaPath(`/hubs/${part(hubID)}/keys/${part(String(keyID))}`), options),
  orcaKeys: () => list<OrcaKey>(orcaPath("/keys")),
  createOrcaKey: (name: string, expiresInDays: number) =>
    doPost(orcaPath("/keys"), { name, ...(expiresInDays === 0 ? { neverExpires: true } : { expiresInDays }) }, options) as Promise<OrcaCreatedKey>,
  revokeOrcaKey: (keyID: number) =>
    doDelete(orcaPath(`/keys/${part(String(keyID))}`), options),
  audit: (hubID?: string) =>
    list<OrcaAuditEvent>(orcaPath(`/audit${hubID ? `?hubID=${part(hubID)}` : ""}`)),
  connectionMembers: (connectionID: string, signal?: AbortSignal) =>
    doGet(orcaPath(`/connections/${part(connectionID)}/members`), {
      ...options,
      signal,
    }) as Promise<OrcaConnectionMembers>,
  updateMemberRole: (
    id: string,
    role: OrganizationRole,
    expectedRole: number,
  ) =>
    doPut(
      orcaPath(`/members/${part(id)}/role`),
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
      orcaPath(`/sources/${part(id)}/setup`),
      { ...options, signal },
    ) as Promise<OrcaSourceSetup>,
  configureSource: (id: string, values: Record<string, string>, url?: string) =>
    doPost(
      orcaPath(`/sources/${part(id)}/configure`),
      { values, ...(url ? { url } : {}) },
      options,
    ) as Promise<OrcaSourceSetup>,
  checkSource: (id: string) =>
    doPost(orcaPath(`/sources/${part(id)}/check`), {}, options) as Promise<{
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
    return list<OrcaApproval>(orcaPath(`/approvals${query ? `?${query}` : ""}`));
  },
  googleSignIn: () => doGet("/orca/sign-in/google", options) as Promise<OrcaGoogleSignIn>,
  saveGoogleSignIn: (input: OrcaGoogleSignInInput) =>
    doPut("/orca/sign-in/google", input, options) as Promise<OrcaGoogleSignIn>,
  /** Public: whether the sign-in page offers Google. */
  signInMethods: (fetcher?: typeof fetch) =>
    doGet("/orca/sign-in/methods", { ...options, fetch: fetcher }) as Promise<{ google: boolean }>,
  invitations: () => list<OrcaInvitation>(orcaPath("/invitations")),
  invite: (email: string, role: OrcaManagerInvitationRole, unitIDs: string[]) =>
    doPost(orcaPath("/invitations"), { email, role, unitIDs }, options) as Promise<OrcaInvitationLink>,
  reissueInvitation: (id: string) =>
    doPost(orcaPath(`/invitations/${part(id)}/reissue`), {}, options) as Promise<OrcaInvitationLink>,
  revokeInvitation: (id: string) =>
    doPost(orcaPath(`/invitations/${part(id)}/revoke`), {}, options) as Promise<OrcaInvitation>,
  previewInvitation: (token: string) =>
    doPost("/orca/invitations/preview", { token }, options) as Promise<OrcaInvitationPreview>,
  acceptInvitation: (token: string) =>
    doPost("/orca/invitations/accept", { token }, options) as Promise<OrcaInvitation & { target?: OrcaInvitationTarget }>,
  /** The companies the signed-in person may use now; never per company. */
  companies: () => list<OrcaCompanyChoice>("/orca/companies"),
  /** The platform operator's customer companies; platform calls, never per company. */
  platformCompanies: () => list<OrcaPlatformCompany>("/orca/platform/companies"),
  openCompany: (displayName: string) =>
    doPost("/orca/platform/companies", { displayName }, options) as Promise<OrcaPlatformCompany>,
  inviteCompanyOwner: (companyID: string, email: string) =>
    doPost(`/orca/platform/companies/${part(companyID)}/owner-invitations`, { email }, options) as Promise<OrcaOwnerInvitationLink>,
  revokeCompanyOwnerInvitation: (companyID: string, id: string) =>
    doPost(`/orca/platform/companies/${part(companyID)}/owner-invitations/${part(id)}/revoke`, {}, options) as Promise<OrcaInvitation>,
  approveRequest: (id: string) => doPost(orcaPath(`/approvals/${part(id)}/approve`), {}, options) as Promise<OrcaApproval>,
  rejectRequest: (id: string, note: string) =>
    doPost(orcaPath(`/approvals/${part(id)}/reject`), { note }, options) as Promise<OrcaApproval>,
  connectionHealth: () =>
    doGet(orcaPath("/connections/health"), options) as Promise<{ since: string; items: OrcaConnectionHealth[] }>,
  /** Metadata only; administrators revoke a leaver's keys and AI app sign-ins here. */
  secrets: () => doGet(orcaPath("/secrets"), options) as Promise<OrcaSecrets>,
  revokeSecretKey: (id: number) =>
    doPost(orcaPath(`/secrets/keys/${id}/revoke`), {}, options) as Promise<{ revoked: boolean }>,
  revokeSecretSession: (id: string) =>
    doPost(orcaPath(`/secrets/sessions/${part(id)}/revoke`), {}, options) as Promise<{ revoked: boolean }>,
  /** Removes the app and every member grant issued through it. */
  removeSourceOAuthClient: (id: string) =>
    doPost(`/orca/sources/${part(id)}/oauth/client/remove`, {}, options) as Promise<OrcaSourceSetup>,
  startSourceOAuth: (id: string) =>
    doPost(orcaPath(`/sources/${part(id)}/oauth`), {}, options) as Promise<{
      oauthURL: string;
    }>,
  disconnectSourceOAuth: (id: string) =>
    doPost(
      orcaPath(`/sources/${part(id)}/oauth/disconnect`),
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

/**
 * The server's 409 refusals that are not "someone changed this" (pkg/gateway/client
 * orca_invitations.go, orca_admin_passwords.go, orca_platform_companies.go):
 * each gets its own words and the next step, never "reload and save again".
 */
export const conflictReasons: readonly (readonly [message: string, th: string, en: string])[] = [
  [
    "this email already belongs to a member",
    "อีเมลนี้เป็นสมาชิกของบริษัทอยู่แล้ว ไม่ต้องเชิญใหม่ ดูหรือเปลี่ยนบทบาทได้ที่แท็บ สมาชิก",
    "This email already belongs to a member, so there's no need to invite them. See or change their role under Members.",
  ],
  [
    "an invitation for this email is already waiting",
    "มีคำเชิญของอีเมลนี้รออยู่แล้ว ถ้าลิงก์หาย กด สร้างลิงก์ใหม่ ที่คำเชิญนั้นในแท็บ คำเชิญ",
    "An invitation for this email is already waiting. If the link is lost, choose New link on it under Invitations.",
  ],
  [
    "this person is suspended or removed; restore them instead",
    "คนนี้ถูกระงับหรือถูกนำออกจากบริษัทแล้ว ให้กู้คืนเขาที่แท็บ สมาชิก แทนการเชิญใหม่",
    "This person is suspended or removed. Restore them under Members instead of inviting them again.",
  ],
  [
    "this account already has a higher role than the invitation",
    "บัญชีนี้มีบทบาทสูงกว่าคำเชิญอยู่แล้ว ติดต่อทีม ORCA ถ้าต้องการเปลี่ยน",
    "This account already has a higher role than the invitation. Ask the ORCA team if it should change.",
  ],
  [
    "this invitation was already used, revoked or has expired",
    "คำเชิญนี้ถูกใช้ ยกเลิก หรือหมดอายุไปแล้ว ถ้ายังต้องการเชิญ ให้สร้างคำเชิญใหม่",
    "This invitation was already used, revoked or has expired. To invite them again, make a new invitation.",
  ],
  [
    "password was set by an administrator, so it can't join another company",
    "บัญชีนี้ใช้รหัสผ่านที่ทีม ORCA ตั้งให้ จึงเข้าบริษัทอื่นไม่ได้ เข้าร่วมด้วยบัญชี Google ของคุณแทน หรือติดต่อทีม ORCA",
    "This account's password was set by the ORCA team, so it can't join another company. Join with your Google account instead, or ask the ORCA team.",
  ],
  [
    "this company already has an owner",
    "บริษัทนี้มีเจ้าของแล้ว ขอให้เจ้าของบริษัทเชิญคุณ",
    "This company already has an owner. Ask them to invite you.",
  ],
  [
    "this person belongs to another company and signs in with Google",
    "คนนี้อยู่ในบริษัทลูกค้าและเข้าสู่ระบบด้วย Google ทีม ORCA ตั้งรหัสผ่านให้บัญชีนี้ไม่ได้ ไม่ต้องลองอีก",
    "This person belongs to a customer company and signs in with Google. The ORCA team can't set a password for this account; there's no need to retry.",
  ],
];

export function orcaError(error: unknown): string {
  const parsed = parseErrorContent(error);
  if (parsed.status === 412 && parsed.message.includes("orca_account_changed"))
    return t(
      "คุณเข้าสู่ระบบด้วยบัญชีอื่นในอีกแท็บ โหลดหน้านี้ใหม่",
      "You signed in as someone else in another tab. Reload this page.",
    );
  if (parsed.status === 409) {
    // A refusal that names its reason: say it plainly, with what to do next.
    const known = conflictReasons.find(([message]) => parsed.message.includes(message));
    if (known) return t(known[1], known[2]);
  }
  if (parsed.status === 409)
    return t(
      "มีคนเปลี่ยนข้อมูลนี้ไปแล้ว โหลดข้อมูลล่าสุดก่อน แล้วบันทึกอีกครั้ง",
      "Someone changed this. Reload the latest data, then save again.",
    );
  if (parsed.status === 401)
    return t(
      "การเข้าสู่ระบบหมดอายุแล้ว เข้าสู่ระบบอีกครั้ง",
      "Your sign-in has expired. Sign in again.",
    );
  if (parsed.status === 403)
    return t(
      "บัญชีของคุณไม่มีสิทธิ์ทำสิ่งนี้ หรือสิทธิ์เพิ่งเปลี่ยน โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง",
      "Your account can't do this, or its access just changed. Reload the latest data and try again.",
    );
  if (parsed.status === 429)
    return t(
      "ใช้ครบจำนวนที่กำหนดแล้ว ลองอีกครั้งภายหลัง",
      "The usage limit has been reached. Try again later.",
    );
  return (
    parsed.message ||
    t(
      "เชื่อมต่อไม่ได้ ลองอีกครั้ง",
      "Could not connect. Try again.",
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
    return t("หยุดชั่วคราว", "Paused");
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
  // Company roles by the glossary; the ORCA operator is "ทีม ORCA" elsewhere.
  return key === "owner"
    ? t("เจ้าของบริษัท", "Company owner")
    : key === "admin"
      ? t("ผู้ดูแล", "Admin")
      : key === "employee"
        ? t("พนักงาน", "Employee")
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
