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

Would you like to see a code example of a complete tool definition in TypeScript or Python?

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
