import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, symlink, rm, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAppServer, createBackendMiddleware, libraryUploadRoute, originURL } from './server/app.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function request(base, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(base);
    const req = http.request({ hostname: target.hostname, port: target.port, path: pathname, method: options.method ?? 'GET', headers: options.headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

async function fixture(t, handler = (_req, res) => res.end('upstream'), options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orca-map-server-'));
  const buildDir = path.join(directory, 'build');
  await mkdir(path.join(buildDir, 'assets'), { recursive: true });
  await writeFile(path.join(buildDir, 'index.html'), '<!doctype html><title>ORCA app</title>');
  await writeFile(path.join(buildDir, 'assets', 'app.js'), 'export const app = true;');
  const upstream = http.createServer(handler);
  const backendURL = await listen(upstream);
  const app = createAppServer({ backendURL, buildDir, ...options });
  const appURL = await listen(app);
  t.after(async () => {
    app.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((r) => app.close(r)), new Promise((r) => upstream.close(r))]);
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, buildDir, upstream, backendURL, app, appURL };
}

test('serves app and auth routes, assets and HEAD without marketing fallback', async (t) => {
  let upstreamRequests = 0;
  const { appURL } = await fixture(t, (_req, res) => { upstreamRequests++; res.end('marketing'); });
  for (const route of ['/', '/app?view=connections', '/login/local', '/auth/oauth/consent/test-id', '/auth/oauth/complete', '/auth/mcp/composite/test-id', '/invite/Syn7hetic_Token-0123456789abcdefghijklmnopq', '/app/files/0123456789abcdef0123456789abcdef']) {
    const result = await request(appURL, route);
    assert.equal(result.status, 200, route);
    assert.match(result.body, /ORCA app/);
  }
  const asset = await request(appURL, '/assets/app.js');
  assert.match(asset.headers['content-type'], /javascript/);
  const head = await request(appURL, '/app', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  for (const route of ['/pricing', '/pricing.html', '/services/enterprise', '/start', '/missing', '/assets/missing.js', '/api-lookalike', '/invite', '/invite/', '/invite/a/b', '/invite/a.b', '/invite/' + 'x'.repeat(129),
    '/app/files', '/app/files/', '/app/files/0123456789ABCDEF0123456789abcdef', '/app/files/0123456789abcdef0123456789abcde', '/app/files/0123456789abcdef0123456789abcdef0', '/app/files/0123456789abcdef0123456789abcdef/x']) assert.equal((await request(appURL, route)).status, 404, route);
  assert.equal(upstreamRequests, 0);
});

test('forwards auth/body/query while translating validated Origin and stripping forged forwarding headers', async (t) => {
  let captured;
  const f = await fixture(t, async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    captured = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(body).toString() };
    res.writeHead(201, { 'content-type': 'application/json', 'set-cookie': ['session=sample; HttpOnly; SameSite=Lax; Path=/'], 'access-control-allow-origin': '*' });
    res.end('{"saved":true}');
  });
  const result = await request(f.appURL, '/oauth2/start?rd=%2Fapp%3Fview%3Dconnections', { method: 'POST', body: 'email=test&password=fixture', headers: { origin: f.appURL, referer: f.appURL + '/login/local', authorization: 'Bearer fixture-token', cookie: 'session=fixture-cookie', 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-for': 'attacker', forwarded: 'host=attacker.invalid' } });
  assert.equal(result.status, 201);
  assert.equal(captured.url, '/oauth2/start?rd=%2Fapp%3Fview%3Dconnections');
  assert.equal(captured.body, 'email=test&password=fixture');
  assert.equal(captured.headers.authorization, 'Bearer fixture-token');
  assert.equal(captured.headers.cookie, 'session=fixture-cookie');
  assert.equal(captured.headers.origin, f.backendURL);
  assert.equal(captured.headers.referer, f.backendURL + '/login/local');
  assert.equal(captured.headers.host, new URL(f.backendURL).host);
  assert.equal(captured.headers['x-forwarded-host'], new URL(f.backendURL).host);
  assert.notEqual(captured.headers['x-forwarded-for'], 'attacker');
  assert.equal(captured.headers.forwarded, undefined);
  assert.equal(result.headers['access-control-allow-origin'], undefined);
  assert.deepEqual(result.headers['set-cookie'], ['session=sample; HttpOnly; SameSite=Lax; Path=/']);
});

test('rejects cross-origin login, referer forgery, fetches and hostile Host before sending credentials', async (t) => {
  let seen = 0;
  const { appURL } = await fixture(t, (_req, res) => { seen++; res.end(); });
  const cases = [
    { method: 'POST', headers: { origin: 'https://attacker.invalid' } },
    { method: 'POST', headers: { origin: 'null' } },
    { method: 'POST', headers: { referer: 'https://attacker.invalid/login' } },
    { method: 'GET', headers: { referer: 'https://attacker.invalid/embedded' } },
    { method: 'POST', headers: { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate' } },
    { method: 'GET', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } },
    { method: 'GET', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } },
  ];
  for (const options of cases) assert.equal((await request(appURL, '/api/me', options)).status, 403);
  assert.equal((await request(appURL, '/api/me', { headers: { host: 'attacker.invalid' } })).status, 421);
  assert.equal(seen, 0);
});

test('source setup mutations use the canonical backend origin over a private transport address', async (t) => {
  const backendPublicOrigin = 'https://backend.orca.example';
  let requests = 0;
  const f = await fixture(t, (req, res) => {
    requests++;
    // ORCA checks both the request Host and the configured APIBaseURL.
    const sameOrigin = req.headers.origin === backendPublicOrigin &&
      req.headers.host === new URL(backendPublicOrigin).host;
    assert.equal(req.headers['x-forwarded-host'], 'backend.orca.example');
    assert.equal(req.headers['x-forwarded-proto'], 'https');
    assert.equal(req.headers.referer, backendPublicOrigin + '/app?view=connections');
    res.writeHead(sameOrigin ? 200 : 403, { 'content-type': 'application/json',
      'set-cookie': 'session=fixture; Domain=backend.orca.example; Path=/; Secure; HttpOnly; SameSite=Lax' });
    res.end(JSON.stringify({ ready: sameOrigin }));
  }, { backendPublicOrigin });
  const route = '/api/orca/sources/test-source/check';
  const headers = { origin: f.appURL, referer: f.appURL + '/app?view=connections',
    'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
  const response = await request(f.appURL, route, { method: 'POST', body: '{}', headers });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ready: true });
  assert.deepEqual(response.headers['set-cookie'], ['session=fixture; Path=/; Secure; HttpOnly; SameSite=Lax']);
  const denied = await request(f.appURL, route, {
    method: 'POST', body: '{}', headers: { ...headers, origin: 'https://foreign.example' }
  });
  assert.equal(denied.status, 403);
  assert.equal(requests, 1);
});

test('allows OAuth browser navigation and maps root callback without changing encoded query', async (t) => {
  const paths = [];
  const { appURL } = await fixture(t, (req, res) => { paths.push(req.url); res.end('callback'); });
  const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', referer: 'https://accounts.google.com/' };
  assert.equal((await request(appURL, '/?code=a%2Bb&state=c%2Fd', { headers })).status, 200);
  assert.equal(paths[0], '/oauth2/callback?code=a%2Bb&state=c%2Fd');
  assert.equal((await request(appURL, '/oauth/mcp/callback?code=abc', { headers })).status, 200);
  assert.equal((await request(appURL, '/oauth2/sign_out', { headers })).status, 403);
});

// A member signed in only here returns from a provider to the backend, which
// hands the browser back here without a Referer. The provider started the
// redirect chain, so it arrives cross-site, where Safari sends no session
// cookie. The first arrival reloads itself from here as a same-origin
// navigation, which carries the member's session, and that reload reaches the
// backend; its completion page stays here.
test('finishes a source sign-in the backend hands off, with the member session', async (t) => {
  const seen = [];
  const { appURL } = await fixture(t, (req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie });
    res.writeHead(302, { location: '/auth/oauth/complete' });
    res.end();
  });
  const query = '?code=a%2Bb&state=c%2Fd&scope=read+write&orca_handoff=1';
  // Safari: the end of the cross-site chain arrives without the session.
  const arrival = await request(appURL, '/oauth/mcp/callback' + query, { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } });
  assert.equal(arrival.status, 200);
  assert.deepEqual(seen, [], 'the backend is not asked before the session can travel');
  const reload = '/oauth/mcp/callback' + query + '&orca_relay=1';
  assert.ok(arrival.body.includes(`<meta http-equiv="refresh" content="0;url=${reload.replaceAll('&', '&amp;')}">`), arrival.body);

  const result = await request(appURL, reload, { headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', cookie: 'obot_access_token=member-session' } });
  assert.equal(result.status, 302);
  assert.equal(result.headers.location, '/auth/oauth/complete');
  assert.deepEqual(seen, [{ url: reload, cookie: 'obot_access_token=member-session' }]);
});

// The reload page carries the one-time code only to its own address: no
// Referer, no cache, no script or outside resource, never framed. Only the
// handed-off return reloads, once, and an address with anything a URL does
// not need is forwarded as before instead of being written into the page.
test('the handed-off return reloads once from a sealed page', async (t) => {
  const seen = [];
  const { appURL } = await fixture(t, (req, res) => { seen.push(req.url); res.end('backend'); });
  const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' };
  const page = await request(appURL, "/oauth/mcp/callback?code=it's&state=s&orca_handoff=1", { headers });
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.ok(page.body.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(page.body.includes('href="/oauth/mcp/callback?code=it&#39;s&amp;state=s&amp;orca_handoff=1&amp;orca_relay=1"'), page.body);
  assert.ok(!/<script|src=|https?:\/\//i.test(page.body.replace('http-equiv', '')), 'nothing outside the page');
  assert.deepEqual(seen, []);

  for (const target of [
    '/oauth/mcp/callback?code=c&state=s&orca_handoff=1&orca_relay=1',
    '/oauth/mcp/callback?code=c&state=s',
    '/oauth/mcp/callback?code=c&state=s&orca_handoff=2',
    '/oauth/mcp/callback?code=c"><b>&state=s&orca_handoff=1',
  ]) {
    const forwarded = await request(appURL, target, { headers });
    assert.equal(forwarded.status, 200, target);
    assert.equal(forwarded.body, 'backend', target);
  }
  assert.equal(seen.length, 4);
  assert.equal((await request(appURL, '/oauth/mcp/callback?code=c&state=s&orca_handoff=1', { method: 'HEAD', headers })).status, 200);
  assert.equal(seen.length, 5, 'only a GET reloads');
});

// Production serves a static build: nothing answers a route's __data.json, so
// a server-only loader breaks its page. The debugger's return page, which a
// handed-off sign-in can reach, relies on the static server's no-store instead.
test('sends /home to the public website, keeping only a known page and the language', async (t) => {
  const { appURL } = await fixture(t, (_req, res) => res.end('upstream'), { backendPublicOrigin: 'https://orca.example' });
  let res = await request(appURL, '/home?lang=en');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://orca.example/?lang=en');
  assert.equal(res.headers['cache-control'], 'no-store');
  res = await request(appURL, '/home?to=start&lang=th');
  assert.equal(res.headers.location, 'https://orca.example/start?lang=th');
  res = await request(appURL, '/home?to=//evil.example/x&lang=fr');
  assert.equal(res.headers.location, 'https://orca.example/');
  res = await request(appURL, '/home', { method: 'HEAD' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://orca.example/');
});

test('Vite middleware sends /home to the public website too', async (t) => {
  const f = await fixture(t, (_req, res) => res.end('upstream'), { backendPublicOrigin: 'https://orca.example' });
  const middleware = createBackendMiddleware({ backendURL: f.backendURL, backendPublicOrigin: 'https://orca.example' });
  const vite = http.createServer((req, res) => middleware(req, res, () => res.end('vite')));
  const viteURL = await listen(vite);
  t.after(async () => { vite.closeAllConnections(); await new Promise((resolve) => vite.close(resolve)); });
  let res = await request(viteURL, '/home?to=pricing&lang=en');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://orca.example/pricing?lang=en');
  res = await request(viteURL, '/home', { method: 'HEAD' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://orca.example/');
  assert.equal((await request(viteURL, '/home', { method: 'POST', headers: { origin: viteURL } })).status, 405);
  assert.equal((await request(viteURL, '/homepage')).body, 'vite');
});

test('serves pages without server data, including the uncached debugger return', async (t) => {
  const { appURL } = await fixture(t);
  const page = await request(appURL, '/oauth-debugger/callback?code=a%2Bb&state=c');
  assert.equal(page.status, 200);
  assert.match(page.body, /ORCA app/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal((await request(appURL, '/oauth-debugger/callback/__data.json')).status, 404);
  const routes = await readdir(new URL('./src/routes', import.meta.url), { recursive: true });
  assert.deepEqual(routes.filter((file) => /(^|\/)\+(?:page|layout)\.server\.|(^|\/)\+server\./.test(file)), []);
});

test('rewrites only exact backend Location origin and leaves nested OAuth redirect_uri intact', async (t) => {
  let location;
  const f = await fixture(t, (_req, res) => { res.writeHead(302, { location }); res.end(); });
  const nested = encodeURIComponent(f.backendURL + '/oauth/mcp/callback');
  location = f.backendURL + '/oauth2/start?rd=%2Fapp&redirect_uri=' + nested;
  let response = await request(f.appURL, '/api/redirect');
  assert.equal(response.headers.location, f.appURL + '/oauth2/start?rd=%2Fapp&redirect_uri=' + nested);
  location = 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' + nested;
  response = await request(f.appURL, '/api/redirect');
  assert.equal(response.headers.location, location);
  location = f.backendURL.replace('127.0.0.1', '127.0.0.1.attacker.invalid') + '/login';
  response = await request(f.appURL, '/api/redirect');
  assert.equal(response.headers.location, location);
});

test('preserves auth errors and constrains backend Domain cookies to the app host', async (t) => {
  const f = await fixture(t, (_req, res) => {
    res.writeHead(401, { 'set-cookie': 'session=value; Domain=127.0.0.1; Path=/; Secure; HttpOnly; SameSite=Lax', 'www-authenticate': 'Bearer realm="orca"' });
    res.end('not signed in');
  });
  const result = await request(f.appURL, '/api/me');
  assert.equal(result.status, 401);
  assert.equal(result.body, 'not signed in');
  assert.equal(result.headers['www-authenticate'], 'Bearer realm="orca"');
  assert.deepEqual(result.headers['set-cookie'], ['session=value; Path=/; Secure; HttpOnly; SameSite=Lax']);
});

test('rejects traversal, symlink escape and private files', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.directory, 'outside.txt'), 'outside');
  await symlink(path.join(f.directory, 'outside.txt'), path.join(f.buildDir, 'escape.txt'));
  await writeFile(path.join(f.buildDir, '.env'), 'not public');
  for (const route of ['/assets/%2e%2e/outside.txt', '/%2fapi/me', '/%252e%252e/outside.txt', '/%00', '/%zz', '/%5capi/me']) assert.equal((await request(f.appURL, route)).status, 400, route);
  for (const route of ['/escape.txt', '/.env']) assert.equal((await request(f.appURL, route)).status, 404, route);
});

test('reports app availability separately from backend reachability and authentication', async (t) => {
  let status = 200;
  const f = await fixture(t, (_req, res) => { res.writeHead(status); res.end(); });
  let result = await request(f.appURL, '/healthz');
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { service: 'orca-map', app: { status: 'ready' }, backend: { status: 'reachable', statusCode: 200 }, authentication: 'not_checked' });
  status = 503;
  result = await request(f.appURL, '/healthz');
  assert.equal(result.status, 503);
  assert.equal(JSON.parse(result.body).backend.status, 'unhealthy');
  assert.ok(!result.body.includes(f.backendURL));
  await rm(path.join(f.buildDir, 'index.html'));
  result = await request(f.appURL, '/healthz');
  assert.equal(JSON.parse(result.body).app.status, 'build_missing');
});

test('backend failures are sanitized and unknown methods cannot use the proxy', async (t) => {
  const f = await fixture(t);
  await new Promise((resolve) => f.upstream.close(resolve));
  const result = await request(f.appURL, '/api/me');
  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(result.body), { error: 'backend_unavailable' });
  assert.equal((await request(f.appURL, '/api/me', { method: 'TRACE' })).status, 405);
  assert.equal((await request(f.appURL, '/app', { method: 'POST', body: 'x' })).status, 405);
});

test('times out missing upstream response headers', async (t) => {
  const f = await fixture(t, () => {}, { headerTimeoutMs: 40 });
  const result = await request(f.appURL, '/api/hang');
  assert.equal(result.status, 504);
  assert.equal(JSON.parse(result.body).error, 'backend_timeout');
});

test('default header deadline lets a bounded MCP call and audit finalization finish', async (t) => {
  let upstreamResponse;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const f = await fixture(t, (_req, res) => {
    upstreamResponse = res;
    markStarted();
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = request(f.appURL, '/api/orca/hubs/test-hub/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{}}'
  });
  await started;
  // The backend's 90s MCP budget plus audit finalization must not be cut off
  // by the proxy's former 30s deadline. No wall-clock sleep is needed.
  t.mock.timers.tick(95_000);
  upstreamResponse.writeHead(200, { 'content-type': 'application/json' });
  upstreamResponse.end('{"jsonrpc":"2.0","id":1,"result":{"content":[]}}');
  const result = await pending;
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body).result, { content: [] });
});

test('default header deadline still cancels a stalled upstream at 120 seconds', async (t) => {
  let markStarted;
  let markClosed;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const closed = new Promise((resolve) => { markClosed = resolve; });
  const f = await fixture(t, (_req, res) => {
    res.on('close', markClosed);
    markStarted();
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = request(f.appURL, '/api/orca/hubs/test-hub/mcp');
  await started;
  t.mock.timers.tick(120_000);
  const result = await pending;
  assert.equal(result.status, 504);
  assert.deepEqual(JSON.parse(result.body), { error: 'backend_timeout' });
  await closed;
});

test('streams SSE before upstream completion and aborts upstream after downstream disconnect', async (t) => {
  let upstreamClosed;
  const closed = new Promise((resolve) => { upstreamClosed = resolve; });
  const f = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ready\n\n');
    res.on('close', upstreamClosed);
  });
  await new Promise((resolve, reject) => {
    const req = http.get(f.appURL + '/api/events', (res) => {
      res.once('data', (chunk) => {
        try { assert.equal(chunk.toString(), 'data: ready\n\n'); } catch (error) { reject(error); }
        res.destroy();
        resolve();
      });
      res.on('error', () => {});
    });
    req.on('error', reject);
  });
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream did not close')), 1000).unref())]);
});

test('rejects non-origin and credential-bearing backend configuration', () => {
  for (const value of ['file:///etc/passwd', 'http://user:password@localhost:8787', 'https://example.com/api', 'https://example.com?token=x']) assert.throws(() => originURL(value, 'backend'), /HTTP\(S\) origin/);
});

test('requires the configured public Host and validates HTTPS browser origin before upstream rewrite', async (t) => {
  let seenOrigin;
  const f = await fixture(t, (req, res) => { seenOrigin = req.headers.origin; res.end('ok'); }, { publicOrigin: 'https://app.example.com' });
  assert.equal((await request(f.appURL, '/api/me')).status, 421);
  assert.equal((await request(f.appURL, '/api/me', { headers: { host: 'app.example.com', origin: 'http://app.example.com' } })).status, 403);
  assert.equal((await request(f.appURL, '/api/me', { headers: { host: 'app.example.com', origin: 'https://app.example.com' } })).status, 200);
  assert.equal(seenOrigin, f.backendURL);
});

test('standalone startup trusts Render URL fallback and prefers an explicit public origin', { timeout: 10_000 }, async (t) => {
  const f = await fixture(t, (_req, res) => res.end('healthy'));
  for (const explicitOrigin of [undefined, 'https://workspace.example.com']) {
    const reserved = http.createServer();
    const address = await listen(reserved);
    const port = new URL(address).port;
    await new Promise((resolve) => reserved.close(resolve));
    const renderOrigin = 'https://orca-app-random.onrender.com';
    const child = spawn(process.execPath, [fileURLToPath(new URL('./server/index.mjs', import.meta.url))], {
      env: {
        HOST: '127.0.0.1', PORT: port, ORCA_BUILD_DIR: f.buildDir,
        ORCA_BACKEND_URL: f.backendURL, RENDER_EXTERNAL_URL: renderOrigin,
        ...(explicitOrigin ? { ORCA_PUBLIC_ORIGIN: explicitOrigin } : {})
      },
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const stop = async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    };
    t.after(stop);
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Adapter exited before listening')));
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('adapter is listening on port')) resolve();
      });
    });
    const trusted = explicitOrigin ?? renderOrigin;
    const healthy = await request(address, '/healthz', { headers: { host: new URL(trusted).host, origin: trusted } });
    assert.equal(healthy.status, 200);
    assert.equal(JSON.parse(healthy.body).backend.status, 'reachable');
    assert.equal((await request(address, '/app')).status, 421);
    if (explicitOrigin) {
      assert.equal((await request(address, '/app', { headers: { host: new URL(renderOrigin).host } })).status, 421);
    }
    await stop();
  }
});

