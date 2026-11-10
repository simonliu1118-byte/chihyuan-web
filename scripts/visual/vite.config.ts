import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";
/** Isolated visual QA: no Cloudflare bindings and no production identity. */
export default defineConfig({plugins:[react()],server:{host:"127.0.0.1",strictPort:true}});
