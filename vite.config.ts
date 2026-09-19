import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { createBackendMiddleware } from './server/app.mjs';
export default defineConfig(({mode}) => {
 const env=loadEnv(mode,'.','ORCA_');
 return {
  plugins:[sveltekit(),{name:'orca-backend',configureServer(server){server.middlewares.use(createBackendMiddleware({backendURL:env.ORCA_BACKEND_URL,backendPublicOrigin:env.ORCA_BACKEND_PUBLIC_ORIGIN}));}}],
  server:{host:'127.0.0.1',port:5175}
 };
});
