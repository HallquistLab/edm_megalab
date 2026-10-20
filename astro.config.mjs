import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const repository = "edm_megalab";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  site: "https://hallquistlab.github.io",
  base: isGitHubPages ? `/${repository}` : "/",
  output: "static",
  integrations: [
    sitemap({
      filter: (page) => {
        const meeting = new URL(page).pathname.match(/\/meetings\/([^/]+)\/?$/)?.[1];
        return !meeting || /^\d{4}-\d{2}-\d{2}$/.test(meeting);
      },
    }),
  ],
});
