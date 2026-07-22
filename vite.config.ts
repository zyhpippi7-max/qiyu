import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  triggers: { crons: ["*/5 * * * *"] },
  vars: {
    QIYU_AI_BASE_URL: process.env.QIYU_AI_BASE_URL || "",
    QIYU_AI_API_KEY: process.env.QIYU_AI_API_KEY || "",
    QIYU_AI_CHAT_PATH: process.env.QIYU_AI_CHAT_PATH || "/v1/chat/completions",
    QIYU_AI_IMAGE_PATH: process.env.QIYU_AI_IMAGE_PATH || "/v1/images/generations",
    QIYU_CONTROL_BASIC: process.env.QIYU_CONTROL_BASIC || "",
    ARK_API_KEY: process.env.ARK_API_KEY || "",
    ARK_VIDEO_BASE_URL: process.env.ARK_VIDEO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    ARK_VIDEO_MODEL: process.env.ARK_VIDEO_MODEL || "doubao-seedance-2-0-260128",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
