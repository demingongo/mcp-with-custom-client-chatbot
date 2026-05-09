// JSON-RPC 2.0 base types

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: JsonRpcId;
    method: string;
    params?: unknown;
}

export interface JsonRpcSuccessResponse {
    jsonrpc: '2.0';
    id: JsonRpcId;
    result: unknown;
}

export interface JsonRpcErrorResponse {
    jsonrpc: '2.0';
    id: JsonRpcId;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// MCP content block types

export interface TextContent {
    type: 'text';
    text: string;
}

export interface ImageContent {
    type: 'image';
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
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
}

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: McpToolInputSchema;
    title?: string;
}

// Session state

export interface Session {
    id: string;
    initialized: boolean;
    createdAt: Date;
}
