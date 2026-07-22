import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

const MAX_CONVERSATIONS = 50;

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '新对话', expert_id TEXT NOT NULL DEFAULT '',
      expert_name TEXT NOT NULL DEFAULT '通用业务助手', model_tier TEXT NOT NULL DEFAULT 'smart',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0,
      conversation_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS agent_chat_conversations_workspace_updated_idx ON agent_chat_conversations(workspace_id,updated_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS agent_chat_messages_workspace_conversation_created_idx ON agent_chat_messages(workspace_id,conversation_id,created_at)"),
  ]);
}

function fail(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

function titleFromMessage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 36 ? `${normalized.slice(0, 36)}…` : normalized || "新对话";
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const conversationId = Number(new URL(request.url).searchParams.get("conversationId") || 0);
    if (conversationId) {
      const conversation = await env.DB.prepare(`SELECT id,title,expert_id AS expertId,expert_name AS expertName,model_tier AS modelTier,
        created_at AS createdAt,updated_at AS updatedAt FROM agent_chat_conversations WHERE id=? AND workspace_id=?`)
        .bind(conversationId, user.workspaceId).first();
      if (!conversation) return fail("对话不存在", 404);
      const messages = await env.DB.prepare(`SELECT id,role,content,created_at AS createdAt FROM agent_chat_messages
        WHERE conversation_id=? AND workspace_id=? ORDER BY id`).bind(conversationId, user.workspaceId).all();
      return Response.json({ conversation, messages: messages.results });
    }
    const conversations = await env.DB.prepare(`SELECT c.id,c.title,c.expert_id AS expertId,c.expert_name AS expertName,c.model_tier AS modelTier,
      c.created_at AS createdAt,c.updated_at AS updatedAt,
      (SELECT content FROM agent_chat_messages m WHERE m.workspace_id=c.workspace_id AND m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
      (SELECT COUNT(*) FROM agent_chat_messages m WHERE m.workspace_id=c.workspace_id AND m.conversation_id=c.id) AS messageCount
      FROM agent_chat_conversations c WHERE c.workspace_id=? ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`)
      .bind(user.workspaceId, MAX_CONVERSATIONS).all();
    return Response.json({ conversations: conversations.results, limit: MAX_CONVERSATIONS });
  } catch (error) { return fail(error, 500); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "create") {
      const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM agent_chat_conversations WHERE workspace_id=?").bind(user.workspaceId).first<{ count: number }>();
      if (Number(total?.count || 0) >= MAX_CONVERSATIONS) return fail(`最多保存 ${MAX_CONVERSATIONS} 条对话，请先删除不需要的历史记录`, 409);
      const tier = ["smart", "quality", "fast"].includes(String(body.modelTier)) ? String(body.modelTier) : "smart";
      const conversation = await env.DB.prepare(`INSERT INTO agent_chat_conversations(workspace_id,expert_id,expert_name,model_tier)
        VALUES(?,?,?,?) RETURNING id,title,expert_id AS expertId,expert_name AS expertName,model_tier AS modelTier,created_at AS createdAt,updated_at AS updatedAt`)
        .bind(user.workspaceId, String(body.expertId || "").slice(0, 80), String(body.expertName || "通用业务助手").slice(0, 100), tier).first();
      return Response.json({ conversation }, { status: 201 });
    }
    if (action === "append") {
      const conversationId = Number(body.conversationId || 0); const role = String(body.role || ""); const content = String(body.content || "").trim();
      if (!conversationId || !["user", "assistant"].includes(role) || !content) return fail("消息参数不完整");
      if (content.length > 12_000) return fail("单条消息不能超过12000个字符");
      const conversation = await env.DB.prepare("SELECT id,title FROM agent_chat_conversations WHERE id=? AND workspace_id=?").bind(conversationId, user.workspaceId).first<{ id: number; title: string }>();
      if (!conversation) return fail("对话不存在", 404);
      const nextTitle = role === "user" && conversation.title === "新对话" ? titleFromMessage(content) : conversation.title;
      const [inserted] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO agent_chat_messages(workspace_id,conversation_id,role,content)
          VALUES(?,?,?,?) RETURNING id,role,content,created_at AS createdAt`).bind(user.workspaceId, conversationId, role, content),
        env.DB.prepare("UPDATE agent_chat_conversations SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(nextTitle, conversationId, user.workspaceId),
      ]);
      return Response.json({ message: inserted.results[0], title: nextTitle }, { status: 201 });
    }
    if (action === "rename") {
      const conversationId = Number(body.conversationId || 0); const title = String(body.title || "").replace(/\s+/g, " ").trim();
      if (!conversationId || !title) return fail("请输入对话名称");
      if (title.length > 60) return fail("对话名称不能超过60个字符");
      const conversation = await env.DB.prepare(`UPDATE agent_chat_conversations SET title=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND workspace_id=? RETURNING id,title`).bind(title, conversationId, user.workspaceId).first();
      if (!conversation) return fail("对话不存在", 404);
      return Response.json({ conversation });
    }
    if (action === "delete") {
      const conversationId = Number(body.conversationId || 0);
      if (!conversationId) return fail("缺少对话标识");
      const existing = await env.DB.prepare("SELECT id FROM agent_chat_conversations WHERE id=? AND workspace_id=?").bind(conversationId, user.workspaceId).first();
      if (!existing) return fail("对话不存在", 404);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM agent_chat_messages WHERE conversation_id=? AND workspace_id=?").bind(conversationId, user.workspaceId),
        env.DB.prepare("DELETE FROM agent_chat_conversations WHERE id=? AND workspace_id=?").bind(conversationId, user.workspaceId),
      ]);
      return Response.json({ ok: true });
    }
    return fail("未知操作");
  } catch (error) { return fail(error, 500); }
}
