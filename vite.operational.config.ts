import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Static bundle of the same React application, without the Cloudflare plugin.
 * Business, Settings and Audit modules still require the same-origin protected
 * Worker API; a static host alone cannot provide their D1 functionality.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-operational",
    emptyOutDir: true,
  },
});
