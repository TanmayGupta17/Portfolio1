// vite.config.js
import { defineConfig } from "vite";

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  base: isGitHubActions ? "/Portfolio1/" : "/",
  server: {
    open: true, // Automatically open the browser when the server starts
  },
});
