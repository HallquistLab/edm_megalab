import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import schedule from "./src/data/schedule.json" with { type: "json" };

const repository = "edm_megalab";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const meetingDates = new Set(schedule.map((session) => session.date));

export default defineConfig({
  site: "https://hallquistlab.github.io",
  base: isGitHubPages ? `/${repository}` : "/",
  output: "static",
  integrations: [
    sitemap({
      filter: (page) => {
        const meeting = new URL(page).pathname.match(/\/meetings\/([^/]+)\/?$/)?.[1];
        return !meeting || meetingDates.has(meeting);
      },
    }),
  ],
});
