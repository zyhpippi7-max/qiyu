import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

type AiEnv = {
  QIYU_AI_BASE_URL?: string;
  QIYU_AI_API_KEY?: string;
  QIYU_AI_CHAT_PATH?: string;
  QIYU_AI_IMAGE_PATH?: string;
};

type AiRequest = {
  mode?: "chat" | "image";
  model?: string;
  messages?: unknown[];
  prompt?: string;
  size?: string;
  n?: number;
  image?: string | string[];
  quality?: "low" | "medium" | "high";
  temperature?: number;
  maxTokens?: number;
};

function cleanPath(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

export async function POST(request: Request) {
  try {
    if (!(await getSessionUser(request))) return unauthorized();
    const runtime = env as unknown as AiEnv;
    if (!runtime.QIYU_AI_BASE_URL || !runtime.QIYU_AI_API_KEY) {
      return Response.json({ error: "服务器尚未配置奇遇AI模型密钥" }, { status: 503 });
    }

    const body = await request.json() as AiRequest;
    const mode = body.mode || "chat";
    if (mode === "image" && !body.prompt?.trim()) {
      return Response.json({ error: "请输入图片描述" }, { status: 400 });
    }
    if (body.prompt && body.prompt.length > 12000) {
      return Response.json({ error: "图片描述不能超过12000字" }, { status: 400 });
    }

    const endpoint = cleanPath(mode === "image"
      ? (runtime.QIYU_AI_IMAGE_PATH || "/v1/images/generations")
      : (runtime.QIYU_AI_CHAT_PATH || "/v1/chat/completions"));
    const payload = mode === "image"
      ? {
          model: body.model || "gpt-image-2",
          prompt: body.prompt?.trim(),
          size: body.size || "1024x1024",
          quality: body.quality || "medium",
          n: Math.min(Math.max(Number(body.n || 1), 1), 4),
          ...(body.image ? { image: body.image } : {}),
        }
      : {
          model: body.model || "gpt-5.5",
          messages: Array.isArray(body.messages) ? body.messages : [],
          stream: false,
          ...(Number.isFinite(body.temperature) ? { temperature: body.temperature } : {}),
          ...(Number.isFinite(body.maxTokens) ? { max_tokens: Math.min(Math.max(Number(body.maxTokens), 1), 4096) } : {}),
        };

    const response = await fetch(`${runtime.QIYU_AI_BASE_URL.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${runtime.QIYU_AI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(mode === "image" ? 240000 : 90000),
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json() as Record<string, unknown>
      : { error: await response.text() };
    if (!response.ok) {
      const upstreamError = data.error;
      const message = typeof upstreamError === "object" && upstreamError && "message" in upstreamError
        ? String((upstreamError as { message?: unknown }).message || "模型服务调用失败")
        : typeof upstreamError === "string" ? upstreamError : "模型服务调用失败";
      return Response.json({ error: message }, { status: response.status });
    }
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "图片生成超时，请稍后重试"
      : error instanceof Error ? error.message : "模型服务调用失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
