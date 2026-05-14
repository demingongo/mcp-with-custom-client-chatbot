import { KaapiServerRoute } from "@kaapi/kaapi";
import { MCP_BASE_URL, OLLAMA_BASE_URL, OLLAMA_MODEL } from "../config/mcp";
import { getMcpClient } from "../services/mcp-client";
import { log as baseLog } from "../services/log-service";
import { randomBytes } from "node:crypto";
import { withSchema } from "@kaapi/validator-arktype";
import { type } from 'arktype';
import Boom from "@hapi/boom";

export const chatConfigRoute: KaapiServerRoute = {
  method: "get",
  path: "/api/chat/config",
  handler: () => ({
    ollama: { baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL },
    mcp: { baseUrl: MCP_BASE_URL },
  }),
  options: {
    description: "Chat configuration endpoint",
    notes: "Returns the configuration for the chat system, including the Ollama model and MCP base URLs.",
    tags: ["chat"],
  },
};

const MAX_STEPS = 5;

export const chatRoute = withSchema({
  payload: type({
    messages: type(
      type({
        role: type("'system' | 'user' | 'assistant' | 'tool'", "@", { description: "The role of the message author" }),
        content: type("string", "@", { description: "The text content of the message" }),
      }).array().atLeastLength(1)
    ),
  }),
  failAction: async (_, _h, err) => {
    if (Boom.isBoom(err)) {
      err.output.payload.ok = false;
    }
    return err;
  },
}).route({
  method: "post",
  path: "/api/chat",
  handler: async (request, h) => {
    const reqId = randomBytes(4).toString("hex");
    const log = baseLog.child({ tag: `chat:${reqId}` });
    const t0 = Date.now();
    const trace: Array<{ step: string; detail: unknown }> = [];

    let reply: string | undefined;

    const messages = request.payload.messages;

    try {
      const { client, tools } = await getMcpClient();

      // Convert MCP tool schemas to Ollama tool format
      const ollamaTools = tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));

      // Agentic loop: let the LLM call tools until it produces a final answer
      for (let step = 0; step < MAX_STEPS; step++) {
        log.info({ conversationLength: messages.length }, `loop iteration ${step + 1}/${MAX_STEPS}`);
        const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools: ollamaTools, stream: false }),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any;
        const message = data.message;
        trace.push({ step: `model_reply_${step}`, detail: message.content });

        if (!message.tool_calls?.length) {
          // Final human-readable answer
          reply = message.content;
          break;
        }

        // Execute each tool call via the MCP client
        messages.push(message); // assistant message with tool_calls
        for (const tc of message.tool_calls) {
          const result = await client.callTool({
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
          messages.push({ role: "tool", content: JSON.stringify(result) });
          trace.push({
            step: `tool_${tc.function.name}`, detail: JSON.stringify(result)
          });
        }
      }

      if (typeof reply === "undefined") {
        log.warn({ totalMs: Date.now() - t0 }, "hit MAX_STEPS without final answer");
        return {
          ok: false,
          error: "Reached max tool-call iterations without a final answer.",
          trace
        };
      }

      return { ok: true, reply, trace };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ totalMs: Date.now() - t0, error: message }, "request failed");
      return h.response({ ok: false, error: message, trace }).code(500);
    }
  },
  options: {
    description: "Chat endpoint",
    notes: "Accepts a conversation history and returns a reply. The server will use the MCP client to execute any tool calls requested by the LLM until it produces a final answer or reaches the max number of steps.",
    tags: ["chat"],
  }
});