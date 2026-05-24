# mcp-server-with-auth

An MCP server implementing the Streamable HTTP transport (spec `2025-11-25`) **without** the official TypeScript SDK. It acts as an OAuth 2.0 / OpenID Connect **resource server**: every request is authenticated by verifying the Bearer JWT against the authorization server's JWKS URI.

---

## Why write a raw HTTP MCP server instead of using the SDK?

### Pros of rolling your own

| Area | Detail |
|---|---|
| **Full auth control** | The SDK gives no first-class hook to plug in JWT/OIDC validation at the transport layer. Rolling your own lets you reject unauthenticated requests at the HTTP level, before any MCP logic runs, and lets you propagate verified credential claims (user id, scopes, client id) into every tool handler. |
| **Scope-based authorization** | You can gate individual MCP methods on specific OAuth scopes (e.g. `mcp:tools`) with a simple middleware check. The SDK has no concept of per-method authorization. |
| **Protocol-version negotiation** | The spec mandates specific HTTP status codes and JSON-RPC error codes for missing or unsupported `MCP-Protocol-Version` headers. Implementing this yourself means you can be exact; the SDK may paper over it. |
| **Session lifecycle** | You own the session store (`Map<string, Session>`), its TTL, eviction policy, and any data you want to attach per session (e.g. the authenticated user). The SDK's session model is opaque. |
| **Error mapping** | The spec defines how JSON-RPC error codes map to HTTP status codes (`-32601` → 404, `-32602` → 422, server errors → 500, etc.). A hand-rolled server can apply these rules exactly; the SDK tends to flatten everything to 400/500. |
| **Framework integration** | You can use any HTTP framework (here: Hapi via `@kaapi/kaapi`) with its full ecosystem — request validation, API documentation (Scalar/OpenAPI), structured logging, plugin architecture — none of which the SDK exposes. |
| **Streaming granularity** | SSE stream lifetime, flushing cadence, and connection teardown are under your control. This matters for proxies, load balancers, and clients with strict timeout requirements. |
| **Smaller attack surface** | No third-party transport code sits between your auth checks and the network. Every security decision is explicit and auditable in your own codebase. |

### Cons / trade-offs

| Area | Detail |
|---|---|
| **More boilerplate** | You must implement JSON-RPC parsing, method dispatch, `initialize` / `tools/list` / `tools/call` handlers, and notification support yourself. |
| **Spec drift** | As the MCP spec evolves you must track changes manually. The SDK will absorb breaking spec changes for you. |
| **No built-in client helpers** | The SDK ships a matching client; your custom server may require a matching custom client or careful compatibility testing. |
| **Maintenance burden** | Bug fixes and new transport features (batching policy changes, new protocol versions) are entirely your responsibility. |
| **Tooling ecosystem** | Some MCP-aware tooling (inspectors, test harnesses) is built against the SDK's internals and may not work out of the box. |

---

## Authentication flow

This server is a **resource server** in the OAuth 2.0 sense:

1. The client obtains a JWT access token from the authorization server (client credentials or authorization code flow).
2. The client sends the token as `Authorization: Bearer <token>` on every MCP request.
3. This server fetches the authorization server's public keys via its **JWKS URI** and verifies the token signature with `RS256`.
4. Verified claims (`sub`, `aud`, `scope`) are extracted and made available to route handlers.
   - `sub === aud` → machine-to-machine token; the `app.id` credential is set.
   - `sub !== aud` → user token; `user.id`, `user.username`, `user.email` credentials are set.
5. Requests without a valid token, or with insufficient scope (`mcp:tools`), are rejected with the appropriate JSON-RPC error and HTTP status code before any tool logic executes.
