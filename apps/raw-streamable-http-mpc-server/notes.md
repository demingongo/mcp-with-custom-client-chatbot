The server is **correctly implementing Streamable HTTP**, not the deprecated SSE transport. Here's how to tell them apart:

### Deprecated SSE transport (what I did NOT build)

```
GET  /sse       ← client connects first, keeps stream open forever
POST /messages  ← client posts requests here
                ← responses flow BACK through the /sse stream
```
Two separate endpoints. POST responses are `202`; actual results arrive later via the SSE stream.

---

### Streamable HTTP (what I built)

```
POST   /mcp  ← client posts requests, server responds directly (JSON or SSE)
GET    /mcp  ← optional: server-initiated push notifications
DELETE /mcp  ← session teardown
```

Single unified endpoint. POST responses carry the actual JSON-RPC result synchronously. The GET/SSE channel is optional and only for server → client notifications.

This matches the description in Agent_Factory.md exactly:

> _"POST your JSON-RPC request to a single endpoint. The server responds with either: (1) a complete JSON response or (2) an SSE stream."_

---

### What the current server does correctly ✓

| Streamable HTTP requirement | Implementation |
|---|---|
| Single `/mcp` endpoint | `POST /mcp`, `GET /mcp`, `DELETE /mcp` |
| POST returns direct JSON result | `res.json(response)` |
| Session via `Mcp-Session-Id` header | Header read + set on initialize |
| Optional SSE channel for server push | `GET /mcp` SSE stream with ping |
| Session teardown | `DELETE /mcp` |

---

### One real gap

The server never returns SSE from a `POST` response. That's valid — the spec says the server _may_ stream; it isn't required to. Since no tool here is long-running, plain JSON responses are correct.

The `McpClient.handleStreamedResponse` path is written to handle the case where a POST response itself is `text/event-stream`, which is a Streamable HTTP feature (not SSE transport). It just never triggers against this server because every POST returns JSON.

---
## Standard Client-to-Server methods:

### 1. Lifecycle (Required)
These manage the connection state.

* initialize: The very first call. Client sends its capabilities and gets yours.
* notifications/initialized: (Notification) Sent by the client to signal it's ready to start work.
* ping: A standard JSON-RPC check to see if the server is responsive.

### 2. Tools (Most Common)
Allows the LLM to perform actions.

* tools/list: Client asks for all available tools and their JSON schemas.
* tools/call: Client requests the execution of a specific tool with arguments.

### 3. Resources (Read-Only Data)
Used for providing context like log files, documentation, or database rows.

* resources/list: List available static resources.
* resources/templates/list: List dynamic resource patterns (e.g., file:///{path}).
* resources/read: Fetch the actual content of a specific resource.
* resources/subscribe: Client asks for updates when a resource changes.
* resources/unsubscribe: Stop watching a resource.

### 4. Prompts (Templates)
Pre-defined "shortcuts" or system instructions.

* prompts/list: List available prompt templates.
* prompts/get: Retrieve a specific prompt, potentially with variables filled in.

### 5. Logging & Configuration

* logging/setLevel: Client tells the server how much detail it wants in the logs.
* notifications/cancelled: (Notification) Sent if the client wants to stop a long-running request.

### 6. Roots (Client Context)

* roots/list: If the client is an IDE (like Cursor or VS Code), it uses this to tell the server which project folders are currently open.

---

## Standard server-to-client methods:

Only need to implement them if the server has to be proactive.

### 1. Notifications (Server → Client)
These are "fire and forget" updates to tell the client that something has changed on the server side.

* notifications/tools/list_changed: Tells the client it should call tools/list again because tools were added, removed, or updated.
* notifications/resources/list_changed: Signals that the list of available resources has changed.
* notifications/prompts/list_changed: Signals that the list of prompts has changed.
* notifications/resource/updated: Sent when a specific resource the client "subscribed" to has new data (requires the uri in params).
* notifications/message: A generic way to send logs or status messages to the client UI (params include level: "debug", "info", "warning", "error", and data).
* notifications/progress: Used during long-running tool executions to update the UI (params include progress as a number and total).

### 2. Requests (Server → Client)
These are rare but powerful. The server asks the client for information and expects a response back (via a POST to your server).

* sampling/createMessage: The server asks the LLM (via the client) to generate a response. This allows your tool to "ask the AI a follow-up question" mid-execution.
* roots/list: The server asks the client which local directories or "roots" are currently accessible (common in IDE integrations).

### 3. Logic Example

```ts
// Example: Telling the client a tool changedconst msg = {
  jsonrpc: "2.0",
  method: "notifications/tools/list_changed"
};
res.write(`data: ${JSON.stringify(msg)}\n\n`);
// Example: Sending a log message to the user's screenconst logMsg = {
  jsonrpc: "2.0",
  method: "notifications/message",
  params: {
    level: "info",
    description: "Database indexing is 50% complete"
  }
};
res.write(`data: ${JSON.stringify(logMsg)}\n\n`);
```