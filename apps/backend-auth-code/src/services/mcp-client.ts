import { Client, StreamableHTTPClientTransport, Tool, UnauthorizedError } from "@modelcontextprotocol/client";
import { MCP_BASE_URL } from "../config/mcp";
import { APP_NAME, APP_VERSION } from "../config/app";
import { UserOAuthClientProvider } from "./oauth-provider";
import { hasUserTokens } from "./user-token-store";

export class LoginRequiredError extends Error {
  constructor() {
    super("Login required — call GET /api/auth/login first");
    this.name = "LoginRequiredError";
  }
}

interface UserMcpSession {
  client: Client;
  tools: Tool[];
}

// Per-user active MCP sessions (connected client + discovered tools).
const sessions = new Map<string, UserMcpSession>();

export async function getMcpClientForUser(userId: string): Promise<{ client: Client; tools: Tool[] }> {
  if (!hasUserTokens(userId)) throw new LoginRequiredError();

  const existing = sessions.get(userId);
  if (existing) return existing;

  const provider = new UserOAuthClientProvider(userId);
  const client = new Client({ name: APP_NAME, version: APP_VERSION });
  const transport = new StreamableHTTPClientTransport(
    new URL("/mcp", MCP_BASE_URL),
    { authProvider: provider },
  );

  try {
    await client.connect(transport);
  } catch (err) {
    if (err instanceof UnauthorizedError) throw new LoginRequiredError();
    throw err;
  }

  const { tools } = await client.listTools();
  const session = { client, tools };
  sessions.set(userId, session);
  return session;
}

/** Removes the cached session for a user, forcing a fresh connection on next use. */
export function clearUserSession(userId: string): void {
  sessions.delete(userId);
}

