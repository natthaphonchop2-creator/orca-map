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
export interface OrcaHub {
  id: string;
  name: string;
  description: string;
  connectionID: string;
  toolNames: string[];
  memberIDs: string[];
  unitIDs: string[];
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
}

export interface OrcaCandidate {
  id: string;
  name: string;
  description?: string;
  endpointHost?: string;
  /** Issued by the backend only for an enabled, recognized managed connector. */
  managedProvider?: string;
  oauthProvider?: string;
}

export interface OrcaSourceSetup {
  sourceID: string;
  name: string;
  endpointHost?: string;
  managedProvider?: string;
  oauthProvider?: string;
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
  | "memberIDs"
  | "unitIDs"
  | "dailyLimit"
  | "status"
> & { version?: number };
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
  organization: (displayName: string, version: number) =>
    doPut(
      "/orca/organization",
      { displayName, version },
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
      { name, expiresInDays },
      options,
    ) as Promise<OrcaCreatedKey>,
  revokeKey: (hubID: string, keyID: number) =>
    doDelete(`/orca/hubs/${part(hubID)}/keys/${part(String(keyID))}`, options),
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
      "มีการเปลี่ยนแปลงข้อมูลนี้แล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง",
      "This record has changed. Reload the latest data before saving again.",
    );
  if (parsed.status === 401)
    return t(
      "กรุณาเข้าสู่ระบบอีกครั้งเพื่อใช้งานต่อ",
      "Your session expired. Please sign in again.",
    );
  if (parsed.status === 403)
    return t(
      "บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้ หรือมีการเปลี่ยนแปลงสิทธิ์ กรุณาโหลดข้อมูลล่าสุด",
      "Your account cannot perform this action, or its access has changed. Reload the latest data.",
    );
  if (parsed.status === 429)
    return t(
      "ใช้งานครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่ภายหลัง",
      "The usage limit has been reached. Try again later.",
    );
  return (
    parsed.message ||
    t(
      "เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง",
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
    return t("ระงับการใช้งาน", "Paused");
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
    ? t("Owner", "Owner")
    : key === "admin"
      ? t("Admin องค์กร", "Organization admin")
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
