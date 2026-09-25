import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAppServer, createBackendMiddleware, originURL } from './server/app.mjs';

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
  for (const route of ['/', '/app?view=connections', '/login/local', '/auth/oauth/consent/test-id', '/auth/oauth/complete', '/auth/mcp/composite/test-id', '/invite/Syn7hetic_Token-0123456789abcdefghijklmnopq']) {
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
  for (const route of ['/pricing', '/pricing.html', '/services/enterprise', '/start', '/missing', '/assets/missing.js', '/api-lookalike', '/invite', '/invite/', '/invite/a/b', '/invite/a.b', '/invite/' + 'x'.repeat(129)]) assert.equal((await request(appURL, route)).status, 404, route);
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
