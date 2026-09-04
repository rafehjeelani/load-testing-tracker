import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves a project site under /<repo-name>/, and that same
// absolute path has to be react-router's `basename` (see main.tsx) for
// client-side routes to resolve correctly -- a relative base ("./") looks
// right for asset URLs but silently breaks the router. Only apply it for
// production builds so `npm run dev` keeps serving from "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/load-testing-tracker/" : "/",
  plugins: [react(), tailwindcss()],
}));
