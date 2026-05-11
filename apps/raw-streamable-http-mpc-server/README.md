# raw-streamable-http-mpc-server

A minimal, framework-free implementation of a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server using the **Streamable HTTP transport**. Built with Express.js and zero MCP SDK dependency — every JSON-RPC message is handled by hand, making it a clear reference for understanding the wire protocol.

The domain data is a small simulated book library (no real database).

---

## What is Streamable HTTP?

Streamable HTTP is the modern MCP transport (introduced 2025). All communication flows through a **single `/mcp` endpoint** that changes behaviour based on the HTTP method:

| Method | Purpose |
|--------|---------|
| `POST /mcp` | Client sends JSON-RPC 2.0 messages (requests, notifications) |
| `GET /mcp` | Client opens a persistent SSE stream for server-push events |
| `DELETE /mcp` | Client ends the session |

---

## Project structure

```
src/
  types.ts              — TypeScript types for JSON-RPC 2.0 and MCP primitives
  data.ts               — Simulated book library (6 hardcoded books)
  handler.ts            — MCP JSON-RPC dispatcher + in-memory session store
  index.ts              — Express HTTP server (Streamable HTTP transport)
  client-examples/
    mcp-client.ts       — Minimal TypeScript MCP client (reference/testing only)
```

### `types.ts`

Defines all protocol types with no runtime footprint:

- **JSON-RPC 2.0**: `JsonRpcRequest`, `JsonRpcSuccessResponse`, `JsonRpcErrorResponse`, `JsonRpcResponse`
- **MCP content blocks**: `TextContent`, `ImageContent`, `McpContent`
- **MCP tool layer**: `CallToolResult`, `McpToolDefinition`, `McpToolInputSchema`
- **SSE resumption**: `BufferedSseEvent` (id, seqNum, raw SSE frame), `StreamLog` (streamId, sessionId, seqCounter, buffered events)
- **Session state**: `Session` (id, initialized, createdAt, streamLogs, activeStreamId, pushEvent)

### `data.ts`

Six hardcoded `Book` objects across three genres: _Science Fiction_, _Dystopian_, and _Literary Fiction_. No database — all data lives in a plain array.

### `handler.ts`

The JSON-RPC brain of the server:

- `sessions` — exported `Map<string, Session>` shared with the Express layer for session lifecycle management.
- `handleMcpRequest()` — routes incoming `JsonRpcRequest` objects to the appropriate handler and returns `{ response, newSessionId?, isNotification }`.

Supported methods:

| JSON-RPC method | Behaviour |
|-----------------|-----------|
| `initialize` | Creates a new session (via `crypto.randomUUID()`), returns protocol version and capabilities |
| `notifications/initialized` | Marks the session as fully initialized; returns HTTP 202 with no body |
| `ping` | Returns an empty success result |
| `tools/list` | Returns the array of 3 tool definitions |
| `tools/call` | Dispatches to `list_books`, `get_book`, or `search_books` |

Available tools:

| Tool | Required args | Optional args | Description |
|------|--------------|---------------|-------------|
| `list_books` | — | `genre`, `available_only` | List all books, with optional filters |
| `get_book` | `id` | — | Fetch a single book by ID |
| `search_books` | `keyword` | — | Case-insensitive search on title and author |

### `index.ts`

Express server wiring:

- DNS rebinding protection — validates the `Origin` header on all requests when bound to localhost; non-localhost origins are rejected with HTTP 403
- CORS headers on every response + `OPTIONS /mcp` preflight handler (HTTP 204)
- `express.json()` for body parsing
- `POST /mcp` — enforces `Accept: application/json, text/event-stream` on every request (HTTP 406 if missing); enforces `MCP-Protocol-Version: 2025-11-25` on every non-`initialize` request (HTTP 400 if missing/unsupported); validates the JSON-RPC 2.0 envelope; attaches `Mcp-Session-Id` to the response on `initialize`
- `GET /mcp` — enforces `Accept: text/event-stream`; opens a persistent SSE stream with `Last-Event-ID` resumption and a 500-event buffer per stream; emits a `$/ping` notification every 30 s as a keepalive; cleans up the `pushEvent` closure on socket close
- `DELETE /mcp` removes the session from the store
- `GET /health` returns `{ status, activeSessions }`

---

## Protocol Compliance — MCP 2025-11-25

This server targets the **MCP 2025-11-25** specification. The table below summarises which parts of the spec are implemented and which optional features are intentionally omitted.

### Implemented (required or used)

