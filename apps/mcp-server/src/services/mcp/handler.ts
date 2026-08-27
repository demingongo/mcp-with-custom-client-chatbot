import { APP_NAME } from "../../config/app";
import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse, McpToolDefinition, Session } from "../../types";
import { log } from "../log-service";
import {
  listProducts,
  productByIdArgsSchema,
  getProductById,
  searchProducts,
  searchProductsArgsSchema,
  filterByCategoryArgsSchema,
  filterByCategory,
  listCategories,
} from "../product-service";
import { success, rpcError, toolResult } from "./json-rpc-helpers";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

//const cachedTools: {
//  tools: McpToolDefinition[];
//  updatedAt: number;
//} = {
//  tools: [],
//  updatedAt: 0,
//};

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
// MCP method handlers
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSION = "2025-11-25";

function handleInitialize(
  id: JsonRpcId | undefined,
  params: unknown
): { response: JsonRpcResponse; newSessionId: string } {
  // Spec §Version Negotiation: always respond with our supported version.
  // The client MUST disconnect if it cannot support our version.
  const requestedVersion = (params as { protocolVersion?: string } | null)?.protocolVersion;
  if (requestedVersion && requestedVersion !== SUPPORTED_PROTOCOL_VERSION) {
    log.warn(
      `Client requested protocol version "${requestedVersion}"; server supports "${SUPPORTED_PROTOCOL_VERSION}".`
    );
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, { id: sessionId, initialized: false, createdAt: new Date(), streamLogs: new Map() });

  const result = {
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    serverInfo: {
      title: "Example Library MCP Server",
      name: APP_NAME,
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

function handleToolsList(id: JsonRpcId | undefined): JsonRpcResponse {
  return success(id, { tools: TOOLS });
}

async function handleToolsCall(id: JsonRpcId | undefined, params: unknown, session: Session): Promise<JsonRpcResponse> {
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
    case "list_products": {
      const results = listProducts();
      return success(id, toolResult(results));
    }

    case "get_product": {
      const val = await productByIdArgsSchema.safeParseAsync(args);
      if (!val.success) {
        return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
      }
      const p = getProductById(val.data);
      if (!p) {
        return success(id, toolResult({ error: `No product found with id "${val.data.id}"` }, true));
      }
      return success(id, toolResult(p));
    }

    case "search_products": {
      const val = await searchProductsArgsSchema.safeParseAsync(args);
      if (!val.success) {
        return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
      }
      const data = searchProducts(val.data);
      return success(id, toolResult(data));
    }

    case "list_categories": {
      const results = listCategories();
      return success(id, toolResult(results));
    }

    case "products_by_category": {
      const val = await filterByCategoryArgsSchema.safeParseAsync(args);
      if (!val.success) {
        return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
      }
      const data = filterByCategory(val.data);
      return success(id, toolResult(data));
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

export async function handleMcpRequest(req: JsonRpcRequest, sessionId: string | null): Promise<HandleResult> {
  const id = req.id ?? undefined;

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
    return { response: await handleToolsCall(id, req.params, session), isNotification: false };
  }

  return {
    response: rpcError(id, -32601, `Method not found: "${req.method}"`),
    isNotification: false,
  };
}
