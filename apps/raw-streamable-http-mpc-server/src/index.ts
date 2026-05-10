import { handleMcpRequest, sessions } from "./handler";
import type { JsonRpcRequest } from "./types";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
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
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Last-Event-ID",
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

// ---------------------------------------------------------------------------
// POST /mcp — client sends JSON-RPC messages
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-11-25"]);

app.post("/mcp", (req: Request, res: Response) => {
  // Spec §Sending Messages point 2: client MUST include Accept listing both content types.
  const accept = req.headers["accept"] ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    res.status(406).json({
      jsonrpc: "2.0",
      id: extractId(req.body),
      error: {
        code: -32600,
        message: "Not Acceptable: Accept header must include application/json and text/event-stream",
      },
    });
    return;
  }

  // Spec §2025-06-18: batching (array bodies) is no longer supported.
  if (Array.isArray(req.body)) {
    // Body is an array — no id field to extract.
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "JSON-RPC batching is not supported" },
    });
    return;
  }

  const rpc = req.body as Partial<JsonRpcRequest>;

  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: extractId(req.body),
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
        id: extractId(rpc),
        error: { code: -32600, message: `Unsupported MCP-Protocol-Version: "${clientVersion}"` },
      });
      return;
    }
  }

  // All methods other than initialize require a valid existing session.
  // Spec §Session Management:
  //   - No header at all → 400 Bad Request (point 2)
  //   - Header present but session expired/unknown → 404 Not Found (point 3)
  if (rpc.method !== "initialize") {
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        id: extractId(rpc),
        error: { code: -32600, message: "Missing Mcp-Session-Id header" },
      });
      return;
    }
    if (!sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        id: extractId(rpc),
        error: { code: -32600, message: "Session not found or expired" },
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

  // Spec §Sending Messages point 5: explicitly declare the content type.
  res.set("Content-Type", "application/json");
  res.json(response);
});

// Max number of events to buffer per stream for Last-Event-ID resumption.
const MAX_BUFFER_SIZE = 500;

// ---------------------------------------------------------------------------
// GET /mcp — open SSE stream (server → client push)
// ---------------------------------------------------------------------------

app.get("/mcp", (req: Request, res: Response) => {
  // Spec §Listening for Messages point 2: client MUST include Accept: text/event-stream.
  const accept = req.headers["accept"] ?? "";
  if (!accept.includes("text/event-stream")) {
    // GET has no JSON-RPC request body — omit id entirely.
    res.status(406).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Not Acceptable: Accept header must include text/event-stream" },
    });
    return;
  }

  const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;

  // Spec §Session Management:
  //   - No header at all → 400 Bad Request (point 2)
  //   - Header present but session expired/unknown → 404 Not Found (point 3)
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Missing Mcp-Session-Id header" },
    });
    return;
  }
  if (!sessions.has(sessionId)) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Session not found or expired" },
    });
    return;
  }

  const session = sessions.get(sessionId)!;

  // Spec §Resumability: parse Last-Event-ID to determine if this is a reconnection.
  // Expected format: ${sessionId}/${streamId}/${seqNum} — UUIDs contain no slashes,
  // so splitting by "/" yields exactly 3 parts for a valid ID.
  const lastEventId = typeof req.headers["last-event-id"] === "string" ? req.headers["last-event-id"] : null;

  let streamId: string;
  let replayAfter: number | null = null;

  if (lastEventId) {
    const parts = lastEventId.split("/");
    const [idSessionId, idStreamId, idSeqStr] = parts;
    const idSeqNum = idSeqStr !== undefined ? parseInt(idSeqStr, 10) : NaN;

    if (
      parts.length === 3 &&
      idSessionId === sessionId &&
      idStreamId !== undefined &&
      !isNaN(idSeqNum) &&
      session.streamLogs.has(idStreamId)
    ) {
      // Valid resume: reuse the existing stream log and replay missed events.
      streamId = idStreamId;
      replayAfter = idSeqNum;
      log.info({ sessionId, streamId, replayAfter }, "SSE stream resuming");
    } else {
      // Malformed or unknown Last-Event-ID → treat as fresh connection.
      streamId = randomUUID();
      session.streamLogs.set(streamId, { streamId, sessionId, seqCounter: 0, events: [] });
      log.info({ sessionId, streamId }, "SSE stream opened (fresh, unrecognised Last-Event-ID)");
    }
  } else {
    streamId = randomUUID();
    session.streamLogs.set(streamId, { streamId, sessionId, seqCounter: 0, events: [] });
    log.info({ sessionId, streamId }, "SSE stream opened");
  }

  session.activeStreamId = streamId;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const streamLog = session.streamLogs.get(streamId)!;

  // Build a pushEvent closure that buffers each event and writes it to this connection.
  // Caller code (e.g. handler.ts) calls session.pushEvent({ ... }) to send server-initiated messages.
  const pushEvent = (jsonData: object): void => {
    streamLog.seqCounter += 1;
    const id = `${sessionId}/${streamId}/${streamLog.seqCounter}`;
    const frame = `id: ${id}\ndata: ${JSON.stringify(jsonData)}\n\n`;
    streamLog.events.push({ id, seqNum: streamLog.seqCounter, data: frame });
    if (streamLog.events.length > MAX_BUFFER_SIZE) {
      streamLog.events.shift(); // drop oldest to stay within cap
    }
    res.write(frame);
  };

  session.pushEvent = pushEvent;

  // Spec §Resumability: send a prime event (seqNum=0, not buffered) so the client
  // has an anchor ID to supply as Last-Event-ID on the next reconnection.
  res.write(`id: ${sessionId}/${streamId}/0\ndata: \n\n`);

  // If resuming, replay buffered events that arrived after replayAfter.
  // Spec §Resumability: MUST NOT replay events from a different stream.
  if (replayAfter !== null) {
    const toReplay = streamLog.events.filter((e) => e.seqNum > replayAfter!);
    log.info({ sessionId, streamId, replayCount: toReplay.length }, "Replaying SSE events");
    for (const e of toReplay) {
      res.write(e.data);
    }
  }

  // Keepalive pings — NOT buffered; no value in replaying them on reconnect.
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
    // Clear pushEvent so handler code doesn't write to the closed connection.
    // Keep streamLog alive so the client can reconnect with Last-Event-ID.
    if (session.activeStreamId === streamId) {
      session.pushEvent = undefined;
    }
    log.info({ sessionId, streamId }, "SSE stream closed");
  });
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

// ---------------------------------------------------------------------------
// Remarks:
//
// - Spec §Sending Messages point 5: Must return either text/event-stream or application/json.
// In practice, Express's res.json() will set Content-Type: application/json, and res.write() for SSE
// will set Content-Type: text/event-stream, so this is handled automatically.
// ---------------------------------------------------------------------------