| Area | Details |
|------|---------|
| **JSON-RPC 2.0 Base Protocol** | All messages follow the JSON-RPC 2.0 wire format. Requests include a string/integer `id` (never `null`); notifications omit `id`; error responses echo the request `id` when parseable, or omit it entirely when the body is unparseable — matching the spec requirement that `id` MUST NOT be `null`. |
| **Streamable HTTP Transport** | Single `/mcp` endpoint supports `POST` (client → server messages), `GET` (server-push SSE stream), and `DELETE` (session termination). The `Accept` header is validated on every request: `POST` requires both `application/json` and `text/event-stream`; `GET` requires `text/event-stream`. JSON-RPC batching (array bodies) is rejected with HTTP 400 as required since 2025-06-18. |
| **Session Management** | A session UUID is created on `initialize` and returned in `Mcp-Session-Id`. All subsequent requests must supply that header — missing header → HTTP 400, unknown/expired session → HTTP 404. Sessions are explicitly terminated via `DELETE /mcp` (HTTP 204). |
| **Protocol Version Header** | Every non-`initialize` request must include `MCP-Protocol-Version: 2025-11-25`. Absent or unsupported values are rejected with HTTP 400. The server always responds with `protocolVersion: "2025-11-25"` in the `initialize` result, and the client SHOULD disconnect if it cannot support that version. |
| **DNS Rebinding Protection** | When bound to localhost (`127.0.0.1`), the `Origin` header is validated on every incoming request. Browser-originated requests with a non-localhost `Origin` are rejected with HTTP 403 Forbidden, preventing DNS-rebinding attacks. Non-browser clients (no `Origin` header) are allowed through. |
| **SSE Stream Management** | The `GET /mcp` handler opens a persistent SSE stream. Each event is assigned a globally unique `id` of the form `{sessionId}/{streamId}/{seqNum}`. A prime event (`seqNum=0`) is sent immediately so the client has an anchor `Last-Event-ID` for reconnection. On reconnect, buffered events (`MAX_BUFFER_SIZE = 500`) are replayed in order, never across stream boundaries. Keepalive `$/ping` notifications are emitted every 30 s (not buffered — no value replaying them). The `pushEvent` closure is cleared on disconnect to prevent writes to a closed socket. |
| **Initialization Phase** | `initialize` → `notifications/initialized` → operation, as required. The server returns `protocolVersion`, `serverInfo` (name, title, version), `capabilities`, and optional `instructions`. The session is not considered active until `notifications/initialized` is received: `tools/call` rejects calls made before that point. `ping` is handled at all times, matching the spec allowance for pings before full initialization. |
| **HTTP Transport Details** | Notification/response bodies (e.g. `notifications/initialized`) return HTTP 202 Accepted with no body. JSON-RPC requests return `Content-Type: application/json` with the response object. SSE streams return `Content-Type: text/event-stream` with `Cache-Control: no-cache` and `Connection: keep-alive`. |
| **CORS Headers** | Every response includes `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` (including `Mcp-Session-Id` and `Last-Event-ID`), and `Access-Control-Expose-Headers: Mcp-Session-Id`. `OPTIONS /mcp` preflight requests return HTTP 204. |

### Not implemented (all optional per spec)

| Feature | Why omitted |
|---------|------------|
| **Resources** (`resources` capability) | No file system or external data source to expose; the book catalogue is surfaced as tools instead. |
| **Prompts** (`prompts` capability) | No pre-canned prompt templates needed for this reference implementation. |
| **Logging** (server-initiated `notifications/message`) | Server logs go to `stderr` via pino; no need to forward them to the client over SSE. |
| **Completion** (`completions` capability) | Argument auto-complete is a UX enhancement — out of scope for a minimal reference server. |
| **Sampling** (client `sampling` capability) | Server-initiated LLM calls require a host with an LLM; not applicable here. |
| **Roots / Elicitation** (client capabilities) | No filesystem boundary negotiation or user-prompt flows needed. |
| **Task management** (`tasks` capability, experimental) | Experimental feature — all tool calls are synchronous and complete within a single request. |

---

## Running the server

```bash
# Development (auto-restarts on file changes)
pnpm dev

# Production
pnpm build
pnpm start
```

The server listens on **port 3001** by default. Override with `PORT=<port>`.

---

## Testing with curl

The examples below use Bash syntax for variable substitution. On Windows use PowerShell or Git Bash.

### 1. Health check

```bash
curl http://localhost:3001/health
```

```json
{ "status": "ok", "activeSessions": 0 }
```

---

### 2. Initialize — start a session

```bash
curl -si -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "clientInfo": { "name": "curl-client", "version": "0.0.1" },
      "capabilities": {}
    }
  }'
```

The response headers include:

```
Mcp-Session-Id: <uuid>
```

Copy that value and export it for the subsequent requests:

```bash
SESSION_ID="<uuid from header>"
```

---

### 3. Confirm initialization — notifications/initialized

```bash
curl -si -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'
```

Expected: **HTTP 202** with an empty body. The session is now fully active.

---

### 4. List all available tools

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

Returns the definitions for `list_books`, `get_book`, and `search_books`.

---

### 5. Call `list_books` — all books

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "list_books",
      "arguments": {}
    }
  }'
```

---

### 6. Call `list_books` — filter by genre and availability

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "list_books",
      "arguments": { "genre": "Science Fiction", "available_only": true }
    }
  }'
```

---

### 7. Call `get_book` — single book by ID

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "get_book",
      "arguments": { "id": "book-003" }
    }
  }'
```

Pass a non-existent ID to see the `isError: true` response:

```bash
"arguments": { "id": "book-999" }
```

---

### 8. Call `search_books` — keyword search

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "search_books",
      "arguments": { "keyword": "orwell" }
    }
  }'
```

---

### 9. Open the SSE stream (optional)

```bash
curl -N http://localhost:3001/mcp \
  -H "Accept: text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID"
```

The connection stays open and the server emits a `$/ping` JSON-RPC 2.0 notification every 30 seconds to keep the connection alive. Press `Ctrl+C` to disconnect.

---

### 10. End the session

```bash
curl -si -X DELETE http://localhost:3001/mcp \
  -H "Mcp-Session-Id: $SESSION_ID"
```

Expected: **HTTP 204** with an empty body. The session is removed from the server.
