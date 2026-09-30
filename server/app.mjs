import http from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SAFE = new Set(['GET', 'HEAD']);
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const BACKEND_PREFIXES = ['/api/', '/oauth2/', '/oauth/', '/.well-known/', '/orca/oauth/', '/orca/.well-known/', '/mcp-connect/', '/mcp-connect-composite/'];
// Redirected to the backend's public origin before anything reads them: the
// backend's host-only flow cookie lives there. /orca/oauth/handoff (a one-time
// code) and /orca/oauth/fallback belong to an AI app's sign-in on this
// workspace's login (C4 design §14h).
const ORCA_OAUTH_NAVIGATION = new Set(['/orca/oauth/authorize', '/orca/oauth/callback', '/orca/oauth/session', '/orca/oauth/login', '/orca/oauth/handoff', '/orca/oauth/fallback']);
// Proxied, never redirected, even when another site started the navigation:
// the backend claims (begin) and finishes (confirm) that sign-in with this
// workspace's own cookies, and its answers keep their Locations and cookies.
const ORCA_OAUTH_PROXIED_NAVIGATION = new Set(['/orca/oauth/handoff/begin', '/orca/oauth/handoff/confirm']);
const UI_PATHS = new Set(['/', '/app', '/login', '/login/local', '/login/ai', '/privacy', '/privacy-policy', '/terms-of-service', '/oauth-debugger/callback', '/auth/oauth/complete']);
const MARKETING = /^\/(?:pricing|services|start)(?:\.html|\/|$)/;
// ORCA source checks may take 60s and governed MCP calls have a 90s budget,
// followed by up to 5s for audit finalization. Let the backend return its own
// result while retaining a finite deadline for a stalled upstream connection.
const BACKEND_HEADER_TIMEOUT_MS = 120_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };

export function originURL(value, name) {
  let result;
  try { result = new URL(value); } catch { throw new Error(`${name} must be an HTTP(S) origin`); }
  if (!['http:', 'https:'].includes(result.protocol) || result.username || result.password || result.pathname !== '/' || result.search || result.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query or fragment`);
  }
  return result;
}

function cleanHeaders(headers) {
  const forbidden = new Set(HOP_HEADERS);
  for (const token of String(headers.connection ?? '').split(',')) forbidden.add(token.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => value !== undefined && !forbidden.has(name.toLowerCase())));
}

function json(res, status, body, head = false) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(head ? undefined : text);
}

function localOrigin(req, configured) {
  const host = req.headers.host;
  if (typeof host !== 'string' || /[\s,/@\\]/.test(host)) return null;
  let origin;
  try { origin = new URL(`${configured?.protocol ?? 'http:'}//${host}`); } catch { return null; }
  if (configured) return origin.origin === configured.origin ? configured.origin : null;
  const address = req.socket.localAddress;
  const port = req.socket.localPort;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || Number(origin.port || 80) !== port) return null;
  // With no public origin configured, a remote Host name never becomes trusted.
  return address ? origin.origin : null;
}

function parsedPath(raw) {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return null;
  const rawPath = raw.split('?')[0];
  if (/%(?:2f|5c|00|25)/i.test(rawPath)) return null;
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (/[\\\x00-\x20\x7f]/.test(decoded) || decoded.split('/').some((part) => part === '.' || part === '..')) return null;
  return decoded;
}

function oauthNavigation(pathname, method) {
  return (method === 'GET' && (ORCA_OAUTH_NAVIGATION.has(pathname) || ORCA_OAUTH_PROXIED_NAVIGATION.has(pathname))) || /^\/oauth\/(?:authorize|callback|complete)(?:\/|$)/.test(pathname) || pathname === '/oauth/mcp/callback' || ['/oauth2/start', '/oauth2/callback'].includes(pathname) || pathname.startsWith('/api/oauth/redirect/');
}

function validBrowserRequest(req, appOrigin, pathname, backendRoute) {
  const isSafe = SAFE.has(req.method);
  const suppliedOrigin = req.headers.origin;
  if (suppliedOrigin !== undefined && suppliedOrigin !== appOrigin) return false;
  if (req.headers.referer) {
    try {
      const foreignReferer = new URL(req.headers.referer).origin !== appOrigin;
      if (foreignReferer && (!isSafe || (backendRoute && !oauthNavigation(pathname, req.method)))) return false;
    } catch { return false; }
  }
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) {
    if (!isSafe || req.headers['sec-fetch-mode'] !== 'navigate') return false;
    if (backendRoute && !oauthNavigation(pathname, req.method)) return false;
  }
  return true;
}

