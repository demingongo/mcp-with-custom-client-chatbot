import { withSchema } from "@kaapi/validator-zod";
import { log } from "../services/log-service";
import { JsonRpcErrorResponse, JsonRpcResponse } from "../types";
import { handleMcpRequest, sessions } from "../services/mcp/handler";
import { z } from "zod";
import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";
import Boom from "@hapi/boom";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Spec §Error Responses: id MUST NOT be null. When the request body is parseable,
// echo its id; when it is not, omit the field entirely (undefined, not null).
function extractId(body: unknown): string | number | undefined {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const id = (body as Record<string, unknown>)["id"];
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return undefined;
}

// Maps JSON-RPC error responses to appropriate HTTP status codes for the response to the POST request.
function evalStatusCode(response: JsonRpcResponse): number {
  if ("error" in response) {
    switch (response.error.code) {
      case -32601: // Method not found
        return 404;
      case -32602: // Invalid Params
        return 422;
      case -32603: // Internal error
        return 500;
      default:
        // Spec §Error Responses: server errors (-32099 to -32000) => 500, all others => 400.
        return 400;
    }
  }
  return 200;
}

// ---------------------------------------------------------------------------
// POST /mcp — client sends JSON-RPC messages
// ---------------------------------------------------------------------------

export const mcpPostRoute = applyModifiers(withSchema({
  headers: z.looseObject({
    "mcp-protocol-version": z.enum(["2025-11-25"]).optional(),
    "mcp-session-id": z.string().optional(),
    "last-event-id": z.string().optional(),
  }).catchall(z.string()),
  payload: z.object({
    jsonrpc: z.enum(["2.0"]),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string(),
    params: z.unknown().optional(),
  }),
  failAction: (request, h, err) => {
    log.warn(`Invalid request payload: ${err?.message}`);
    let message = "Invalid Request: " + err?.message;
    let code = -32600; // JSON-RPC standard code for Invalid Request
    if (Boom.isBoom(err)) {
      const validationError: z.ZodError = err.data.validationError;
      const issue = validationError.issues[0];
      if (issue) {
        if (issue.path[0] === "payload") {
          // Spec §2025-06-18: batching (array bodies) is no longer supported.
          if (
            issue.path.length === 1 &&
            issue.message.endsWith("received array")
          ) {
            message = "JSON-RPC batching is not supported";
          } else {
            code = -32700; // JSON-RPC standard code for Parse Error
            message = "Parse error: invalid JSON-RPC 2.0 request";
          }
        } else if (issue.path[0] === "headers") {
          // Spec §2025-06-18 Transport §Protocol Version Header:
          // Clients MUST send MCP-Protocol-Version on all requests after initialization.
          // Absent header => assume 2025-03-26 => 400 Bad Request (because we no longer support this version).
          // Invalid/unsupported version => 400 Bad Request.
          if (
            issue.path[1] === "mcp-protocol-version"
          ) {
            message = `Unsupported MCP-Protocol-Version: "${request.headers["mcp-protocol-version"]}"`;
          }
        }
      }
    }
    const response: JsonRpcErrorResponse = {
      jsonrpc: "2.0",
      id: extractId(request.payload),
      error: {
        code: code,
        message: message,
      },
    };
    return h.response(response).code(400).takeover();
  }
}).route({
  handler: (request, h) => {
    const rpc = request.payload;

    const sessionId = typeof request.headers["mcp-session-id"] === "string" ? request.headers["mcp-session-id"] : null;

    // Spec §2025-06-18 Transport §Protocol Version Header:
    // Clients MUST send MCP-Protocol-Version on all requests after initialization.
    // Absent header => assume 2025-03-26 => 400 Bad Request (because we no longer support this version).
    // Invalid/unsupported version => 400 Bad Request.
    if (rpc.method !== "initialize") {
      const clientVersion = request.headers["mcp-protocol-version"];
      if (typeof clientVersion === "undefined") {
        return h.response({
          jsonrpc: "2.0",
          id: extractId(rpc),
          error: { code: -32600, message: `Unsupported MCP-Protocol-Version: "${clientVersion}"` },
        }).code(400);
      }
    }

    // All methods other than initialize require a valid existing session.
    // Spec §Session Management:
    //   - No header at all → 400 Bad Request (point 2)
    //   - Header present but session expired/unknown → 404 Not Found (point 3)
    if (rpc.method !== "initialize") {
      if (!sessionId) {
        return h.response({
          jsonrpc: "2.0",
          id: extractId(rpc),
          error: { code: -32600, message: "Missing Mcp-Session-Id header" },
        }).code(400);
      }
      if (!sessions.has(sessionId)) {
        return h.response({
          jsonrpc: "2.0",
          id: extractId(rpc),
          error: { code: -32600, message: "Session not found or expired" },
        }).code(404);
      }
    }

    log.info({ method: rpc.method, sessionId }, "MCP request");

    log.debug(`Received POST request with body: ${JSON.stringify(rpc)}`);

    const { response, newSessionId, isNotification } = handleMcpRequest(rpc, sessionId);

    const headersToSet: Record<string, string> = {};

    if (newSessionId) {
      headersToSet["Mcp-Session-Id"] = newSessionId;
      log.info({ sessionId: newSessionId }, "Session created");
    }

    if (isNotification) {
      const res = h.response();
      for (const [key, value] of Object.entries(headersToSet)) {
        res.header(key, value);
      }
      return res.code(202);
    }

    if (!response) {
      // This should never happen — all non-notification paths must return a response.
      log.error("No response generated for non-notification request");
      return h.response({
        jsonrpc: "2.0",
        id: extractId(rpc),
        error: { code: -32603, message: "Internal error: no response generated" },
      }).code(500);
    }

    const res = h.response(response);
    for (const [key, value] of Object.entries(headersToSet)) {
      res.header(key, value);
    }
    return res
      // Spec §Sending Messages point 5: explicitly declare the content type.
      .header("Content-Type", "application/json")
      .code(evalStatusCode(response));
  },
  method: "post",
  path: "/mcp",
  options: {
    description: "Endpoint for handling JSON-RPC 2.0 messages (requests, notifications)",
    tags: ["MCP"],
    id: "mcp_post",
    notes: [
      "MCP protocol 2025-11-25:",
      "- This endpoint accepts JSON-RPC 2.0 messages for tool invocation and session management.",
      "- Supported methods include 'initialize', 'call_tool', and 'end_session'.",
      "- The server responds with JSON-RPC success or error responses based on the request handling outcome.",
    ],
    ext: {
      onPostAuth: {
        method: (request, h) => {
          // Spec §Sending Messages point 2: client MUST include Accept listing both content types.
          const accept = request.headers.accept ?? "";
          if (
            !accept.includes("*/*") &&
            !(
              accept.includes("application/json") &&
              accept.includes("text/event-stream")
            )
          ) {
            return h.response({
              jsonrpc: "2.0",
              id: extractId(request.payload),
              error: {
                code: -32600,
                message: "Not Acceptable: Accept header must include application/json and text/event-stream",
              },
            }).code(406).takeover();
          }
          return h.continue;
        }
      }
    }
  },
}),
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("No content (for notifications)")
        .setCode(202),
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: {
              type: "object",
              properties: {
                jsonrpc: { type: "string", enum: ["2.0"] },
                id: { type: ["string", "number"] },
                result: {
                  anyOf: [
                    {
                      type: "object",
                      properties: {
                        content: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string" },
                              text: { type: "string" },
                            },
                            required: ["type", "text"],
                          },
                        },
                        isError: { type: "boolean" },
                      },
                      required: ["content", "isError"],
                    },
                    {
                      type: "object",
                      properties: {
                        protocolVersion: { type: "string" },
                        serverInfo: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            name: { type: "string" },
                            version: { type: "string" },
                          },
                          required: ["name", "version"],
                        },
                        capabilities: {
                          type: "object",
                          properties: {
                            tools: {
                              type: "object",
                              properties: {
                                listChanged: { type: "boolean" },
                              },
                              additionalProperties: true
                            },
                          }
                        }
                      },
                      required: ["protocolVersion", "serverInfo"],
                    },
                    {} // any
                  ]
                },
              },
            },
          })
        )
        .setName("MCP JSON-RPC Success Response"),
      new ResponseDocsModifier()
        .setDescription("Error")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: {
              type: "object",
              properties: {
                jsonrpc: { type: "string", enum: ["2.0"] },
                id: { type: ["string", "number"] },
                error: {
                  type: "object",
                  properties: {
                    code: { type: "number" },
                    message: { type: "string" },
                    data: {},
                  },
                  required: ["code", "message"],
                },
              },
            },
          })
        )
        .setName("MCP JSON-RPC Error Response"),
      new ResponseDocsModifier()
        .addMediaType(
          "text/event-stream"
        )
        .setName("MCP SSE Stream")
    ),
  }
);

export const mcpDeleteRoute = applyModifiers({
  method: "delete",
  path: "/mcp",
  options: {
    description: "Endpoint for ending a session (deleting server-side session state)",
    tags: ["MCP"],
    id: "mcp_delete",
  },
  handler: (request, h) => {
    const sessionId = typeof request.headers["mcp-session-id"] === "string" ? request.headers["mcp-session-id"] : null;

    if (!sessionId || !sessions.has(sessionId)) {
      return h.response({ error: "Session not found" }).code(404);
    }

    sessions.delete(sessionId);
    log.info({ sessionId }, "Session deleted");
    return h.response().code(204);
  }
}, {
  responses: groupResponses(
    new ResponseDocsModifier()
      .setDescription("Session ended successfully")
      .setCode(204),
    new ResponseDocsModifier()
      .setDescription("Session not found")
      .addMediaType(
        "application/json",
        new MediaTypeModifier({
          schema: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        })
      )
      .setCode(404)
  ),
});