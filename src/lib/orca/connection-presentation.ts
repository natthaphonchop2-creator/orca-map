import { getCatalogPresentation } from "./catalog-data";
import { googleDriveProvider } from "./catalog";
import type { OrcaCandidate, OrcaSourceSetup } from "../services/orca";

export type SourceAccountState =
  | "unverified"
  | "account-needed"
  | "not-configured"
  | "account-connected"
  | "configured";

export function sourceAccountState(
  source:
    | Pick<
        OrcaSourceSetup,
        | "configured"
        | "oauthSupported"
        | "oauthConnected"
        | "oauthClientRequired"
      >
    | undefined,
): SourceAccountState {
  if (!source) return "unverified";
  // Remote transports can support OAuth without requiring it. Only a declared
  // static OAuth requirement proves an account is needed before the live check.
  if (source.oauthClientRequired && !source.oauthConnected)
    return "account-needed";
  if (!source.configured) return "not-configured";
  return source.oauthConnected ? "account-connected" : "configured";
}

const providerHosts: Record<string, string> = {
  "learn.microsoft.com": "Microsoft Learn",
};

// This changes only the logo lookup key; the source ID and saved name remain intact.
export function sourcePresentationName(
  source: Pick<OrcaCandidate, "name" | "endpointHost" | "managedProvider">,
): string {
  if (googleDriveProvider(source)) return "Google Drive";
  const knownProvider = providerHosts[source.endpointHost?.toLowerCase() ?? ""];
  if (knownProvider) return knownProvider;
  if (getCatalogPresentation(source.name).icon) return source.name;
  const canonicalName = source.name.replace(/ · ORCA(?: QA)?$/, "");
  return canonicalName !== source.name &&
    getCatalogPresentation(canonicalName).icon
    ? canonicalName
    : source.name;
}

export function sourcePresentationNames(
  sources: OrcaCandidate[],
): Record<string, string> {
  return Object.fromEntries(
    sources.map((source) => [source.id, sourcePresentationName(source)]),
  );
}