test('strips hop-by-hop headers nominated by the sender', async (t) => {
  let headers;
  const f = await fixture(t, (req, res) => { headers = req.headers; res.writeHead(200, { connection: 'x-upstream-only', 'x-upstream-only': 'internal' }); res.end('ok'); });
  const result = await request(f.appURL, '/api/me', { headers: { connection: 'x-downstream-only', 'x-downstream-only': 'private-hop' } });
  assert.equal(headers['x-downstream-only'], undefined);
  assert.equal(result.headers['x-upstream-only'], undefined);
});

test('SPA fallback-only build serves root/login/app and passes health without index.html', async (t) => {
  const f = await fixture(t, (_req, res) => res.end('healthy'));
  await rm(path.join(f.buildDir, 'index.html'));
  await writeFile(path.join(f.buildDir, 'fallback.html'), '<!doctype html><title>Workspace SPA</title>');
  for (const route of ['/', '/app?view=connections', '/login', '/login/local?rd=%2Fapp', '/auth/oauth/complete']) {
    const result = await request(f.appURL, route);
    assert.equal(result.status, 200, route);
    assert.match(result.body, /Workspace SPA/);
  }
  const health = await request(f.appURL, '/healthz');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).app.status, 'ready');
  assert.equal((await request(f.appURL, '/missing')).status, 404);
});

