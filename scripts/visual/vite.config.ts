import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";
/** Isolated screenshot harness: never connects to real identity or D1. */
export default defineConfig({plugins:[react()],server:{host:"127.0.0.1",strictPort:true}});
