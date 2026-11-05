import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Builds a Cloudflare Worker: dist/server/server.js (SSR + API) and dist/client (static files).
export default defineConfig({
  ssr: {
    // A Worker has no node_modules at runtime, so bundle every dependency.
    noExternal: true,
    // Provided by the Workers runtime itself.
    external: ["cloudflare:workers"],
  },
  build: {
    rollupOptions: { external: [/^cloudflare:/] },
  },
  plugins: [tsconfigPaths(), tanstackStart({ server: { entry: "server" } }), react()],
});
