import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "debug" }).child({
  tag: "mcp-client",
});

const MCP_BASE_URL = process.env.MCP_BASE_URL ?? "http://localhost:3001";

export interface McpInvokeResult {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: string;
}

export async function invokeTool(tool: string, args: Record<string, unknown> = {}): Promise<McpInvokeResult> {
  const url = `${MCP_BASE_URL}/mcp/invoke`;
  log.info({ url, arguments: args }, `→ invoke '${tool}'`);
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    });
  } catch (err) {
    log.error(
      {
        tool,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t0,
      },
      "fetch failed"
    );
    throw err;
  }

  const result = (await res.json()) as McpInvokeResult;
  const ms = Date.now() - t0;

  if (!result.ok) {
    log.warn({ ms, error: result.error }, `← '${tool}' failed`);
  } else {
    const dataLen = Array.isArray(result.data)
      ? result.data.length
      : result.data && typeof result.data === "object"
        ? Object.keys(result.data as object).length
        : undefined;
    log.info({ ms, dataItems: dataLen }, `← '${tool}' ok`);
  }
  log.debug({ result }, "full result");
  return result;
}

export async function listTools(): Promise<unknown> {
  const t0 = Date.now();
  const res = await fetch(`${MCP_BASE_URL}/mcp/tools`);
  const data = await res.json();
  log.info({ ms: Date.now() - t0 }, "listed tools");
  return data;
}

export function mcpConfig() {
  return { baseUrl: MCP_BASE_URL };
}
