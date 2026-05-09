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
  types.ts    — TypeScript types for JSON-RPC 2.0 and MCP primitives
  data.ts     — Simulated book library (6 hardcoded books)
  handler.ts  — MCP JSON-RPC dispatcher + in-memory session store
  index.ts    — Express HTTP server (Streamable HTTP transport)
```

### `types.ts`

Defines all protocol types with no runtime footprint:

- **JSON-RPC 2.0**: `JsonRpcRequest`, `JsonRpcSuccessResponse`, `JsonRpcErrorResponse`, `JsonRpcResponse`
- **MCP content blocks**: `TextContent`, `ImageContent`, `McpContent`
- **MCP tool layer**: `CallToolResult`, `McpToolDefinition`, `McpToolInputSchema`
- **Session**: `Session` (id, initialized, createdAt)

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

- CORS headers on every response + `OPTIONS /mcp` preflight handler
- `express.json()` for body parsing
- `POST /mcp` validates the JSON-RPC envelope, reads `mcp-session-id` header, attaches `Mcp-Session-Id` to the response on `initialize`
- `GET /mcp` opens an SSE stream, sends `event: connected` immediately then `event: ping` every 30 s; cleaned up on socket close
- `DELETE /mcp` removes the session from the store
- `GET /health` returns `{ status, activeSessions }`

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
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID" \
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
  -H "Mcp-Session-Id: $SESSION_ID"
```

The connection stays open and the server emits `event: ping` every 30 seconds. Press `Ctrl+C` to disconnect.

---

### 10. End the session

```bash
curl -si -X DELETE http://localhost:3001/mcp \
  -H "Mcp-Session-Id: $SESSION_ID"
```

Expected: **HTTP 204** with an empty body. The session is removed from the server.