function rewriteLocation(value, origins, appOrigin) {
  if (typeof value !== 'string') return value;
  let target;
  try { target = new URL(value); } catch { return value; }
  if (!origins.has(target.origin) || target.username || target.password || !parsedPath(target.pathname)) return value;
  // Incoming MCP OAuth owns its issuer and browser cookie at the backend origin.
  if (target.pathname.startsWith('/orca/oauth/')) return value;
  // Only rewrite the outer redirect destination. Nested redirect_uri values and
  // OAuth authorization URLs belong to their registered issuer and stay intact.
  return appOrigin + target.pathname + target.search + target.hash;
}

function scopeCookie(cookie, backend) {
  return cookie.replace(/;\s*domain=([^;]+)/ig, (attribute, domain) => domain.trim().replace(/^\./, '').toLowerCase() === backend.hostname.toLowerCase() ? '' : attribute);
}

// A source sign-in's return that ORCA's server handed here (orca_handoff=1)
// arrives at the end of a provider -> server -> workspace redirect chain, and
// Safari sends no session cookie there (2026-10-01: the same sign-in finished
// in Chrome and failed in Safari). Answer it once with a page that reloads the
// same address as a same-origin navigation, which every browser sends with the
// session, and forward that reload as before. The address is this request's
// own, so the page can send the one-time code nowhere else.
const RELAY_PARAM = 'orca_relay';
const RELAY_SAFE_TARGET = /^\/oauth\/mcp\/callback\?[A-Za-z0-9\-._~%!$&'()*+,;=:@/?]*$/;
const RELAY_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function relaySourceReturn(req, res, pathname) {
  if (req.method !== 'GET' || pathname !== '/oauth/mcp/callback') return false;
  const raw = req.url ?? '';
  const query = new URL(raw, 'http://orca.invalid').searchParams;
  if (query.get('orca_handoff') !== '1' || query.has(RELAY_PARAM) || !RELAY_SAFE_TARGET.test(raw)) return false;
  const href = (raw + '&' + RELAY_PARAM + '=1').replaceAll('&', '&amp;').replaceAll("'", '&#39;');
  const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${href}">
<title>กำลังกลับไปที่ ORCA</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#08090a;color:#f7f8f8;font:16px/1.6 "IBM Plex Sans Thai","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
.brand{margin:0 0 12px;font-weight:700;letter-spacing:.14em;font-size:14px;color:#d7f471}
p{margin:0 0 12px;color:rgba(255,255,255,.8)}
a{color:#d7f471}
</style>
</head>
<body>
<main>
<p class="brand">ORCA</p>
<p>กำลังพากลับไปที่ ORCA…</p>
<p><a href="${href}">ไปต่อ</a></p>
</main>
</body>
</html>
`;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(page),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'content-security-policy': RELAY_CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  });
  res.end(page);
  return true;
}

function canonicalOAuthNavigation(req, res, config, appOrigin, pathname) {
  const origin = (config.backendPublicOrigin ?? config.backend).origin;
  if (req.method !== 'GET' || !ORCA_OAUTH_NAVIGATION.has(pathname) || origin === appOrigin) return false;
  // Redirect before the backend creates or consumes its host-bound state cookie.
  // Preserve the raw query, including the client's registered redirect_uri.
  res.writeHead(302, { location: origin + req.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  res.end();
  return true;
}

// The public website (landing, pricing, start, privacy) lives on the backend's public origin; the
// workspace's own "/" goes to /app. Signed-out pages link "home" through /home, which keeps only a
// known page and the language, so it can never become an open redirect.
const SITE_PAGES = new Set(['start', 'pricing', 'services', 'privacy']);
function publicSite(req, res, config, url) {
  if (!SAFE.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  const page = url.searchParams.get('to');
  const target = new URL(SITE_PAGES.has(page) ? `/${page}` : '/', (config.backendPublicOrigin ?? config.backend).origin);
  const lang = url.searchParams.get('lang');
  if (lang === 'en' || lang === 'th') target.searchParams.set('lang', lang);
  res.writeHead(302, { location: target.href, 'cache-control': 'no-store' });
  res.end();
}

function proxy(req, res, config, appOrigin, requestPath = req.url) {
  const headers = cleanHeaders(req.headers);
  for (const name of Object.keys(headers)) {
    if (name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'x-real-ip') delete headers[name];
  }
  // Transport may use a private address, while the backend validates browser
  // mutations against its configured public origin. Keep Host and Origin in
  // that same trusted namespace after validating the app request above.
  const backendOrigin = config.backendPublicOrigin ?? config.backend;
  headers.host = backendOrigin.host;
  headers['x-forwarded-for'] = req.socket.remoteAddress;
  headers['x-forwarded-host'] = backendOrigin.host;
  headers['x-forwarded-proto'] = backendOrigin.protocol.slice(0, -1);
  if (req.headers.origin) headers.origin = backendOrigin.origin;
  if (req.headers.referer) {
    try {
      const referer = new URL(req.headers.referer);
      if (referer.origin === appOrigin) headers.referer = backendOrigin.origin + referer.pathname + referer.search;
      else delete headers.referer;
    } catch { delete headers.referer; }
  }
  const transport = config.backend.protocol === 'https:' ? https : http;
  const upstream = transport.request({ protocol: config.backend.protocol, hostname: config.backend.hostname.replace(/^\[|\]$/g, ''), port: config.backend.port || undefined, path: requestPath, method: req.method, headers }, (response) => {
    clearTimeout(headerTimer);
    const responseHeaders = cleanHeaders(response.headers);
    // The adapter is same-origin; upstream CORS policy cannot grant access here.
    for (const name of Object.keys(responseHeaders)) if (name.startsWith('access-control-')) delete responseHeaders[name];
    const orcaOAuth = requestPath.split('?')[0].startsWith('/orca/oauth/');
    if (responseHeaders.location && !orcaOAuth) responseHeaders.location = rewriteLocation(responseHeaders.location, config.redirectOrigins, appOrigin);
    if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) => scopeCookie(scopeCookie(cookie, config.backend), backendOrigin));
    responseHeaders['x-content-type-options'] = 'nosniff';
    responseHeaders['x-frame-options'] = 'DENY';
    // ORCA's sign-in answers set their own policy (no-referrer after a URL that
    // carries a one-time value); everything else stays same-origin.
    if (!orcaOAuth || !responseHeaders['referrer-policy']) responseHeaders['referrer-policy'] = 'same-origin';
    res.writeHead(response.statusCode || 502, responseHeaders);
    res.flushHeaders();
    response.on('error', () => res.destroy());
    response.on('aborted', () => res.destroy());
    response.pipe(res);
  });
  const headerTimer = setTimeout(() => {
    upstream.destroy();
    if (!res.headersSent && !res.destroyed) json(res, 504, { error: 'backend_timeout' });
  }, config.headerTimeoutMs);
  headerTimer.unref();
  upstream.on('error', () => {
    clearTimeout(headerTimer);
    if (!res.headersSent && !res.destroyed) json(res, 502, { error: 'backend_unavailable' });
    else if (!res.writableEnded) res.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  res.on('close', () => { clearTimeout(headerTimer); if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
}

async function buildFile(root, relative) {
  try {
    const actualRoot = await realpath(root);
    const full = await realpath(path.resolve(actualRoot, relative));
    if (full !== actualRoot && !full.startsWith(actualRoot + path.sep)) return null;
    const info = await stat(full);
    return info.isFile() ? { full, info } : null;
  } catch { return null; }
}

async function serveStatic(req, res, pathname, config) {
  if (!SAFE.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  if (MARKETING.test(pathname) || pathname.split('/').some((part) => part.startsWith('.'))) return json(res, 404, { error: 'not_found' });
  // An invitation link carries one URL-safe token; anything else stays not-found.
  const uiRoute = UI_PATHS.has(pathname) || /^\/auth\/(?:oauth\/(?:consent|complete)|mcp\/composite)\/[^/]+$/.test(pathname) ||
    /^\/invite\/[A-Za-z0-9_-]{1,128}$/.test(pathname);
  const relative = pathname.replace(/^\//, '');
  let file = relative ? await buildFile(config.buildDir, relative) : null;
  if (!file && uiRoute) file = await buildFile(config.buildDir, relative ? `${relative}.html` : 'index.html');
  if (!file && uiRoute) file = await appDocument(config.buildDir);
  if (!file) return json(res, uiRoute ? 503 : 404, { error: uiRoute ? 'app_build_unavailable' : 'not_found' });
  const headers = { 'content-type': MIME[path.extname(file.full)] || 'application/octet-stream', 'content-length': file.info.size, 'cache-control': path.extname(file.full) === '.html' ? 'no-store' : 'public, max-age=3600' };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file.full);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function health(req, res, config) {
  if (!SAFE.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  const built = Boolean(await appDocument(config.buildDir));
  let backend = { status: 'unavailable' };
  try {
    const response = await fetch(new URL('/api/healthz', config.backend), { redirect: 'manual', signal: AbortSignal.timeout(config.healthTimeoutMs) });
    backend = { status: response.ok ? 'reachable' : 'unhealthy', statusCode: response.status };
    await response.body?.cancel();
  } catch { /* Health reports reachability, never backend URLs or error details. */ }
  json(res, built && backend.status === 'reachable' ? 200 : 503, { service: 'orca-map', app: { status: built ? 'ready' : 'build_missing' }, backend, authentication: 'not_checked' }, req.method === 'HEAD');
}

async function appDocument(root) {
  // SvelteKit SPA builds emit fallback.html without prerendering index.html.
  // index.html remains supported for a prerendered root or another static app.
  return await buildFile(root, 'fallback.html') ?? await buildFile(root, 'index.html');
}

function configuration(options = {}) {
  const backend = originURL(options.backendURL ?? 'http://127.0.0.1:8787', 'ORCA_BACKEND_URL');
  const publicOrigin = options.publicOrigin ? originURL(options.publicOrigin, 'ORCA_PUBLIC_ORIGIN') : null;
  const advertisedOrigin = options.backendPublicOrigin || (backend.origin === 'http://127.0.0.1:8787' ? 'http://localhost:8787' : null);
  const backendPublicOrigin = advertisedOrigin ? originURL(advertisedOrigin, 'ORCA_BACKEND_PUBLIC_ORIGIN') : null;
  return { backend, backendPublicOrigin, publicOrigin, buildDir: path.resolve(options.buildDir ?? 'build'), redirectOrigins: new Set([backend.origin, backendPublicOrigin?.origin].filter(Boolean)), headerTimeoutMs: options.headerTimeoutMs ?? BACKEND_HEADER_TIMEOUT_MS, healthTimeoutMs: options.healthTimeoutMs ?? 2_000 };
}

// Mount before Vite's HTML fallback with configureServer. This handles only
// backend routes; Vite retains ownership of its files, modules and HMR upgrades.
export function createBackendMiddleware(options = {}) {
  const config = configuration(options);
  return (req, res, next) => {
    try {
      const rawPath = (req.url ?? '').split('?')[0];
      const url = new URL(req.url, 'http://orca.invalid');
      const rootCallback = rawPath === '/' && ['code', 'error', 'state'].some((key) => url.searchParams.has(key));
      if (rawPath === '/home') {
        // Same as the production server: the sign-in page's links to the public website.
        const appOrigin = localOrigin(req, config.publicOrigin);
        if (!appOrigin) return json(res, 421, { error: 'unexpected_host' });
        if (!validBrowserRequest(req, appOrigin, rawPath, false)) return json(res, 403, { error: 'cross_origin_request' });
        return publicSite(req, res, config, url);
      }
      if (!rootCallback && !BACKEND_PREFIXES.some((prefix) => rawPath.startsWith(prefix))) return next();
      const appOrigin = localOrigin(req, config.publicOrigin);
      if (!appOrigin) return json(res, 421, { error: 'unexpected_host' });
      if (!METHODS.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
      const pathname = parsedPath(req.url);
      if (pathname === null) return json(res, 400, { error: 'invalid_path' });
      if (!validBrowserRequest(req, appOrigin, rootCallback ? '/oauth2/callback' : pathname, true)) return json(res, 403, { error: 'cross_origin_request' });
      if (canonicalOAuthNavigation(req, res, config, appOrigin, pathname)) return;
      if (relaySourceReturn(req, res, pathname)) return;
      return proxy(req, res, config, appOrigin, rootCallback ? '/oauth2/callback' + url.search : req.url);
    } catch {
      if (!res.headersSent && !res.destroyed) json(res, 500, { error: 'internal_error' });
      else res.destroy();
    }
  };
}

export function createAppServer(options = {}) {
  const config = configuration(options);
  const server = http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      const appOrigin = localOrigin(req, config.publicOrigin);
      if (!appOrigin) return json(res, 421, { error: 'unexpected_host' });
      if (!METHODS.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
      const pathname = parsedPath(req.url);
      if (pathname === null) return json(res, 400, { error: 'invalid_path' });
      const url = new URL(req.url, appOrigin);
      const rootCallback = pathname === '/' && ['code', 'error', 'state'].some((key) => url.searchParams.has(key));
      const backendRoute = rootCallback || BACKEND_PREFIXES.some((prefix) => pathname.startsWith(prefix));
      if (!validBrowserRequest(req, appOrigin, rootCallback ? '/oauth2/callback' : pathname, backendRoute)) return json(res, 403, { error: 'cross_origin_request' });
      if (pathname === '/healthz') return await health(req, res, config);
      if (pathname === '/home') return publicSite(req, res, config, url);
      if (canonicalOAuthNavigation(req, res, config, appOrigin, pathname)) return;
      if (relaySourceReturn(req, res, pathname)) return;
      if (backendRoute) return proxy(req, res, config, appOrigin, rootCallback ? '/oauth2/callback' + url.search : req.url);
      await serveStatic(req, res, pathname, config);
    } catch {
      if (!res.headersSent && !res.destroyed) json(res, 500, { error: 'internal_error' });
      else res.destroy();
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 60_000;
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 501 Not Implemented\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  server.on('connect', (_req, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  return server;
}
