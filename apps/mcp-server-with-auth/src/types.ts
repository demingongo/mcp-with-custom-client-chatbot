// JSON-RPC 2.0 base types

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId | undefined;
  method: string;
  params?: unknown | undefined;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id?: JsonRpcId | undefined;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id?: JsonRpcId | undefined;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// MCP content block types

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string; // base64-encoded
  mimeType: string;
}

export type McpContent = TextContent | ImageContent;

// MCP tool result envelope

export interface CallToolResult {
  content: McpContent[];
  isError: boolean;
}

// MCP tool definition (as returned by tools/list)

export interface McpToolInputSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  title?: string;
}

// Per-stream event buffer (for Last-Event-ID resumption)

export interface BufferedSseEvent {
  id: string;
  seqNum: number;
  /** Full raw SSE frame, e.g. `id: ...\ndata: ...\n\n` */
  data: string;
}

export interface StreamLog {
  streamId: string;
  sessionId: string;
  seqCounter: number;
  events: BufferedSseEvent[];
}

// Session state

export interface Session {
  id: string;
  initialized: boolean;
  createdAt: Date;
  /** All SSE stream logs for this session, keyed by streamId. Persists across disconnections for resumption. */
  streamLogs: Map<string, StreamLog>;
  /** The streamId of the currently active SSE connection, if any. */
  activeStreamId?: string;
  /**
   * Push a JSON-RPC message to the active SSE stream. The message is buffered
   * for resumption and written to the current connection.
   * Set by the GET /mcp handler; undefined when no SSE stream is connected.
   * Example:
   * ```ts
   * session.pushEvent?.({ jsonrpc: "2.0", method: "notifications/message", params: { ... } });
   * ```
   */
  pushEvent?: (jsonData: object) => void;
}
