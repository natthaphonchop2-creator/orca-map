import { doDelete, doGet, doPost, doPut } from "./http";

export interface OrcaUserSourceBinding {
  memberID: string;
  subject: string;
}
export interface OrcaUserSource {
  id: string;
  name: string;
  issuerURL: string;
  clientID: string;
  secretConfigured: boolean;
  enabled: boolean;
  version: number;
  bindings: OrcaUserSourceBinding[];
  createdAt: string;
  updatedAt: string;
}
export interface OrcaUserSourceInput {
  name: string;
  issuerURL: string;
  clientID: string;
  clientSecret?: string;
  enabled: boolean;
  version?: number;
  bindings: OrcaUserSourceBinding[];
}
export interface OrcaUserSourcesResponse {
  items: OrcaUserSource[];
  callbackURL: string;
}
export interface OrcaIdentityDiscovery {
  issuerURL: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksURI: string;
}

const path = "/orca/user-sources";
const options = { dontLogErrors: true };
// Keep credentials out of client state even if a future server response adds fields.
const source = (value: OrcaUserSource): OrcaUserSource => ({
  id: value.id,
  name: value.name,
  issuerURL: value.issuerURL,
  clientID: value.clientID,
  secretConfigured: value.secretConfigured === true,
  enabled: value.enabled === true,
  version: value.version,
  bindings: (value.bindings ?? []).map(({ memberID, subject }) => ({ memberID, subject })),
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});

export const OrcaUserSourcesService = {
  async list(signal?: AbortSignal): Promise<OrcaUserSourcesResponse> {
    const result = await doGet(path, { ...options, signal }) as OrcaUserSourcesResponse;
    return { items: (result.items ?? []).map(source), callbackURL: result.callbackURL ?? "" };
  },
  async save(input: OrcaUserSourceInput, id?: string): Promise<OrcaUserSource> {
    return source(await (id
      ? doPut(`${path}/${encodeURIComponent(id)}`, input, options)
      : doPost(path, input, options)) as OrcaUserSource);
  },
  remove(id: string, version: number) {
    return doDelete(`${path}/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, options);
  },
  discover(issuerURL: string): Promise<OrcaIdentityDiscovery> {
    return doPost(`${path}/discover`, { issuerURL }, options) as Promise<OrcaIdentityDiscovery>;
  },
};
