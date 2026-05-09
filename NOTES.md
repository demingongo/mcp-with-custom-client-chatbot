In the Model Context Protocol (MCP), a tool is an executable function exposed by a server that allows Large Language Models (LLMs) to interact with external systems, perform computations, or take real-world actions. Unlike read-only resources, tools represent dynamic operations that can modify state. [1, 2, 3] 
## MCP Tool Definition Properties
Each tool is defined using a structured schema that provides the model with the metadata necessary to discover and invoke it. [4, 5] 

* name (String): A unique identifier for the tool used by the model to reference it in decision outputs. It typically follows naming conventions like snake_case or camelCase (e.g., calculate_gpa).
* description (String): A human-readable text explanation of what the tool does. This is critical for the LLM to understand when and why to select a specific tool to fulfill a user request.
* inputSchema (Object): A valid JSON Schema (defaulting to draft 2020-12) that defines the expected parameters for the tool. It specifies the structure, data types, and required fields for the tool's arguments.
* title (Optional String): A human-friendly display name intended for user interfaces. If omitted, the name property is usually used as a fallback.
* outputSchema (Optional Object): A JSON Schema that defines the structure of the data the tool is expected to return after execution.
* icons (Optional Array): An array of icon descriptors used for visual representation in client applications.
* annotations (Optional Object): Key-value pairs providing additional metadata about the tool's behavior or specific UI requirements. [4, 5, 6, 7, 8, 9, 10, 11, 12] 

## Summary Table

| Property [5, 6, 7, 12, 13] | Requirement | Description |
|---|---|---|
| name | Required | Unique identifier used for programmatic tool calls. |
| description | Required | Text explaining the tool's purpose and usage to the LLM. |
| inputSchema | Required | JSON Schema defining the required/optional parameters. |
| title | Optional | Human-readable name for UI display. |
| outputSchema | Optional | Schema defining the expected return format. |
| icons | Optional | Visual assets for the tool in a client interface. |


