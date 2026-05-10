import type { OpenAPIV3_1 } from "openapi-types";

export interface McpRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown; // could be CallToolResult, or ...
  error?: { code: number; message: string };
}

export interface CallToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: unknown }
  >;
  isError: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, OpenAPIV3_1.SchemaObject>;
    required?: string[];
  };
  title?: string;
  outputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description?: string | undefined }>;
    required?: string[];
  };
  annotations?: Record<string, unknown>;
}
