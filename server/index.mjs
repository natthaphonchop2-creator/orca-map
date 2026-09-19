import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const server = createAppServer({
  backendURL: process.env.ORCA_BACKEND_URL,
  publicOrigin: process.env.ORCA_PUBLIC_ORIGIN,
  backendPublicOrigin: process.env.ORCA_BACKEND_PUBLIC_ORIGIN,
  buildDir: path.resolve(root, process.env.ORCA_BUILD_DIR ?? 'build'),
});
server.listen(port, host, () => console.log(`ORCA workspace adapter is listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
