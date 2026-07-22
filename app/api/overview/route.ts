import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

type RuntimeEnv = {
  QIYU_AI_BASE_URL?: string;
  QIYU_AI_API_KEY?: string;
  ARK_API_KEY?: string;
  ARK_BASE_URL?: string;
};

async function count(sql: string, binds: unknown[] = []) {
  try {
    const row = await env.DB.prepare(sql).bind(...binds).first<{ count: number }>();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

function parsed(value: unknown, fallback: unknown) {
  try { return typeof value === "string" ? JSON.parse(value) : value ?? fallback; }
  catch { return fallback; }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request); if (!user) return unauthorized();
  const runtime = env as unknown as RuntimeEnv;
  const [records, images, videos, contacts, leads, experts, accounts, activeJobs, completedJobs, failedJobs, devices, recentJobs] = await Promise.all([
    count("SELECT COUNT(*) AS count FROM product_records WHERE workspace_id=?", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM product_records WHERE workspace_id=? AND module='image-generate'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM product_records WHERE workspace_id=? AND module='video'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM private_contacts WHERE workspace_id=?", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM acquisition_leads WHERE workspace_id=?", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM product_records WHERE workspace_id=? AND module='ai-expert' AND status='active'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM product_records WHERE workspace_id=? AND module='accounts' AND status='active'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM automation_jobs WHERE workspace_id=? AND status IN ('queued','claimed','running')", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM automation_jobs WHERE workspace_id=? AND status='succeeded'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM automation_jobs WHERE workspace_id=? AND status='failed'", [user.workspaceId]),
    count("SELECT COUNT(*) AS count FROM automation_devices WHERE workspace_id=? AND last_seen_at>=datetime('now','-75 seconds')", [user.workspaceId]),
    env.DB.prepare(`SELECT id,device_id AS deviceId,type,payload,status,progress,result,error,created_at AS createdAt,updated_at AS updatedAt
      FROM automation_jobs WHERE workspace_id=? ORDER BY id DESC LIMIT 8`).bind(user.workspaceId).all().catch(() => ({ results: [] })),
  ]);
  const settledJobs = completedJobs + failedJobs;
  return Response.json({
    metrics: {
      records, images, videos, activeJobs, completedJobs, failedJobs, devices, contacts, leads, experts, accounts,
      successRate: settledJobs ? Math.round(completedJobs * 100 / settledJobs) : 0,
    },
    services: {
      llm: Boolean(runtime.QIYU_AI_BASE_URL && runtime.QIYU_AI_API_KEY),
      image: Boolean(runtime.QIYU_AI_BASE_URL && runtime.QIYU_AI_API_KEY),
      video: Boolean(runtime.ARK_API_KEY),
      storage: true,
      desktop: devices > 0,
      asr: false,
      tts: false,
    },
    recent: recentJobs.results.map(row => ({ ...row, payload: parsed(row.payload, {}), result: parsed(row.result, {}) })),
  });
}
