import { BOOKS } from "./data";
import type {
  CallToolResult,
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  McpToolDefinition,
  Session,
} from "./types";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: McpToolDefinition[] = [
  {
    name: "list_books",
    title: "List Books",
    description: "Returns all books in the library catalogue. Optionally filter by genre or show only available books.",
    inputSchema: {
      type: "object",
      properties: {
        genre: {
          type: "string",
          description: 'Filter books by genre (e.g. "Science Fiction", "Dystopian", "Literary Fiction").',
        },
        available_only: {
          type: "boolean",
          description: "When true, only return books currently available for borrowing.",
        },
      },
    },
  },
  {
    name: "get_book",
    title: "Get Book",
    description: "Fetches the full details for a single book by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: 'The unique identifier of the book (e.g. "book-001").',
        },
      },
      required: ["id"],
    },
  },
  {
    name: "search_books",
    title: "Search Books",
    description: "Searches the catalogue for books whose title or author contains the given keyword.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Case-insensitive keyword to match against title and author fields.",
        },
      },
      required: ["keyword"],
    },
  },
];

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function success(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    isError,
  };
}

// ---------------------------------------------------------------------------
// MCP method handlers
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSION = "2025-11-25";

function handleInitialize(id: JsonRpcId, params: unknown): { response: JsonRpcResponse; newSessionId: string } {
  // Spec §Version Negotiation: always respond with our supported version.
  // The client MUST disconnect if it cannot support our version.
  const requestedVersion = (params as { protocolVersion?: string } | null)?.protocolVersion;
  if (requestedVersion && requestedVersion !== SUPPORTED_PROTOCOL_VERSION) {
    console.warn(
      `Client requested protocol version "${requestedVersion}"; server supports "${SUPPORTED_PROTOCOL_VERSION}".`
    );
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, { id: sessionId, initialized: false, createdAt: new Date() });

  const result = {
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    serverInfo: {
      title: "Example Library MCP Server",
      name: "raw-streamable-http-mcp-server",
      version: "1.0.0",
    },
    capabilities: {
      tools: { listChanged: false },
    },
    instructions:
      "A library catalogue MCP server. Call tools/list to discover available tools, then tools/call to invoke them. " +
      "Available tools: list_books (filter by genre or availability), get_book (fetch by ID), search_books (search by keyword).",
  };

  return { response: success(id, result), newSessionId: sessionId };
}

function handleToolsList(id: JsonRpcId): JsonRpcResponse {
  return success(id, { tools: TOOLS });
}

function handleToolsCall(id: JsonRpcId, params: unknown, session: Session): JsonRpcResponse {
  if (!session.initialized) {
    return rpcError(id, -32600, "Session not initialized. Send notifications/initialized first.");
  }

  const p = params as { name?: string; arguments?: Record<string, unknown> };
  const toolName = p?.name;
  const args = p?.arguments ?? {};

  if (!toolName) {
    return rpcError(id, -32602, "Missing required param: name");
  }

  switch (toolName) {
    case "list_books": {
      const genre = typeof args["genre"] === "string" ? args["genre"].toLowerCase() : null;
      const availableOnly = args["available_only"] === true;

      const results = BOOKS.filter((b) => {
        if (genre && b.genre.toLowerCase() !== genre) return false;
        if (availableOnly && !b.available) return false;
        return true;
      });

      return success(id, toolResult(results));
    }

    case "get_book": {
      const bookId = typeof args["id"] === "string" ? args["id"] : null;
      if (!bookId) {
        return rpcError(id, -32602, "Missing required argument: id");
      }
      const book = BOOKS.find((b) => b.id === bookId);
      if (!book) {
        return success(id, toolResult({ error: `No book found with id "${bookId}"` }, true));
      }
      return success(id, toolResult(book));
    }

    case "search_books": {
      const keyword = typeof args["keyword"] === "string" ? args["keyword"].toLowerCase() : null;
      if (!keyword) {
        return rpcError(id, -32602, "Missing required argument: keyword");
      }
      const results = BOOKS.filter(
        (b) => b.title.toLowerCase().includes(keyword) || b.author.toLowerCase().includes(keyword)
      );
      return success(id, toolResult(results));
    }

    default:
      return rpcError(id, -32601, `Unknown tool: "${toolName}"`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export interface HandleResult {
  response: JsonRpcResponse | null;
  newSessionId?: string;
  isNotification: boolean;
}

export function handleMcpRequest(req: JsonRpcRequest, sessionId: string | null): HandleResult {
  const id = req.id ?? null;

  // initialize — no session required
  if (req.method === "initialize") {
    const { response, newSessionId } = handleInitialize(id, req.params);
    return { response, newSessionId, isNotification: false };
  }

  // Session is guaranteed valid by index.ts for all non-initialize methods.
  // This fallback should never be reached in normal operation.
  const session = sessions.get(sessionId ?? "");
  if (!session) {
    return {
      response: rpcError(id, -32600, "Session not found."),
      isNotification: false,
    };
  }

  // notifications are one-way — no response body
  if (req.method === "notifications/initialized") {
    session.initialized = true;
    return { response: null, isNotification: true };
  }

  if (req.method === "ping") {
    return { response: success(id, {}), isNotification: false };
  }

  if (req.method === "tools/list") {
    return { response: handleToolsList(id), isNotification: false };
  }

  if (req.method === "tools/call") {
    return { response: handleToolsCall(id, req.params, session), isNotification: false };
  }

  return {
    response: rpcError(id, -32601, `Method not found: "${req.method}"`),
    isNotification: false,
  };
}
