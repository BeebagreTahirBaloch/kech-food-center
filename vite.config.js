import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { serveBrandIcon } from './server/brandIcon.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const middleware = server => { server.middlewares.use('/api/brand-icon', (request, response) => { void serveBrandIcon(request, response, env); }); };
  return { plugins: [react(), { name: 'local-brand-icon', configureServer: middleware, configurePreviewServer: middleware }] };
});
