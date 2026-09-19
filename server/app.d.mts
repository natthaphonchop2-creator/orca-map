import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/** Server-side configuration. Origin values are validated at construction. */
export interface AppServerOptions {
  /** Fixed upstream HTTP(S) origin; defaults to http://127.0.0.1:8787. */
  backendURL?: string;
  /** Exact public browser origin when deployed outside the loopback listener. */
  publicOrigin?: string;
  /** Additional advertised upstream origin eligible for outer Location rewriting. */
  backendPublicOrigin?: string;
  /** Compiled local static directory, resolved from the process working directory. */
  buildDir?: string;
  /** Deadline for upstream response headers; established streams remain open. */
  headerTimeoutMs?: number;
  /** Deadline for the unauthenticated upstream health request. */
  healthTimeoutMs?: number;
}

/** Connect-compatible middleware; non-backend requests are passed to next(). */
export type BackendMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/** Validates an origin, throwing for credentials, paths, queries or fragments. */
export function originURL(value: string, name: string): URL;

/** Creates an unbound HTTP server. Call listen() to start accepting requests. */
export function createAppServer(options?: AppServerOptions): Server;

/** Reuses the backend proxy in a development server without taking over its UI. */
export function createBackendMiddleware(options?: AppServerOptions): BackendMiddleware;
