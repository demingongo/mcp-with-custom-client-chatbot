import { Client, StreamableHTTPClientTransport, ClientCredentialsProvider, Tool } from "@modelcontextprotocol/client";
import { log } from "./services/log-service";

const client = new Client({ name: 'my-client', version: '1.0.0' });

const MCP_BASE_URL = process.env.MCP_BASE_URL ?? "http://localhost:3002";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

const transport = new StreamableHTTPClientTransport(new URL('/mcp', MCP_BASE_URL), {
  authProvider: new ClientCredentialsProvider({
    clientId: process.env.CLIENT_ID ?? "machine-client",
    clientSecret: process.env.CLIENT_SECRET ?? "machine",
    scope: "mcp:tools",
  })
});

let cachedTools: Tool[] | undefined;

const question = "What books do you have available?";

try {
  await client.connect(transport);

  // 1. Discover tools from the MCP server
  const { tools } = await client.listTools();
  cachedTools = tools

  // 2. Convert MCP tool schemas to Ollama tool format
  const ollamaTools = cachedTools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages: object[] = [{ role: "user", content: question }];

  // 3. Agentic loop: let the LLM call tools until it produces a final answer
  for (let step = 0; step < 5; step++) {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools: ollamaTools, stream: false }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const message = data.message;

    if (!message.tool_calls?.length) {
      // Final human-readable answer
      log.info(message.content, "Answer:");
      break;
    }

    // 4. Execute each tool call via the MCP client
    messages.push(message); // assistant message with tool_calls
    for (const tc of message.tool_calls) {
      const result = await client.callTool({
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
      messages.push({ role: "tool", content: JSON.stringify(result) });
    }
  }
} catch (error) {
  log.error(error, "Error connecting to MCP server:");
  process.exit(1);
}

