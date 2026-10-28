import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

// Local-only synthetic component fixture. No Cloudflare Vite plugin, D1, or
// credentials; this config is used only by the WO-0.9.52 visual acceptance job.
export default defineConfig({
 plugins:[react()],
 server:{host:"127.0.0.1",port:4173,strictPort:true},
});
