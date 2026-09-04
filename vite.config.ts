import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative base so the built app works under a GitHub Pages project path
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: "./",
  plugins: [react(), tailwindcss()],
});
