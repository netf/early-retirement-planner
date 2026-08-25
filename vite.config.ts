import vinext from "vinext";
import { defineConfig } from "vite";

/** Cloudflare Web Analytics site token for fire.netf.io. Public by nature (it ships in the page), so it lives here; CF_BEACON_TOKEN overrides it, and dev builds never send it. */
const PRODUCTION_BEACON_TOKEN = "f1c6ba1ff6b44186ac4a8e883e621fa9";

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // Inlined at build time so the Worker never depends on runtime environment variables.
    define: {
      "process.env.SITE_URL": JSON.stringify(process.env.SITE_URL ?? ""),
      "process.env.CF_BEACON_TOKEN": JSON.stringify(process.env.CF_BEACON_TOKEN ?? (command === "build" ? PRODUCTION_BEACON_TOKEN : "")),
    },
    plugins: [
      vinext(),
      cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, inspectorPort: false }),
    ],
  };
});