test('notice routes serve real local files only and never proxy or receive SPA HTML', async (t) => {
  let upstreamRequests = 0;
  const f = await fixture(t, (_req, res) => { upstreamRequests++; res.end('backend notices'); });
  await mkdir(path.join(f.buildDir, 'third-party', 'packages'), { recursive: true });
  await writeFile(path.join(f.buildDir, 'third-party.html'), '<title>Local notices</title>');
  await writeFile(path.join(f.buildDir, 'third-party', 'packages', 'LICENSE.txt'), 'Package license');
  assert.match((await request(f.appURL, '/third-party.html')).body, /Local notices/);
  assert.equal((await request(f.appURL, '/third-party/packages/LICENSE.txt')).body, 'Package license');
  for (const route of ['/third-party/', '/third-party/missing.html', '/third-party-runtime/not-installed.txt']) assert.equal((await request(f.appURL, route)).status, 404);
  assert.equal((await request(f.appURL, '/third-party.html', { method: 'POST' })).status, 405);
  assert.equal(upstreamRequests, 0);
});

test('relative local-auth login redirects round trip through a fallback-only app', async (t) => {
  const f = await fixture(t, async (req, res) => {
    if (req.url.startsWith('/oauth2/start') && req.method === 'GET') {
      res.writeHead(302, { location: '/login/local?rd=%2Fapp%3Fview%3Dconnections' });
      return res.end();
    }
    if (req.url === '/oauth2/start' && req.method === 'POST') {
      assert.equal(new URL(req.headers.origin).host, req.headers.host);
      const body = [];
      for await (const chunk of req) body.push(chunk);
      const form = new URLSearchParams(Buffer.concat(body).toString());
      res.writeHead(302, { location: form.get('rd'), 'set-cookie': 'session=fixture; Path=/; HttpOnly; SameSite=Lax' });
      return res.end();
    }
    if (req.url === '/api/me') {
      res.writeHead(req.headers.cookie === 'session=fixture' ? 200 : 401);
      return res.end();
    }
    res.writeHead(404); res.end();
  });
  await rm(path.join(f.buildDir, 'index.html'));
  await writeFile(path.join(f.buildDir, 'fallback.html'), '<title>App login</title>');
  const start = await request(f.appURL, '/oauth2/start?rd=%2Fapp%3Fview%3Dconnections');
  assert.equal(start.status, 302);
  assert.equal((await request(f.appURL, start.headers.location)).status, 200);
  const login = await request(f.appURL, '/oauth2/start', { method: 'POST', headers: { origin: f.appURL, referer: f.appURL + start.headers.location, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ rd: '/app?view=connections', email: 'fixture@example.invalid', password: 'test-fixture-only' }).toString() });
  assert.equal(login.status, 302);
  assert.equal(login.headers.location, '/app?view=connections');
  assert.equal((await request(f.appURL, login.headers.location)).status, 200);
  assert.equal((await request(f.appURL, '/api/me', { headers: { cookie: login.headers['set-cookie'][0].split(';')[0] } })).status, 200);
});

