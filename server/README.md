# Workspace server

This dependency-free Node HTTP server serves the compiled workspace and forwards
approved API/auth/MCP routes to one existing ORCA/Obot backend. It creates no
database, users, sessions or source accounts. Browser credentials are forwarded
only to the fixed, operator-configured backend origin.

## Run locally

Build the app with `npm run build`, then run `node server/index.mjs`. The default
listener is `127.0.0.1:4000`, build directory is `build`, and backend is
`http://127.0.0.1:8787`. Open `http://localhost:4000`. Environment files are not
loaded implicitly; use `node --env-file=.env server/index.mjs` if needed.

`node --test server.test.mjs` runs isolated HTTP tests with temporary files and
fake upstream servers. It does not connect to the live backend.

For Vite development, import `createBackendMiddleware` from `./server/app.mjs`
in `vite.config.ts`. In a plugin's `configureServer(server)`, call
`server.middlewares.use(createBackendMiddleware({ backendURL, backendPublicOrigin }))`.
The keys accept the same server-only origin values as `ORCA_BACKEND_URL` and
`ORCA_BACKEND_PUBLIC_ORIGIN`; both can be omitted for the local defaults. Mount
this middleware before the HTML fallback. It handles only backend/auth routes
and lets Vite serve frontend files and HMR. Do not add a second `server.proxy`
configuration that bypasses the adapter's browser-origin checks. The standalone
server's `/healthz` describes a built deployment, not the Vite dev process.

## Routing and authentication

The server proxies only `/api/`, `/oauth2/`, `/oauth/`, `/.well-known/`,
`/mcp-connect/` and `/mcp-connect-composite/`. A root callback containing `code`,
`error` or `state` is forwarded to `/oauth2/callback`, matching the existing Go
UI handler. Query strings and request/response bodies are not rewritten.

The app owns `/`, `/app`, `/login`, `/login/local`, auth consent/completion,
the OAuth debugger callback, and its legal pages. Known client routes receive the
local `fallback.html` SPA document (or `index.html` when present). Unknown routes and `/pricing`, `/services`, `/start`
return 404; missing files never fall through to the backend's marketing website.
This server does not supply the advanced Obot admin UI.

`/third-party.html` and nested `/third-party/` notice/license assets are served
only when the corresponding local build file exists. Missing notices return 404
without SPA fallback or a backend request.

Requests keep Authorization and cookies. The server validates the browser's
Origin/Referer against the app origin **before** translating a valid same-origin
request to the upstream Host/Origin required by local-auth CSRF checks. Host names
outside loopback are rejected unless `ORCA_PUBLIC_ORIGIN` explicitly configures
them. Incoming forwarding headers are discarded. No cross-origin credentialed
API/CORS policy is offered. Non-browser clients without Origin/Referer continue
to use the backend's bearer-token authentication normally.

When the transport address differs from the backend's advertised origin, the
adapter uses `ORCA_BACKEND_PUBLIC_ORIGIN` for Host, Origin, Referer and trusted
forwarding headers. The connection still uses `ORCA_BACKEND_URL`. This preserves
the backend's canonical-origin checks for connection configuration and OAuth;
an Owner session alone must not bypass those checks. Locally, transport uses
`127.0.0.1:8787` and the canonical origin defaults to `http://localhost:8787`.

Host-only cookies remain host-only. A cookie Domain matching the configured
backend host is removed to scope it to the app; Secure, HttpOnly, SameSite and
Path are preserved. Sessions remain stored and validated by the backend.
Different localhost ports share browser cookie scope. Distinct production hosts
may require users to sign in again; this does not duplicate user accounts.

Only an absolute Location header whose origin exactly matches the configured
backend origin is translated to the app origin. The default local target also
recognizes its advertised `http://localhost:8787` origin. For other targets that
advertise a different origin, explicitly set `ORCA_BACKEND_PUBLIC_ORIGIN` too. External OAuth
URLs, nested `redirect_uri` parameters, response JSON, issuer metadata and
registered source callbacks are intentionally preserved.

## Deploy

Run behind a trusted TLS reverse proxy and set `ORCA_PUBLIC_ORIGIN` to the exact
public browser origin, such as `https://app.example.com`. Preserve that Host when
forwarding to this server. Set `HOST=0.0.0.0` only where remote access is needed.
Set `ORCA_BACKEND_URL` to the trusted backend's internal or HTTPS origin. It must
not include credentials, a path, query or fragment. Do not expose its address
through frontend environment variables. In Docker, localhost refers to that
container, so use a reachable backend service name or host gateway.

Keep the existing backend's data volume, encryption keys, authentication
configuration and source-account state. Starting a second backend against the
same volume is not part of this deployment. The public website may be hosted
separately with no app/API proxy.

The adapter does not migrate OAuth registrations. When moving the canonical app
origin, update and verify the backend's advertised origin and provider-registered
callbacks deliberately. The local adapter alone does not prove a source-account
OAuth round trip at a different production domain.

Request and response streams support SSE and MCP Streamable HTTP. A downstream
disconnect aborts the upstream request; the first response headers have a
120-second deadline, allowing ORCA's 60-second source checks and 90-second MCP
calls to return their result (including audit finalization). A stalled upstream
still returns 504 at that deadline; an established event stream has no adapter idle timeout.
WebSocket upgrades return 501 and CONNECT returns 405. Features requiring Obot
tunnel/desktop WebSockets are outside this adapter's supported routes.

`GET /healthz` checks that `fallback.html` or `index.html` exists and calls the backend's unauthenticated
`/api/healthz` with a two-second deadline. It returns 200 only if both are ready,
otherwise 503, with separate app/backend fields. It does not test authentication,
source OAuth, tool execution, or employee AI-client access. No backend URL,
credential or raw exception is returned in health/error responses.

Production acceptance should include a real authorized sign-in/sign-out, an
authenticated organization read, source-account OAuth with isolation checks,
and the intended MCP client flow. Unit tests and health checks are narrower
evidence than those flows.
