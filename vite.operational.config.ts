import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Static build used only for the browser-local operational test surface.
 *
 * It intentionally excludes the Cloudflare Worker plugin because this build
 * does not call protected APIs or D1 yet. Relative asset paths keep the same
 * React application runnable from a simple static host while the UI/workflows
 * are being tested against localStorage.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-operational",
    emptyOutDir: true,
  },
});
