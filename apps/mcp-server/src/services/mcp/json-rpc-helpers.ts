// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

import { CallToolResult, JsonRpcErrorResponse, JsonRpcId, JsonRpcSuccessResponse } from "../../types";

export function success(id: JsonRpcId | undefined, result: unknown): JsonRpcSuccessResponse {
    return { jsonrpc: "2.0", id, result };
}

export function rpcError(id: JsonRpcId | undefined, code: number, message: string): JsonRpcErrorResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

export function toolResult(data: unknown, isError = false): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        isError,
    };
}