import { handleMcpRequest, sessions } from "./handler";
import type { JsonRpcRequest } from "./types";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import pino from "pino";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = pino({ transport: { target: "pino-pretty" } });

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const SERVER_BIND_ADDRESS = process.env["SERVER_BIND_ADDRESS"] ?? "127.0.0.1";

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// DNS rebinding protection — only active when bound to localhost.
// Rejects browser-originated requests whose Origin is not a localhost URL,
// preventing remote websites from reaching a locally-running server via DNS rebinding.
const LOCAL_BIND_ADDRESSES = new Set(["127.0.0.1", "localhost"]);
const isLocalBind = LOCAL_BIND_ADDRESSES.has(SERVER_BIND_ADDRESS);

if (isLocalBind) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers["origin"];
    // Non-browser clients (curl, MCP clients) do not send an Origin header — allow them.
    // Browser requests must originate from a localhost origin.
    if (origin !== undefined) {
      const isLocalOrigin = origin === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (!isLocalOrigin) {
        res.status(403).json({ error: "Forbidden: cross-origin request rejected" });
        return;
      }
    }
    next();
  });
}

// CORS + expose session header
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  next();
});

// CORS preflight
app.options("/mcp", (_req: Request, res: Response) => {
  res.sendStatus(204);
});

// Parse JSON request bodies
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", activeSessions: sessions.size });
});

// ---------------------------------------------------------------------------
// POST /mcp — client sends JSON-RPC messages
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-11-25"]);

app.post("/mcp", (req: Request, res: Response) => {
  // Spec §2025-06-18: batching (array bodies) is no longer supported.
  if (Array.isArray(req.body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "JSON-RPC batching is not supported" },
    });
    return;
  }

  const rpc = req.body as Partial<JsonRpcRequest>;

  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: invalid JSON-RPC 2.0 request" },
    });
    return;
  }

  const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;

  // Spec §2025-06-18 Transport §Protocol Version Header:
  // Clients MUST send MCP-Protocol-Version on all requests after initialization.
  // Absent header => assume 2025-03-26 => 400 Bad Request (because we no longer support this version).
  // Invalid/unsupported version => 400 Bad Request.
  if (rpc.method !== "initialize") {
    const clientVersion = req.headers["mcp-protocol-version"];
    if (typeof clientVersion === "undefined" || !SUPPORTED_PROTOCOL_VERSIONS.has(clientVersion as string)) {
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: `Unsupported MCP-Protocol-Version: "${clientVersion}"` },
      });
      return;
    }
  }

  // All methods other than initialize require a valid existing session.
  // Spec §Session Management: respond with HTTP 404 for unknown/expired session IDs.
  if (rpc.method !== "initialize") {
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid or missing Mcp-Session-Id header" },
      });
      return;
    }
  }

  log.info({ method: rpc.method, sessionId }, "MCP request");

  const { response, newSessionId, isNotification } = handleMcpRequest(rpc as JsonRpcRequest, sessionId);

  if (newSessionId) {
    res.set("Mcp-Session-Id", newSessionId);
    log.info({ sessionId: newSessionId }, "Session created");
  }

  if (isNotification) {
    res.sendStatus(202);
    return;
  }

  res.json(response);
});

// ---------------------------------------------------------------------------
// GET /mcp — open SSE stream (server → client push)
// ---------------------------------------------------------------------------

app.get("/mcp", (req: Request, res: Response) => {
  const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid or missing Mcp-Session-Id header" },
    });
    return;
  }

  log.info({ sessionId }, "SSE stream opened");

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Spec §Resumability: immediately send a prime event with an event ID so the client
  // can supply Last-Event-ID on reconnect. ID encodes both session and stream identity.
  const streamId = randomUUID();
  res.write(`id: ${sessionId}/${streamId}\ndata: \n\n`);

  const pingInterval = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "$/ping", // Custom ignorable method ($/ are implementation-defined extensions)
        params: {},
      })}\n\n`
    );
  }, 30_000);

  req.on("close", () => {
    clearInterval(pingInterval);
    log.info({ sessionId }, "SSE stream closed");
  });

  const webWritableStream = Writable.toWeb(res);
  const writer = webWritableStream.getWriter();

  const session = sessions.get(sessionId);
  if (session) {
    session.sseStream = writer;
  }
});

// ---------------------------------------------------------------------------
// DELETE /mcp — end session
// ---------------------------------------------------------------------------

app.delete("/mcp", (req: Request, res: Response) => {
  const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  sessions.delete(sessionId);
  log.info({ sessionId }, "Session deleted");
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, SERVER_BIND_ADDRESS, () => {
  log.info(`MCP server listening on http://localhost:${PORT}`);
  log.info(`  POST/GET/DELETE  http://localhost:${PORT}/mcp`);
  log.info(`  GET              http://localhost:${PORT}/health`);
});