test('Vite middleware reuses secure auth proxy while passing UI and filesystem modules to Vite', async (t) => {
  let seen;
  const f = await fixture(t, (req, res) => { seen = { origin: req.headers.origin, path: req.url }; res.end('api'); });
  const middleware = createBackendMiddleware({ backendURL: f.backendURL });
  const vite = http.createServer((req, res) => middleware(req, res, () => res.end('vite')));
  const viteURL = await listen(vite);
  t.after(async () => { vite.closeAllConnections(); await new Promise((resolve) => vite.close(resolve)); });
  assert.equal((await request(viteURL, '/@fs/workspace%20name/module.js')).body, 'vite');
  assert.equal((await request(viteURL, '/app')).body, 'vite');
  assert.equal((await request(viteURL, '/api/me', { headers: { origin: viteURL } })).body, 'api');
  assert.equal(seen.origin, f.backendURL);
  assert.equal((await request(viteURL, '/oauth2/start', { method: 'POST', headers: { origin: 'https://attacker.invalid' } })).status, 403);
  await request(viteURL, '/?code=fixture%2Bcode&state=fixture');
  assert.equal(seen.path, '/oauth2/callback?code=fixture%2Bcode&state=fixture');
  // A handed-off source sign-in reloads from the page in development too.
  const navigation = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' };
  const arrival = await request(viteURL, '/oauth/mcp/callback?code=c&state=s&orca_handoff=1', { headers: navigation });
  assert.ok(arrival.body.includes('content="0;url=/oauth/mcp/callback?code=c&amp;state=s&amp;orca_handoff=1&amp;orca_relay=1"'), arrival.body);
  assert.equal(seen.path, '/oauth2/callback?code=fixture%2Bcode&state=fixture');
  assert.equal((await request(viteURL, '/oauth/mcp/callback?code=c&state=s&orca_handoff=1&orca_relay=1', { headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate' } })).body, 'api');
  assert.equal(seen.path, '/oauth/mcp/callback?code=c&state=s&orca_handoff=1&orca_relay=1');
});

for (const mode of ['standalone', 'vite']) {
  test(`${mode}: incoming ORCA OAuth navigation reaches the canonical issuer before any state cookie is set`, async (t) => {
    let seen = 0;
    const canonical = 'https://identity.orca.example';
    const f = await fixture(t, (_req, res) => { seen++; res.setHeader('set-cookie', 'state=fixture; Path=/orca/oauth'); res.end('upstream'); }, { backendPublicOrigin: canonical });
    let appURL = f.appURL;
    if (mode === 'vite') {
      const middleware = createBackendMiddleware({ backendURL: f.backendURL, backendPublicOrigin: canonical });
      const vite = http.createServer((req, res) => middleware(req, res, () => res.end('vite')));
      appURL = await listen(vite);
      t.after(async () => { vite.closeAllConnections(); await new Promise((resolve) => vite.close(resolve)); });
    }
    const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', referer: 'https://idp.example/' };
    for (const pathname of [
      '/orca/oauth/authorize?client_id=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A19876%2Fcallback&state=a%2Bb%2Fc',
      '/orca/oauth/callback?code=opaque%2Bcode&state=opaque%2Fstate',
      '/orca/oauth/session?state=opaque%2Bstate',
      '/orca/oauth/login?state=opaque%2Fstate',
    ]) {
      const response = await request(appURL, pathname, { headers });
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, canonical + pathname);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(response.body, '');
    }
    assert.equal(seen, 0, 'the app must not create or consume an issuer state cookie');
    for (const [pathname, method] of [
      ['/orca/oauth/authorize/extra', 'GET'], ['/orca/oauth/callback/extra', 'GET'],
      ['/orca/oauth/session/extra', 'GET'], ['/orca/oauth/login/extra', 'GET'],
      ['/orca/oauth/consent', 'GET'], ['/orca/oauth/token', 'GET'],
      ['/orca/oauth/authorize', 'HEAD'], ['/orca/oauth/callback', 'HEAD'],
      ['/orca/oauth/session', 'HEAD'], ['/orca/oauth/login', 'HEAD'],
      ['/orca/oauth/authorize', 'POST'], ['/orca/oauth/callback', 'POST'],
      ['/orca/oauth/session', 'POST'], ['/orca/oauth/login', 'POST'],
      ['/orca/oauth/consent', 'POST'], ['/orca/oauth/register', 'POST'], ['/orca/oauth/token', 'POST'],
    ]) assert.equal((await request(appURL, pathname, { method, headers })).status, 403, `${method} ${pathname}`);
    assert.equal((await request(appURL, '/orca/oauth/authorize', { headers: { ...headers, 'sec-fetch-mode': 'cors' } })).status, 403);
    assert.equal((await request(appURL, '/orca/oauth/callback', { headers: { ...headers, origin: 'https://idp.example' } })).status, 403);
    assert.equal(seen, 0);
  });

  test(`${mode}: ORCA issuer metadata and same-origin consent retain canonical URLs without widening mutation access`, async (t) => {
    const canonical = 'https://identity.orca.example';
    const captured = [];
    const metadata = { issuer: canonical + '/orca', authorization_endpoint: canonical + '/orca/oauth/authorize', token_endpoint: canonical + '/orca/oauth/token', registration_endpoint: canonical + '/orca/oauth/register' };
    const f = await fixture(t, async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      captured.push({ path: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (req.url === '/orca/.well-known/oauth-authorization-server') {
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(metadata));
      } else if (req.url === '/orca/oauth/consent') {
        res.writeHead(302, { location: canonical + '/client/callback?code=fixture&state=original%2Bstate' }); res.end();
      } else if (req.url === '/api/redirect-incoming-oauth') {
        res.writeHead(302, { location: canonical + '/orca/oauth/authorize?redirect_uri=' + encodeURIComponent(canonical + '/registered-client/callback') }); res.end();
      } else { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }
    }, { backendPublicOrigin: canonical });
    let appURL = f.appURL;
    if (mode === 'vite') {
      const middleware = createBackendMiddleware({ backendURL: f.backendURL, backendPublicOrigin: canonical });
      const vite = http.createServer((req, res) => middleware(req, res, () => res.end('vite')));
      appURL = await listen(vite);
      t.after(async () => { vite.closeAllConnections(); await new Promise((resolve) => vite.close(resolve)); });
    }
    const discovery = await request(appURL, '/orca/.well-known/oauth-authorization-server');
    assert.equal(discovery.status, 200);
    assert.deepEqual(JSON.parse(discovery.body), metadata);
    const headers = { origin: appURL, referer: appURL + '/orca/oauth/callback', 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' };
    const consent = await request(appURL, '/orca/oauth/consent', { method: 'POST', headers, body: 'state=fixture%2Bstate&decision=allow' });
    assert.equal(consent.status, 302);
    assert.equal(consent.headers.location, canonical + '/client/callback?code=fixture&state=original%2Bstate');
    assert.equal(captured[1].headers.origin, canonical);
    assert.equal(captured[1].body, 'state=fixture%2Bstate&decision=allow');
    const redirect = await request(appURL, '/api/redirect-incoming-oauth');
    assert.equal(redirect.headers.location, canonical + '/orca/oauth/authorize?redirect_uri=' + encodeURIComponent(canonical + '/registered-client/callback'));
    for (const route of ['/orca/oauth/consent', '/orca/oauth/register', '/orca/oauth/token']) {
      const before = captured.length;
      assert.equal((await request(appURL, route, { method: 'POST', headers: { ...headers, origin: 'https://foreign.example' }, body: 'state=fixture' })).status, 403);
      assert.equal(captured.length, before);
      assert.equal((await request(appURL, route, { method: 'POST', headers, body: 'fixture=1' })).status, route.endsWith('/consent') ? 302 : 200);
    }
  });
}

// ---------------------------------------------------------------------------
// W1-B4 (C4 design §14h): an AI app's ORCA sign-in on this workspace's login.
// ---------------------------------------------------------------------------

const HANDOFF_CODE = 'Syn7hetic-hand_off-code-0123456789abcdefghi';
const HANDOFF_REQUEST = 'Syn7hetic-hand_off-request-0123456789abcdef';

test('the hand-off page is served; nothing below it is', async (t) => {
  let upstream = 0;
  const { appURL } = await fixture(t, (_req, res) => { upstream++; res.end('backend'); });
  for (const route of ['/login/ai', '/login/ai?signed=1', '/login/ai?error=expired&lang=en']) {
    const page = await request(appURL, route);
    assert.equal(page.status, 200, route);
    assert.match(page.body, /ORCA app/);
    assert.equal(page.headers['cache-control'], 'no-store');
  }
  for (const route of ['/login/ai/x', '/login/aix']) assert.equal((await request(appURL, route)).status, 404, route);
  assert.equal(upstream, 0);
});

for (const mode of ['standalone', 'vite']) {
  async function app(t, handler, backendPublicOrigin = 'https://backend.orca.example') {
    const f = await fixture(t, handler, { backendPublicOrigin });
    if (mode === 'standalone') return f;
    const middleware = createBackendMiddleware({ backendURL: f.backendURL, backendPublicOrigin });
    const vite = http.createServer((req, res) => middleware(req, res, () => res.end('vite')));
    const appURL = await listen(vite);
    t.after(async () => { vite.closeAllConnections(); await new Promise((resolve) => vite.close(resolve)); });
    return { ...f, appURL };
  }

  test(`${mode}: the code and the backup page go to the configured backend origin with the raw query`, async (t) => {
    let seen = 0;
    const { appURL } = await app(t, (_req, res) => { seen++; res.end('backend'); });
    const same = { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', referer: appURL + '/login/ai' };
    for (const pathname of [`/orca/oauth/handoff?code=${HANDOFF_CODE}`, `/orca/oauth/handoff?code=a%2Bb&redirect=https%3A%2F%2Fevil.example`, '/orca/oauth/fallback', '/orca/oauth/fallback?to=https%3A%2F%2Fevil.example']) {
      const response = await request(appURL, pathname, { headers: same });
      assert.equal(response.status, 302, pathname);
      // Only the configured origin, never the query or the Host: the raw path and query follow it.
      assert.equal(response.headers.location, 'https://backend.orca.example' + pathname);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.headers['set-cookie'], undefined);
    }
    assert.equal((await request(appURL, '/orca/oauth/handoff?code=x', { headers: { host: 'evil.example' } })).status, 421);
    // The two are exact paths; anything else under them is not a navigation.
    const cross = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' };
    for (const [pathname, method] of [['/orca/oauth/handoff/extra', 'GET'], ['/orca/oauth/fallback/extra', 'GET'], ['/orca/oauth/handoff', 'POST'], ['/orca/oauth/handoff/begin', 'HEAD'], ['/orca/oauth/handoff/begin/x', 'GET'], ['/orca/oauth/handoff/confirm', 'POST']])
      assert.equal((await request(appURL, pathname, { method, headers: cross })).status, 403, `${method} ${pathname}`);
    assert.equal(seen, 0, 'the backend never sees them here');
  });

  test(`${mode}: the claim and the confirm are proxied with this workspace's cookies, their answers kept as the backend wrote them`, async (t) => {
    const seen = [];
    const { appURL } = await app(t, (req, res) => {
      seen.push({ url: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization, host: req.headers.host, referer: req.headers.referer });
      if (req.url.startsWith('/orca/oauth/handoff/begin')) {
        res.writeHead(302, {
          location: 'https://workspace.orca.example/login/ai',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'set-cookie': [
            'orca_ai_handoff=synthetic; Path=/api/orca/ai-sign-in; Max-Age=600; HttpOnly; Secure; SameSite=Lax',
            'orca_ai_handoff=synthetic; Path=/orca/oauth/handoff; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
          ]
        });
      } else {
        res.writeHead(302, { location: 'https://claude.example/api/callback?code=client-code&state=client%2Bstate', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      }
      res.end();
    });
    // Another site started both: the AI app's authorize, and the consent page's 303.
    const cross = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', cookie: 'obot_access_token=workspace-session; orca_ai_handoff=synthetic' };
    const begin = await request(appURL, `/orca/oauth/handoff/begin?request=${HANDOFF_REQUEST}`, { headers: cross });
    assert.equal(begin.status, 302);
    assert.equal(begin.headers.location, 'https://workspace.orca.example/login/ai', 'the backend\'s absolute Location passes');
    assert.equal(begin.headers['referrer-policy'], 'no-referrer', 'kept: the next page must not carry ?request= (Codex review 57, MINOR 3)');
    assert.equal(begin.headers['cache-control'], 'no-store');
    assert.deepEqual(begin.headers['set-cookie'], [
      'orca_ai_handoff=synthetic; Path=/api/orca/ai-sign-in; Max-Age=600; HttpOnly; Secure; SameSite=Lax',
      'orca_ai_handoff=synthetic; Path=/orca/oauth/handoff; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
    ]);
    const confirm = await request(appURL, '/orca/oauth/handoff/confirm', { headers: cross });
    assert.equal(confirm.status, 302);
    assert.equal(confirm.headers.location, 'https://claude.example/api/callback?code=client-code&state=client%2Bstate');
    assert.equal(confirm.headers['referrer-policy'], 'no-referrer');
    assert.deepEqual(seen.map((item) => item.url), [`/orca/oauth/handoff/begin?request=${HANDOFF_REQUEST}`, '/orca/oauth/handoff/confirm']);
    for (const item of seen) {
      assert.equal(item.cookie, 'obot_access_token=workspace-session; orca_ai_handoff=synthetic', 'the workspace\'s own cookies reach the backend');
      assert.equal(item.authorization, undefined, 'a cookie-only browser session, never a key');
      assert.equal(item.host, 'backend.orca.example');
      assert.equal(item.referer, undefined);
    }
  });
}

test('the proxy keeps ORCA sign-in pages\' own referrer policy and sets same-origin everywhere else', async (t) => {
  const f = await fixture(t, (req, res) => {
    res.writeHead(200, { 'referrer-policy': req.url.startsWith('/orca/oauth/') ? 'no-referrer' : 'unsafe-url' });
    res.end('ok');
  });
  assert.equal((await request(f.appURL, '/orca/oauth/handoff/begin?request=x')).headers['referrer-policy'], 'no-referrer');
  assert.equal((await request(f.appURL, '/api/me')).headers['referrer-policy'], 'same-origin');
  const bare = await fixture(t, (_req, res) => res.end('ok'));
  assert.equal((await request(bare.appURL, '/orca/oauth/handoff/confirm')).headers['referrer-policy'], 'same-origin', 'an answer without one gets the default');
});

test('the mint goes through the /api proxy with the page\'s account and cookies, same-origin only', async (t) => {
  const seen = [];
  const f = await fixture(t, async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    seen.push({ method: req.method, url: req.url, account: req.headers['x-orca-account'], cookie: req.headers.cookie, authorization: req.headers.authorization, origin: req.headers.origin, body: Buffer.concat(body).toString() });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ code: HANDOFF_CODE, expiresIn: 120 }));
  });
  const headers = { origin: f.appURL, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-orca-account': '41', cookie: 'obot_access_token=workspace-session; orca_ai_handoff=synthetic' };
  const minted = await request(f.appURL, '/api/orca/ai-sign-in/handoff', { method: 'POST', headers, body: '{"decision":"continue"}' });
  assert.equal(minted.status, 200);
  assert.equal(minted.headers['cache-control'], 'no-store');
  assert.deepEqual(seen, [{ method: 'POST', url: '/api/orca/ai-sign-in/handoff', account: '41', cookie: 'obot_access_token=workspace-session; orca_ai_handoff=synthetic', authorization: undefined, origin: f.backendURL, body: '{"decision":"continue"}' }]);
  for (const bad of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }])
    assert.equal((await request(f.appURL, '/api/orca/ai-sign-in/handoff', { method: 'POST', headers: { ...headers, ...bad }, body: '{"decision":"continue"}' })).status, 403, JSON.stringify(bad));
  assert.equal(seen.length, 1);
});

// The Google-only path through the proxy (Codex review 58, MINOR 4): /login?ai=1
// starts Google with the fixed hand-off return, Google comes back cross-site to
// this workspace's /oauth2/callback, and the backend's relative Location and
// Lax session cookie pass unchanged, host-only.
test('Google sign-in for an AI app returns to the hand-off page with a host-only Lax session', async (t) => {
  const seen = [];
  const f = await fixture(t, (req, res) => {
    seen.push(req.url);
    const url = new URL(req.url, 'http://backend.invalid');
    if (url.pathname === '/oauth2/start') {
      assert.equal(url.searchParams.get('rd'), '/login/ai?signed=1');
      assert.equal(url.searchParams.get('via'), 'google');
      res.writeHead(302, { location: 'https://accounts.google.example/o/oauth2/v2/auth?redirect_uri=' + encodeURIComponent('https://workspace.orca.example/oauth2/callback') + '&state=google-state' });
    } else if (url.pathname === '/oauth2/callback') {
      res.writeHead(302, { location: '/login/ai?signed=1', 'set-cookie': `obot_access_token=workspace-session; Domain=${new URL(f.backendURL).hostname}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax` });
    } else res.writeHead(404);
    res.end();
  });
  const start = await request(f.appURL, '/oauth2/start?rd=%2Flogin%2Fai%3Fsigned%3D1&obot-auth-provider=default%2Flocal-auth-provider&via=google', { headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', referer: f.appURL + '/login?ai=1' } });
  assert.equal(start.status, 302);
  assert.match(start.headers.location, /^https:\/\/accounts\.google\.example\//, 'Google\'s own address is never rewritten');
  const back = await request(f.appURL, '/oauth2/callback?code=google-code&state=google-state', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', referer: 'https://accounts.google.example/' } });
  assert.equal(back.status, 302);
  assert.equal(back.headers.location, '/login/ai?signed=1');
  assert.deepEqual(back.headers['set-cookie'], ['obot_access_token=workspace-session; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax'], 'host-only, and still Lax so the confirm\'s cross-site hop carries it');
  const page = await request(f.appURL, back.headers.location);
  assert.equal(page.status, 200);
  assert.match(page.body, /ORCA app/);
  assert.deepEqual(seen, ['/oauth2/start?rd=%2Flogin%2Fai%3Fsigned%3D1&obot-auth-provider=default%2Flocal-auth-provider&via=google', '/oauth2/callback?code=google-code&state=google-state']);
});

test('a wrong password in AI mode comes back through the sign-in page with the hand-off return', async (t) => {
  const f = await fixture(t, async (req, res) => {
    for await (const _chunk of req) { /* drain */ }
    res.writeHead(302, { location: '/login/local?rd=%2Flogin%2Fai%3Fsigned%3D1&error=Incorrect+email+or+password.' });
    res.end();
  });
  const failed = await request(f.appURL, '/oauth2/start', { method: 'POST', headers: { origin: f.appURL, referer: f.appURL + '/login?ai=1', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ rd: '/login/ai?signed=1', email: 'member@example.test', password: 'synthetic-wrong-password' }).toString() });
  assert.equal(failed.status, 302);
  assert.equal(failed.headers.location, '/login/local?rd=%2Flogin%2Fai%3Fsigned%3D1&error=Incorrect+email+or+password.');
  assert.equal((await request(f.appURL, failed.headers.location)).status, 200);
});

test('the server logs no request, so no code, request or state reaches a log', async () => {
  const source = await readFile(new URL('./server/app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.|process\.stdout|process\.stderr/);
});

// Knowledge library v2 (C4 §14m S7): the two upload routes take up to 15
// minutes to arrive and to be answered; every other request keeps 120 s.
test('only the library\'s and the document templates\' upload routes are upload routes', () => {
  for (const path of ['/api/orca/hubs/hub-sales/library/files', '/api/orca/orgs/org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/hubs/hub-sales/library/files', '/api/orca/hubs/hub-sales/library/files/orl-1/versions',
    '/api/orca/hubs/hub-sales/doc-templates', '/api/orca/hubs/hub-sales/doc-templates/orl-1/versions'])
    assert.equal(libraryUploadRoute('POST', path), true, path);
  for (const [method, path] of [
    ['GET', '/api/orca/hubs/hub-sales/library/files'],
    ['PUT', '/api/orca/hubs/hub-sales/library/files/orl-1/versions'],
    ['POST', '/api/orca/hubs/hub-sales/library/files/orl-1/reextract'],
    ['POST', '/api/orca/hubs/hub-sales/library/files/orl-1/publish-pending'],
    ['POST', '/api/orca/hubs/hub-sales/library/files/orl-1'],
    ['POST', '/api/orca/hubs/hub-sales/library/items'],
    ['POST', '/api/orca/hubs/hub-sales/mcp'],
    ['POST', '/api/khum/hubs/hub-sales/library/files'],
    ['POST', '/api/orca/hubs/a/b/library/files'],
    ['POST', '/api/orca/hubs/hub-sales/library/files/'],
    ['POST', '/api/orca/hubs/hub-sales/doc-templates/orl-1/test-fill'],
    ['POST', '/api/orca/hubs/hub-sales/doc-templates/orl-1/publish'],
    ['PUT', '/api/orca/hubs/hub-sales/doc-templates/orl-1/spec'],
    ['POST', '/api/khum/hubs/hub-sales/doc-templates'],
  ]) assert.equal(libraryUploadRoute(method, path), false, `${method} ${path}`);
});

test('the server gives requests 15 minutes to arrive only through the upload routes', async (t) => {
  const f = await fixture(t);
  assert.equal(f.app.requestTimeout, 15 * 60_000);
  assert.equal(f.app.headersTimeout, 60_000);
});

test('an upload\'s answer may take 15 minutes; another call is still cut at 120 seconds', async (t) => {
  const answers = [];
  let started = 0;
  let markStarted;
  const both = new Promise((resolve) => { markStarted = resolve; });
  const f = await fixture(t, (req, res) => {
    answers.push({ path: req.url, res });
    if (++started === 2) markStarted();
    req.resume();
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const upload = request(f.appURL, '/api/orca/hubs/hub-sales/library/files', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--\r\n' });
  const other = request(f.appURL, '/api/orca/hubs/hub-sales/library/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await both;
  let uploadDone = false;
  upload.then(() => { uploadDone = true; });
  t.mock.timers.tick(120_000);
  const cut = await other;
  assert.equal(cut.status, 504);
  assert.deepEqual(JSON.parse(cut.body), { error: 'backend_timeout' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(uploadDone, false, 'the upload still waits for its answer');
  t.mock.timers.tick(10 * 60_000);
  const held = answers.find((answer) => answer.path === '/api/orca/hubs/hub-sales/library/files');
  held.res.writeHead(202, { 'content-type': 'application/json' });
  held.res.end('{"files":[]}');
  const answered = await upload;
  assert.equal(answered.status, 202);
  assert.deepEqual(JSON.parse(answered.body), { files: [] });
});

test('an upload that is never answered is cut at 15 minutes', async (t) => {
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const f = await fixture(t, (req) => { req.resume(); markStarted(); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = request(f.appURL, '/api/orca/orgs/org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/hubs/hub-sales/library/files/orl-1/versions', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--\r\n' });
  await started;
  t.mock.timers.tick(15 * 60_000);
  const result = await pending;
  assert.equal(result.status, 504);
  assert.deepEqual(JSON.parse(result.body), { error: 'backend_timeout' });
});

/** A request whose body stops halfway: the headers promise 20 bytes and 10 are sent. */
function slowBody(base, pathname) {
  const target = new URL(base);
  const chunks = [];
  let closed;
  const done = new Promise((resolve) => { closed = resolve; });
  const req = http.request({ hostname: target.hostname, port: target.port, path: pathname, method: 'POST', headers: { 'content-type': 'application/octet-stream', 'content-length': 20 } }, (res) => {
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => closed({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    res.on('error', () => closed({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
  });
  req.on('error', () => closed({ status: 0, body: '' }));
  req.write('0123456789');
  return { req, done };
}

test('a request still arriving after 120 seconds is answered 408 and closed, and its proxied call stops', async (t) => {
  let markStarted;
  let markUpstreamClosed;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const upstreamClosed = new Promise((resolve) => { markUpstreamClosed = resolve; });
  const f = await fixture(t, (req, res) => {
    req.on('data', () => markStarted());
    res.on('close', markUpstreamClosed);
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slow = slowBody(f.appURL, '/api/orca/hubs/hub-sales/library/items');
  await started;
  t.mock.timers.tick(120_000);
  const result = await slow.done;
  assert.equal(result.status, 408);
  assert.deepEqual(JSON.parse(result.body), { error: 'request_timeout' });
  await upstreamClosed;
});

test('an upload still arriving after 120 seconds is not cut', async (t) => {
  let markStarted;
  let body = '';
  const started = new Promise((resolve) => { markStarted = resolve; });
  const f = await fixture(t, (req, res) => {
    req.on('data', (chunk) => { body += chunk; markStarted(); });
    req.on('end', () => {
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{"files":[]}');
    });
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slow = slowBody(f.appURL, '/api/orca/hubs/hub-sales/library/files');
  await started;
  t.mock.timers.tick(5 * 60_000);
  slow.req.end('abcdefghij');
  const result = await slow.done;
  assert.equal(result.status, 202);
  assert.equal(body, '0123456789abcdefghij');
});

/**
 * A raw connection that sends a request's headers and part of its body, then
 * holds on without closing, as a slow client does: Node's own client would
 * close at the answer's "Connection: close", which hides the server's side.
 */
function heldRequest(base, pathname, headers = {}) {
  const target = new URL(base);
  const socket = net.connect(Number(target.port), target.hostname);
  socket.on('error', () => {});
  let text = '';
  let answered;
  const answer = new Promise((resolve) => { answered = resolve; });
  let closed = false;
  socket.on('close', () => { closed = true; });
  socket.on('data', (chunk) => {
    text += chunk;
    if (text.includes('\r\n\r\n')) answered({ status: Number(text.split(' ')[1]), body: text.slice(text.indexOf('\r\n\r\n') + 4) });
  });
  const head = Object.entries({ host: target.host, 'content-type': 'application/octet-stream', 'content-length': '1000', ...headers }).map(([name, value]) => `${name}: ${value}\r\n`).join('');
  socket.write(`POST ${pathname} HTTP/1.1\r\n${head}\r\n0123456789`);
  return { socket, answer, isClosed: () => closed };
}

/** Waits up to `ms` of real time (setTimeout may be mocked) for `check`. */
async function within(ms, check) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return check();
}

test('an early refusal never ends a request\'s 120 seconds: a client still sending is closed then', async (t) => {
  let upstreamCalls = 0;
  const f = await fixture(t, () => { upstreamCalls++; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // A foreign Origin is refused at once, while its body keeps arriving.
  const held = heldRequest(f.appURL, '/api/orca/hubs/hub-sales/library/items', { origin: 'https://evil.example' });
  t.after(() => held.socket.destroy());
  const answer = await held.answer;
  assert.equal(answer.status, 403);
  held.socket.write('more of the body');
  t.mock.timers.tick(119_000);
  assert.equal(await within(50, held.isClosed), false, 'within its 120 s the connection stays');
  t.mock.timers.tick(1_000);
  assert.equal(await within(2_000, held.isClosed), true, 'at 120 s it closes, not at the upload routes\' 15 minutes');
  assert.equal(upstreamCalls, 0);
});

test('an upload refused before it is served keeps 120 seconds, not 15 minutes', async (t) => {
  let upstreamCalls = 0;
  const f = await fixture(t, () => { upstreamCalls++; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [headers, status] of [[{ host: 'evil.example' }, 421], [{ origin: 'https://evil.example' }, 403]]) {
    const held = heldRequest(f.appURL, '/api/orca/hubs/hub-sales/library/files', headers);
    t.after(() => held.socket.destroy());
    assert.equal((await held.answer).status, status, JSON.stringify(headers));
    t.mock.timers.tick(120_000);
    assert.equal(await within(2_000, held.isClosed), true, JSON.stringify(headers));
  }
  // An invalid path too, before anything else is known about it.
  const invalid = heldRequest(f.appURL, '/api/orca/hubs/hub-sales/library/%2e%2e');
  t.after(() => invalid.socket.destroy());
  assert.equal((await invalid.answer).status, 400);
  t.mock.timers.tick(120_000);
  assert.equal(await within(2_000, invalid.isClosed), true);
  assert.equal(upstreamCalls, 0);
});

test('a keep-alive connection keeps no listener of the requests it carried', async (t) => {
  const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
  const sockets = [];
  f.app.on('connection', (socket) => sockets.push(socket));
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => agent.destroy());
  const warnings = [];
  const warn = (warning) => warnings.push(warning.name);
  process.on('warning', warn);
  t.after(() => process.off('warning', warn));
  const target = new URL(f.appURL);
  const counts = [];
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: target.hostname, port: target.port, path: '/api/orca/hubs/hub-sales/library/items', method: 'POST', agent, headers: { 'content-type': 'application/json' } }, (res) => {
        res.resume();
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.end('{}');
    });
    counts.push(sockets[0].listenerCount('close'));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sockets.length, 1, 'one connection carried them all');
  assert.equal(new Set(counts).size, 1, `the connection's close listeners stay the same: ${counts}`);
  assert.deepEqual(warnings.filter((name) => name === 'MaxListenersExceededWarning'), []);
});

/** A raw kept-alive connection the test writes to; it collects the answers and tells when it closes. */
async function rawConnection(t, f) {
  const connected = once(f.app, 'connection');
  const target = new URL(f.appURL);
  const socket = net.connect(Number(target.port), target.hostname);
  socket.on('error', () => {});
  t.after(() => socket.destroy());
  const state = { socket, text: '', closed: false, host: target.host };
  socket.on('close', () => { state.closed = true; });
  socket.on('data', (chunk) => { state.text += chunk; });
  await connected;
  return state;
}
const answers = (text) => (text.match(/HTTP\/1\.1 \d{3}/g) ?? []);

test('a proxied call cut by its 408 is stopped, and the server goes on serving (Codex S7 fourth confirmation #1)', async (t) => {
  let upstreamResponse;
  let markClosed;
  const upstreamClosed = new Promise((resolve) => { markClosed = resolve; });
  const f = await fixture(t, (req, res) => { upstreamResponse = res; req.resume(); res.on('close', markClosed); });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const held = heldRequest(f.appURL, '/api/orca/hubs/hub-sales/library/items', { 'content-type': 'application/json' });
  t.after(() => held.socket.destroy());
  assert.equal(await within(2_000, () => !!upstreamResponse), true, 'the backend has the call');
  t.mock.timers.tick(120_000);
  assert.equal((await held.answer).status, 408);
  await upstreamClosed;
  // The backend's late answer goes nowhere and harms nothing.
  try {
    upstreamResponse.writeHead(200, { 'content-type': 'text/plain' });
    upstreamResponse.end('late');
  } catch {
    // Its connection is gone already.
  }
  await within(100, () => false);
  t.mock.timers.reset();
  const next = await request(f.appURL, '/assets/app.js');
  assert.equal(next.status, 200);
  const source = await readFile(new URL('./server/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(res\.headersSent \|\| res\.writableEnded \|\| res\.destroyed\) \{\s*response\.resume\(\);\s*upstream\.destroy\(\);\s*return;\s*\}/, 'an answer already given: the backend\'s is dropped');
  assert.match(source, /if \(!relayed \|\| !res\.writableFinished\) upstream\.destroy\(\);/, 'and its call stops');
});

test('a request whose answer is already streaming at its 120 s is closed, never answered 408 over it, and the server goes on', async (t) => {
  let streaming;
  const f = await fixture(t, (req, res) => {
    // The backend answers before the body has arrived, and goes on writing.
    req.resume();
    streaming = res;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('part');
  });
  const errors = [];
  const record = (error) => errors.push(error);
  process.on('uncaughtException', record);
  t.after(() => process.off('uncaughtException', record));
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const held = heldRequest(f.appURL, '/api/orca/hubs/hub-sales/library/items', { 'content-type': 'application/json' });
  t.after(() => held.socket.destroy());
  assert.equal((await held.answer).status, 200, 'the answer began');
  t.mock.timers.tick(119_000);
  assert.equal(await within(50, held.isClosed), false);
  t.mock.timers.tick(1_000);
  assert.equal(await within(2_000, held.isClosed), true, 'its connection closes at its 120 s');
  await within(100, () => false);
  assert.deepEqual(errors, [], 'no 408 written over the answer');
  assert.ok(streaming);
  t.mock.timers.reset();
  assert.equal((await request(f.appURL, '/assets/app.js')).status, 200, 'the server goes on serving');
});

// Each request's start comes from Node's parser (this Node calls the slot the
// server fills), or from requestDeadline's estimate where a parser does not:
// the slot emptied again once the server has filled it, or a parser that tells
// only a connection's first request (a later one is estimated, never given an
// older request's start). `first` and `later`: whether the first request on a
// connection, and the ones after it, are counted exactly.
const CLOCKS = [
  { name: 'parser', first: true, later: true, use: () => {} },
  { name: 'estimate', first: false, later: false, use: (app) => app.on('connection', (socket) => { socket.parser[0] = null; }) },
  {
    name: 'parser, first request only', first: true, later: false,
    use: (app) => app.on('connection', (socket) => {
      const mark = socket.parser[0];
      let told = false;
      socket.parser[0] = function () {
        if (told) return;
        told = true;
        mark.call(this);
      };
    }),
  },
];

for (const clock of CLOCKS) {
  test(`${clock.name}: an ordinary request\'s 120 seconds count from its start, its headers included (Codex S7 third confirmation #1)`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const connected = once(f.app, 'connection');
    const target = new URL(f.appURL);
    const socket = net.connect(Number(target.port), target.hostname);
    socket.on('error', () => {});
    t.after(() => socket.destroy());
    let closed = false;
    socket.on('close', () => { closed = true; });
    let text = '';
    socket.on('data', (chunk) => { text += chunk; });
    await connected;
    // 50 s of slow headers, then the body slowly: 120 s in all, not 50 + 120.
    // The first line reaches the server before the clock moves on.
    socket.write('POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\n');
    await within(200, () => false);
    t.mock.timers.tick(50_000);
    socket.write(`host: ${target.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(69_000);
    assert.equal(await within(50, () => closed), false, 'at 119 s it is still arriving');
    t.mock.timers.tick(1_000);
    assert.equal(await within(2_000, () => closed), true, 'at 120 s from its start it is cut');
    assert.match(text, /^HTTP\/1\.1 408 /);
  });

  test(`${clock.name}: on a kept-alive connection each request has its own 120 seconds, from the answer before it`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const connected = once(f.app, 'connection');
    const target = new URL(f.appURL);
    const socket = net.connect(Number(target.port), target.hostname);
    socket.on('error', () => {});
    t.after(() => socket.destroy());
    let closed = false;
    socket.on('close', () => { closed = true; });
    let text = '';
    socket.on('data', (chunk) => { text += chunk; });
    await connected;
    const head = `host: ${target.host}\r\ncontent-type: application/json\r\n`;
    // A first request whose body takes 100 s, within its 120 s.
    socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\n${head}content-length: 4\r\n\r\n{"`);
    await within(200, () => false);
    t.mock.timers.tick(100_000);
    socket.write('":');
    assert.equal(await within(2_000, () => /\r\n\r\nok$/.test(text)), true, 'the first request is answered');
    // 4 s later (within the keep-alive time) a slow second request: its 120 s start at the answer before it.
    t.mock.timers.tick(4_000);
    socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\n${head}content-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(60_000);
    assert.equal(await within(50, () => closed), false, 'counting from the connection would have cut it already');
    t.mock.timers.tick(60_000);
    assert.equal(await within(2_000, () => closed), true, 'cut at its own 120 s');
    assert.match(text, /HTTP\/1\.1 408 /);
  });

  test(`${clock.name}: after an early answer whose body arrived later, the next request\'s 120 s start at that body\'s end (Codex S7 fourth confirmation #3)`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    // Refused at once (a foreign Origin), while its body takes 100 s more: the connection stays kept alive.
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\norigin: https://evil.example\r\ncontent-type: application/json\r\ncontent-length: 20\r\n\r\n0123456789`);
    assert.equal(await within(2_000, () => answers(c.text).length === 1), true);
    assert.match(c.text, /^HTTP\/1\.1 403 /);
    t.mock.timers.tick(100_000);
    c.socket.write('abcdefghij');
    await within(200, () => false);
    // The next request, slow: counted from the first one's body end, not from its early answer.
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(60_000);
    assert.equal(await within(50, () => c.closed), false, 'counted from the early answer it would be cut already');
    t.mock.timers.tick(60_000);
    assert.equal(await within(2_000, () => c.closed), true);
    assert.match(c.text, /HTTP\/1\.1 408 /);
  });

  test(`${clock.name}: requests read in full mark the next one\'s start too: a slow request after a run of quick ones keeps its 120 s`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    // 40 quick reads, 4 s apart (within the keep-alive time): 160 s on one connection.
    for (let i = 1; i <= 40; i++) {
      c.socket.write(`GET /assets/app.js HTTP/1.1\r\nhost: ${c.host}\r\n\r\n`);
      assert.equal(await within(2_000, () => answers(c.text).length === i), true, `read ${i}`);
      t.mock.timers.tick(4_000);
    }
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(100_000);
    assert.equal(await within(50, () => c.closed), false, 'its 120 s count from the read before it');
    t.mock.timers.tick(20_000);
    assert.equal(await within(2_000, () => c.closed), true);
    assert.match(c.text, /HTTP\/1\.1 408 /);
  });

  test(`${clock.name}: after a slow answer the next request\'s 120 s start at that answer, not at its own body\'s end`, async (t) => {
    let release;
    const f = await fixture(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        // The first call's backend answers 100 s later; the others at once.
        if (!release) release = () => res.end('slow');
        else res.end('ok');
      });
    });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 2\r\n\r\n{}`);
    assert.equal(await within(2_000, () => !!release), true);
    t.mock.timers.tick(100_000);
    release();
    assert.equal(await within(2_000, () => /\r\n\r\nslow$/.test(c.text) || /slow\r\n0\r\n\r\n$/.test(c.text)), true, 'the slow answer came');
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(60_000);
    assert.equal(await within(50, () => c.closed), false, 'counted from its own body\'s end it would be cut already');
    t.mock.timers.tick(60_000);
    assert.equal(await within(2_000, () => c.closed), true);
  });

  test(`${clock.name}: a request whose headers come in the same read as the end of the one before it starts then (Codex S7 fifth confirmation #1)`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    // Refused at once; its body half sent.
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\norigin: https://evil.example\r\ncontent-type: application/json\r\ncontent-length: 20\r\n\r\n0123456789`);
    assert.equal(await within(2_000, () => answers(c.text).length === 1), true);
    t.mock.timers.tick(100_000);
    // 100 s later, in one write: the rest of that body and the next request, slow.
    c.socket.write(`abcdefghijPOST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(60_000);
    assert.equal(await within(50, () => c.closed), false, 'counted from the early answer, or with the 65 s cap, it would be cut already');
    t.mock.timers.tick(60_000);
    assert.equal(await within(2_000, () => c.closed), true);
    assert.match(c.text, /HTTP\/1\.1 408 /);
  });

  test(`${clock.name}: a pipelined request, sent while the answer before it is on its way, keeps its 120 s (Codex S7 sixth confirmation #1)`, async (t) => {
    let release;
    const f = await fixture(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        if (!release) release = () => res.end('first');
        else res.end('ok');
      });
    });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    // A's body is complete at 0; its backend answers at 110.
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 2\r\n\r\n{}`);
    assert.equal(await within(2_000, () => !!release), true);
    t.mock.timers.tick(100_000);
    // B, pipelined at 100: headers and part of its body.
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(10_000);
    release();
    await within(200, () => false);
    t.mock.timers.tick(100_000);
    assert.equal(await within(50, () => c.closed), false, '110 s after B arrived it is still within its 120 s');
    t.mock.timers.tick(10_000);
    assert.equal(await within(2_000, () => c.closed), true, 'cut at its own 120 s');
  });

  test(`${clock.name}: a pipelined request whose 408 would wait behind a streaming answer closes its connection at its deadline (Codex S7 seventh confirmation #1)`, async (t) => {
    let streaming;
    const f = await fixture(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        if (!streaming) {
          // A's answer starts and never ends.
          streaming = res;
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.write('part');
        } else res.end('ok');
      });
    });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 2\r\n\r\n{}`);
    assert.equal(await within(2_000, () => /part/.test(c.text)), true, 'A is streaming');
    t.mock.timers.tick(100_000);
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(119_000);
    assert.equal(await within(50, () => c.closed), false);
    t.mock.timers.tick(1_000);
    assert.equal(await within(2_000, () => c.closed), true, 'B\'s deadline closes the connection, not A\'s end');
  });

  test(`${clock.name}: a pipelined request whose headers come slowly while the answer before it streams counts from its first byte (Codex S7 thirteenth confirmation #2)`, async (t) => {
    let streaming;
    const f = await fixture(t, (req, res) => {
      req.resume();
      req.on('end', () => {
        if (!streaming) {
          // A's answer starts and never ends.
          streaming = res;
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.write('part');
        } else res.end('ok');
      });
    });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    c.socket.write(`POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\nhost: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 2\r\n\r\n{}`);
    assert.equal(await within(2_000, () => /part/.test(c.text)), true, 'A is streaming');
    t.mock.timers.tick(100_000);
    // B's headers begin at 100 and take 50 s (within Node's headersTimeout) while A's answer goes on.
    c.socket.write('POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\n');
    await within(200, () => false);
    t.mock.timers.tick(50_000);
    c.socket.write(`host: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(69_000);
    assert.equal(await within(50, () => c.closed), false, 'at 119 s from its first byte it is still arriving');
    t.mock.timers.tick(1_000);
    if (clock.later) {
      assert.equal(await within(2_000, () => c.closed), true, 'this Node\'s parser tells its first byte: cut 120 s from there, not from when its headers had arrived');
      return;
    }
    // The estimate's bound: from when its headers had arrived, so at most headersTimeout late.
    assert.equal(await within(50, () => c.closed), false);
    t.mock.timers.tick(49_000);
    assert.equal(await within(50, () => c.closed), false);
    t.mock.timers.tick(1_000);
    assert.equal(await within(2_000, () => c.closed), true, 'the estimate: 120 s after its headers had arrived');
  });

  test(`${clock.name}: headers that took longer than the estimate takes off still count in full`, async (t) => {
    const f = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('ok')); });
    clock.use(f.app);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const c = await rawConnection(t, f);
    // 80 s of headers: Node checks its 60 s headersTimeout only every 30 s, so these can arrive.
    c.socket.write('POST /api/orca/hubs/hub-sales/library/items HTTP/1.1\r\n');
    await within(200, () => false);
    t.mock.timers.tick(80_000);
    c.socket.write(`host: ${c.host}\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"a":`);
    await within(200, () => false);
    t.mock.timers.tick(39_000);
    assert.equal(await within(50, () => c.closed), false, 'at 119 s from its first byte it is still arriving');
    t.mock.timers.tick(1_000);
    if (clock.first) {
      assert.equal(await within(2_000, () => c.closed), true, 'cut at 120 s from its first byte, the 80 s of headers counted in full');
      return;
    }
    // The estimate takes off at most headersTimeout + keepAliveTimeout (65 s): cut at 135 s.
    assert.equal(await within(50, () => c.closed), false);
    t.mock.timers.tick(14_000);
    assert.equal(await within(50, () => c.closed), false);
    t.mock.timers.tick(1_000);
    assert.equal(await within(2_000, () => c.closed), true, 'the estimate: 55 s after its headers had arrived');
  });
}
