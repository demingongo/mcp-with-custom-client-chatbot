import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "debug" }).child({
  tag: "ollama",
});

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: { role: "assistant"; content: string };
  done: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:latest";

export async function ollamaChat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number } = {}
): Promise<string> {
  const model = opts.model ?? OLLAMA_MODEL;
  const body = {
    model,
    messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.2 },
  };

  log.info(
    {
      url: `${OLLAMA_BASE_URL}/api/chat`,
      model,
      messages: messages.length,
      lastUserPreview: messages.findLast((m: ChatMessage) => m.role === "user")?.content?.slice(0, 120),
    },
    "→ POST /api/chat"
  );
  log.debug({ body }, "request body");

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    log.error(
      {
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t0,
      },
      "fetch failed"
    );
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, ms: Date.now() - t0, body: text.slice(0, 300) }, "non-2xx response");
    throw new Error(`Ollama ${res.status}: ${text}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  const reply = data.message?.content ?? "";
  log.info({ ms: Date.now() - t0, chars: reply.length, preview: reply.slice(0, 160) }, "← reply");
  log.debug({ reply }, "full reply");
  return reply;
}

export function ollamaConfig() {
  return { baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL };
}
