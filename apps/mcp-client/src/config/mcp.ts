export const MCP_BASE_URL = process.env.MCP_BASE_URL ?? "http://localhost:3002";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

export const MCP_AUTH_CLIENT_ID = process.env.MCP_AUTH_CLIENT_ID ?? "machine-client";
export const MCP_AUTH_CLIENT_SECRET = process.env.MCP_AUTH_CLIENT_SECRET ?? "machine";
export const MCP_AUTH_SCOPE = "mcp:tools";