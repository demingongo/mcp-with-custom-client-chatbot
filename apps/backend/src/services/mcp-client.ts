import { APP_NAME, APP_VERSION } from "../config/app";
import { MCP_AUTH_CLIENT_ID, MCP_AUTH_CLIENT_SECRET, MCP_AUTH_SCOPE, MCP_BASE_URL } from "../config/mcp";
import { Client, StreamableHTTPClientTransport, ClientCredentialsProvider, Tool } from "@modelcontextprotocol/client";

let client: Client | undefined;
let cachedTools: Tool[] | undefined;

export async function getMcpClient(): Promise<{ client: Client; tools: Tool[] }> {
  if (client && cachedTools) return { client, tools: cachedTools };

  client = new Client({ name: APP_NAME, version: APP_VERSION });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", MCP_BASE_URL), {
    authProvider: new ClientCredentialsProvider({
      clientId: MCP_AUTH_CLIENT_ID,
      clientSecret: MCP_AUTH_CLIENT_SECRET,
      scope: MCP_AUTH_SCOPE,
    }),
  });

  await client.connect(transport);

  // Discover tools from the MCP server
  const { tools } = await client.listTools();
  cachedTools = tools;

  return { client, tools: cachedTools };
}