[1] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[2] [https://modelcontextprotocol.info](https://modelcontextprotocol.info/docs/concepts/tools/)
[3] [https://github.com](https://github.com/modelcontextprotocol/python-sdk)
[4] [https://obot.ai](https://obot.ai/resources/learning-center/mcp-tools/)
[5] [https://apxml.com](https://apxml.com/courses/getting-started-model-context-protocol/chapter-3-implementing-tools-and-logic/tool-definition-schema)
[6] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
[7] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
[8] [https://medium.com](https://medium.com/@diwakarkumar_18755/a-beginners-guide-to-model-context-protocol-mcp-with-real-life-examples-and-code-using-18d7b1513a7c)
[9] [https://www.merge.dev](https://www.merge.dev/blog/mcp-tool-schema)
[10] [https://www.merge.dev](https://www.merge.dev/blog/mcp-tool-description)
[11] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/server-concepts)
[12] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-06-18/schema)
[13] [https://docs.spring.io](https://docs.spring.io/spring-ai/reference/api/tools.html)

---

In the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), a Tool Definition is a structured metadata object that tells an AI model exactly how to identify and call a specific function. [1, 2, 3, 4] 
While earlier drafts were simpler, the current standard (2025-11-25) includes several key properties: [3] 
## Core Required Properties

* name: A unique identifier for the tool (e.g., get_weather_data). It must be a string and is often limited to alphanumeric characters and underscores.
* description: A plain-text explanation of what the tool does. This is the primary signal used by the LLM to decide when to call the tool.
* inputSchema: A [JSON Schema](https://modelcontextprotocol.io/specification/draft/basic) (defaulting to Draft 2020-12) that defines the parameters. It must be an object type. [1, 2, 5, 6, 7] 

## Optional Metadata & UI Properties

* title: An optional human-readable name meant for display in user interfaces rather than for the model to use.
* icons: An array of Icon objects (URIs or base64 data) to provide a visual identity for the tool in a client UI.
* outputSchema: An optional JSON Schema that describes the expected structure of the tool's result. This helps models understand the nature of the data they will receive back. [1, 8, 9, 10, 11] 

## Advanced Behavioral Properties

* annotations: Custom properties describing specific behaviors or categorization of the tool. [1, 10] 
* execution: An object containing execution-specific flags, most notably:
* taskSupport: Indicates if the tool supports "task-augmented execution" (can be "forbidden", "optional", or "required"). [1, 10] 
* x-mcp-header: An extension used within the inputSchema to signal that certain parameters should be mirrored into HTTP headers for routing by WAFs or load balancers. [5] 

[1] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
[2] [https://apxml.com](https://apxml.com/courses/getting-started-model-context-protocol/chapter-3-implementing-tools-and-logic/tool-definition-schema)
[3] [https://www.stainless.com](https://www.stainless.com/mcp/convert-openapi-specs-to-mcp-servers)
[4] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[5] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[6] [https://www.merge.dev](https://www.merge.dev/blog/mcp-tool-description)
[7] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic)
[8] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[9] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic)
[10] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[11] [https://github.com](https://github.com/strands-agents/sdk-python/issues/787)


---

The response from an MCP server when a tool is called follows a specific envelope structure defined by the protocol as a CallToolResult. [1] 
## 1. The Response Envelope
Unlike standard REST APIs that might return a raw JSON body, an MCP tool must return an object with two primary top-level fields:

* content: An array of content blocks. This allows one tool call to return multiple types of data (e.g., some text and an image).
* isError: A boolean flag indicating if the execution failed. If true, the model will treat the content as an error message rather than successful data. [1, 2, 3, 4] 

## 2. Supported Content Types
Each item in the content array must have a type property. The protocol supports several distinct blocks:

| Content Type [2, 3, 5, 6, 7] | Purpose | Key Property |
|---|---|---|
| text | Standard textual output or JSON strings. | text: string |
| image | Binary visual data. | data: string (base64) & mimeType |
| resource | References to internal server files/data. | resource: object |
| embeddedResource | Actual resource content included inline. | resource: object |

## 3. Complete JSON Example
Here is what a successful response looks like at the protocol level:

{
  "content": [
    {
      "type": "text",
      "text": "Success: User updated. New email: dev@example.com"
    },
    {
      "type": "image",
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "mimeType": "image/png"
    }
  ],
  "isError": false
}

## 4. Handling Error Responses
If something goes wrong (e.g., a 404 Not Found from your underlying API), you should set isError: true. This signals to the AI that the tool call didn't work as intended. [1] 

{
  "content": [
    {
      "type": "text",
      "text": "Error: User ID '123' does not exist in the database."
    }
  ],
  "isError": true
}

[1] [https://py.sdk.modelcontextprotocol.io](https://py.sdk.modelcontextprotocol.io/server/)
[2] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
[3] [https://github.com](https://github.com/webmachinelearning/webmcp/issues/41)
[4] [https://forum.cursor.com](https://forum.cursor.com/t/how-to-use-new-feature-image-injectionin-in-mcp/83382)
[5] [https://taylorwilsdon.medium.com](https://taylorwilsdon.medium.com/the-missing-guide-to-native-tool-function-calling-with-mcp-openapi-servers-ed2557a8a7b7)
[6] [https://github.com](https://github.com/openclaw/openclaw/issues/75674)
[7] [https://medium.com](https://medium.com/@jamesaspinwall/mcp-tools-resources-and-client-server-interaction-explained-0b6be41287c5)

---

The Model Context Protocol (MCP) uses JSON-RPC 2.0 as its transport-agnostic communication layer. This means every request and response is a JSON object with a specific set of fields. [1, 2, 3] 
## 1. The Tool Call Request
When a client (like an AI model) wants to execute a tool, it sends a tools/call request. [4, 5] 
Wire Format (JSON):

{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "update_user_email",
    "arguments": {
      "user_id": 123,
      "new_email": "hello@example.com"
    }
  }
}


* jsonrpc: Must be exactly "2.0".
* id: A unique identifier for this specific request. The server must return this same ID in the response.
* method: The protocol method being called (e.g., tools/call, resources/read).
* params: Contains the tool name and the arguments defined in your inputSchema. [1, 2, 4, 6, 7, 8] 

## 2. The Tool Call Response (Success)
If the tool executes successfully, the server responds with a result object. [4, 6] 
Wire Format (JSON):

{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "User email successfully updated."
      }
    ],
    "isError": false
  }
}


* result: The standard JSON-RPC field for successful outcomes.
* content: An MCP-specific array of output blocks (text, image, or resource).
* isError: Indicates if the tool itself encountered a problem (like a database error), as opposed to a protocol-level error. [1, 4, 6] 

## 3. Protocol-Level Error Response
If the server cannot parse your request or the method doesn't exist, it returns a standard JSON-RPC error object instead of a result. [1, 6] 
Wire Format (JSON):

{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": { "details": "The server does not support 'tools/delete'" }
  }
}


* code: A standard integer (e.g., -32601 for Method Not Found, -32700 for Parse Error).
* message: A short summary of the error. [1, 6, 8] 

## Why this matters
This structure is what allows MCP to be transport-agnostic. Whether you are sending these strings over a local stdio pipe, a WebSocket, or an HTTP POST, the JSON inside remains identical. [9, 10, 11, 12] 

[1] [https://dexcompiler.com](https://dexcompiler.com/blog/jsonrpc-analysis)
[2] [https://apxml.com](https://apxml.com/courses/getting-started-model-context-protocol/chapter-1-architecture-and-fundamentals/json-rpc-message-structure)
[3] [https://amdatalakehouse.substack.com](https://amdatalakehouse.substack.com/p/understanding-rpc-and-mcp-in-agentic)
[4] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/server/tools)
[5] [https://github.com](https://github.com/alekspetrov/mcp-docs-service/blob/main/docs/guides/mcp-protocol-usage.md)
[6] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-11-25/basic)
[7] [https://abvijaykumar.medium.com](https://abvijaykumar.medium.com/model-context-protocol-deep-dive-part-3-1-3-hands-on-implementation-522ecd702b0d)
[8] [https://github.com](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md)
[9] [https://arshren.medium.com](https://arshren.medium.com/a-quick-and-simple-explanation-of-model-context-protocol-mcp-b5c8498c5305)
[10] [https://www.jsonrpc.org](https://www.jsonrpc.org/specification)
[11] [https://medium.com](https://medium.com/@GeneHFang/json-rpc-communication-between-systems-using-json-8de7784a3d97)
[12] [https://apxml.com](https://apxml.com/courses/getting-started-model-context-protocol/chapter-1-architecture-and-fundamentals/json-rpc-message-structure)

---

The initialization phase is the mandatory first step in any MCP connection. It involves a three-step handshake to negotiate protocol versions and exchange capabilities between the client (AI application) and the server. [1, 2, 3] 
## 1. Client → Server: initialize Request [4] 
The client starts by announcing its supported protocol version and what it is capable of doing (like "sampling" new messages from the AI). [1, 5] 

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {}
    },
    "clientInfo": {
      "name": "my-ai-client",
      "version": "1.0.0"
    }
  }
}

## 2. Server → Client: initialize Result [6, 7] 
The server responds with its own info and confirms which version of the protocol it will use. Crucially, this is where the server tells the client which "primitives" (Tools, Resources, or Prompts) it actually provides. [1, 4, 8, 9] 

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": { "subscribe": true },
      "prompts": {}
    },
    "serverInfo": {
      "name": "my-mcp-server",
      "version": "2.4.1"
    }
  }
}

## 3. Client → Server: notifications/initialized [6, 7, 10] 
Finally, the client sends a one-way notification to confirm it has received the server's capabilities and is ready to start normal operations. No tool or resource requests can be sent until this message is delivered. [3, 8, 9, 11] 

{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}

## Why this flow matters:

* Version Matching: If the client and server versions don't match, they must either negotiate a lower common version or disconnect. [12, 13] 
* Discovery: After this handshake, the client will typically follow up with a tools/list request to get the full JSON Schemas you've been working on. [6, 14] 
* Safety: It ensures that a client doesn't try to "subscribe" to a resource if the server clearly stated during initialization that it doesn't support subscriptions. [5, 15] 

[1] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
[2] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)
[3] [https://github.com](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-client-development-guide.md)
[4] [https://codilime.com](https://codilime.com/blog/model-context-protocol-explained/)
[5] [https://portkey.ai](https://portkey.ai/blog/mcp-message-types-complete-json-rpc-reference-guide/)
[6] [https://medium.com](https://medium.com/@lizhuohang.selina/model-context-protocol-mcp-architecture-workflow-and-sample-payloads-de17230f9633)
[7] [https://abvijaykumar.medium.com](https://abvijaykumar.medium.com/model-context-protocol-deep-dive-part-3-1-3-hands-on-implementation-522ecd702b0d)
[8] [https://dev.to](https://dev.to/shrsv/unpacking-the-mcp-base-protocol-3f3n)
[9] [https://github.com](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md)
[10] [https://codilime.com](https://codilime.com/blog/model-context-protocol-explained/)
[11] [https://www.youtube.com](https://www.youtube.com/watch?v=gnHc0w4fvEQ)
[12] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)
[13] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle)
[14] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
[15] [https://dev.to](https://dev.to/portkey/mcp-message-types-complete-mcp-json-rpc-reference-guide-3gja)

---

The Model Context Protocol (MCP) defines specific endpoints depending on the transport mechanism you use. For remote network communication, there are two primary methods: the modern Streamable HTTP (introduced in 2025) and the older SSE (Server-Sent Events). [1, 2, 3, 4, 5] 
## 1. Streamable HTTP Transport (Recommended) [6] 
This is the standard for modern remote MCP connections. It simplifies communication into a single endpoint that handles bidirectional messaging via different HTTP methods. [1, 6] 

| Endpoint [1, 7, 8, 9] | Method | Purpose |
|---|---|---|
| /mcp (Example) | GET | Opens a persistent stream (SSE) for the server to send asynchronous notifications or requests to the client. |
| /mcp (Example) | POST | Used by the client to send all JSON-RPC 2.0 messages (requests, responses, or notifications) to the server. |

## 2. SSE Transport (Legacy/Standard)
This transport uses two distinct endpoints to separate the flow of data. The server typically provides an SSE endpoint first, which then tells the client where to send POST messages. [2, 10, 11] 

| Endpoint [3, 5, 10, 11, 12] | Method | Purpose |
|---|---|---|
| /sse | GET | Establishing the initial persistent connection. The server uses this to push events (like tool execution results or resource updates) to the client. |
| /messages | POST | A dedicated endpoint (often returned by the server during the SSE handshake) where the client sends its JSON-RPC commands, such as calling a tool or listing resources. |

## 3. Key JSON-RPC Operations (Logical Endpoints) [13] 
While the physical transport might be a single URL, the AI client logically interacts with several protocol "routes" via the JSON-RPC method field in the POST body: [12, 14] 

* initialize: The mandatory first handshake to negotiate versions and exchange server capabilities (tools, prompts, etc.).
* tools/list: Fetches the catalog of available tools, including their names, descriptions, and inputSchema.
* tools/call: Executes a specific tool with the arguments provided by the AI model.
* resources/list: Lists available data sources (files, databases, or documentation) that the AI can read.
* prompts/list: Provides predefined templates or "shortcut" prompts that the server offers to help guide the AI. [12, 14, 15, 16, 17] 

[1] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
[2] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/transports)
[3] [https://www.youtube.com](https://www.youtube.com/watch?v=n5DG0uClbdo)
[4] [https://developers.cloudflare.com](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
[5] [https://gis-mcp.com](https://gis-mcp.com/endpoints/)
[6] [https://developers.cloudflare.com](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
[7] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
[8] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/transports)
[9] [https://modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
[10] [https://modelcontextprotocol.info](https://modelcontextprotocol.info/specification/draft/basic/transports/)
[11] [https://www.speakeasy.com](https://www.speakeasy.com/mcp/core-concepts/transports)
[12] [https://www.youtube.com](https://www.youtube.com/watch?v=3NUV8JcihCg)
[13] [https://www.youtube.com](https://www.youtube.com/watch?v=RhTiAOGwbYE)
[14] [https://composio.dev](https://composio.dev/content/what-is-mcp-gateway-and-why-your-enterprise-need-it)
[15] [https://github.com](https://github.com/modelcontextprotocol/python-sdk)
[16] [https://www.youtube.com](https://www.youtube.com/watch?v=fz0zKHF9VSY&t=17)
[17] [https://www.ibm.com](https://www.ibm.com/think/topics/model-context-protocol)

---
