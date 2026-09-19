/** Keep post-auth return paths local through both browser and Go URL decoding. */
export function safeReturnPath(value: string | null | undefined, fallback = '/app') {
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value))
		return fallback;
	try {
		const url = new URL(value, 'https://orca.invalid');
		// Route paths do not need encoded separators, controls or nested percent
		// escapes. Query values remain encoded and may legitimately contain URLs.
		if (/%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) return fallback;
		if (
			url.origin !== 'https://orca.invalid' ||
			url.pathname.startsWith('/login') ||
			url.pathname === '/'
		)
			return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

/** Resolve navigation without discarding legacy detail URLs or their parameters. */
export function appNavigation(params: URLSearchParams) {
  const requestedView = params.get("view") ?? "dashboard";
  const section = params.get("section");
  const connectionDetail =
    ["connections", "servers"].includes(requestedView) &&
    Boolean(
      params.get("source") ||
        params.get("connection") ||
        params.get("add") === "source",
    );
  let view = requestedView;
  if (connectionDetail) view = "servers";
  else if (requestedView === "connections") {
    if (section === "accounts") view = "accounts";
    else if (params.has("status")) view = "servers";
    else view = "connected-apps";
  } else if (requestedView === "settings") {
    if (section === "organization") view = "organization";
    else if (section === "members") view = "members";
    else if (section === "keys") view = "api-keys";
  } else if (requestedView === "playground") view = "dashboard";
  return { view, connectionDetail };
}

export function activeNavigationView(view: string) {
  if (["overview", "new", "hub", "workspaces"].includes(view))
    return "workspaces";
  if (view === "connections") return "connected-apps";
  if (["pilots", "knowledge"].includes(view)) return "settings";
  return view;
}
