export const MCP_BASE_URL = process.env.MCP_BASE_URL ?? "http://localhost:3002";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

export const MCP_OAUTH_SCOPE = process.env.MCP_OAUTH_SCOPE ?? "mcp:tools";
export const MCP_OAUTH_CALLBACK_URL = process.env.MCP_OAUTH_CALLBACK_URL ?? "http://localhost:3000/api/auth/callback";

export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:8080";