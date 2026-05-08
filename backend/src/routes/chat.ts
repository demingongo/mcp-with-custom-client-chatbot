import { invokeTool, mcpConfig } from "../services/mcpClient";
import { ChatMessage, ollamaChat, ollamaConfig } from "../services/ollama";
import { Router, Request, Response } from "express";
import pino from "pino";

const baseLog = pino({ level: process.env.LOG_LEVEL ?? "debug" });

const router = Router();

const SYSTEM_PROMPT = `You are the ConnectAuz product assistant. ConnectAuz (https://www.connectauz.com.au) builds business software products.

You have access to a knowledge MCP server with these tools:

1. list_products() — List every ConnectAuz product (id, name, URL, short description, category).
2. get_product(id) — Get full detail for one product. id can be 'ca-fleet', 'ca-workforce', 'ca-pos', 'ca-projects', or the product name.
3. search_products(query) — Free-text search across names, descriptions, features, use cases.
4. list_categories() — List distinct product categories.
5. products_by_category(category) — List products in a category (substring match).

WHEN you need to call a tool, reply with EXACTLY one line of JSON and NOTHING else:
{"tool": "<name>", "arguments": { ... }}

Do not wrap it in markdown, do not add commentary, do not add prose around it. Just the JSON.

After the tool result is provided to you, write a clear, helpful answer for the user in plain English. Cite the product page URL when relevant.

If the user asks something unrelated to ConnectAuz products, answer normally without using any tool.`;

const TOOL_CALL_REGEX = /\{[\s\S]*"tool"\s*:\s*"[^"]+"[\s\S]*\}/;

function tryParseToolCall(text: string): { tool: string; arguments?: Record<string, unknown> } | null {
  const trimmed = text.trim();
  const match = trimmed.match(TOOL_CALL_REGEX);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
      return { tool: parsed.tool, arguments: parsed.arguments ?? {} };
    }
  } catch {
    return null;
  }
  return null;
}

router.get("/config", (_req: Request, res: Response) => {
  baseLog.debug({ tag: "chat" }, "GET /api/chat/config");
  res.json({
    ollama: ollamaConfig(),
    mcp: mcpConfig(),
  });
});

router.post("/", async (req: Request, res: Response) => {
  const reqId = Math.random().toString(36).slice(2, 8);
  const log = baseLog.child({ tag: `chat:${reqId}` });
  const t0 = Date.now();

  const userMessages = (req.body?.messages ?? []) as ChatMessage[];
  if (!Array.isArray(userMessages) || userMessages.length === 0) {
    log.warn("missing messages array");
    return res.status(400).json({ ok: false, error: "Missing 'messages' array." });
  }

  const lastUser = userMessages.findLast((m: ChatMessage) => m.role === "user");
  log.info(
    {
      historyLength: userMessages.length,
      userMessage: lastUser?.content?.slice(0, 200),
    },
    "incoming chat request"
  );

  const conversation: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];

  const trace: Array<{ step: string; detail: unknown }> = [];
  const MAX_STEPS = 5;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      log.info({ conversationLength: conversation.length }, `loop iteration ${step + 1}/${MAX_STEPS}`);

      const reply = await ollamaChat(conversation);
      trace.push({ step: `model_reply_${step}`, detail: reply });

      const toolCall = tryParseToolCall(reply);
      if (!toolCall) {
        log.info({ totalMs: Date.now() - t0, chars: reply.length }, "final answer (no tool call)");
        return res.json({ ok: true, reply, trace });
      }

      log.info({ toolCall }, "model requested tool call");

      const toolResult = await invokeTool(toolCall.tool, toolCall.arguments ?? {});
      trace.push({ step: `tool_${toolCall.tool}`, detail: toolResult });

      conversation.push({ role: "assistant", content: reply });
      conversation.push({
        role: "user",
        content: `TOOL_RESULT for ${toolCall.tool}:\n${JSON.stringify(
          toolResult,
          null,
          2
        )}\n\nUsing this, answer the original question for the user in plain English. Do not output JSON. Do not call another tool unless absolutely necessary.`,
      });
      log.debug("appended tool result to conversation");
    }

    log.warn({ totalMs: Date.now() - t0 }, "hit MAX_STEPS without final answer");
    return res.json({
      ok: false,
      error: "Reached max tool-call iterations without a final answer.",
      trace,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ totalMs: Date.now() - t0, error: message }, "request failed");
    return res.status(500).json({ ok: false, error: message, trace });
  }
});

export default router;
