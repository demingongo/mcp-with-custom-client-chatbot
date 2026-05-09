export interface McpResponse {
    jsonrpc: "2.0";
    id: string;
    result?: unknown;
    error?: { code: number; message: string };
}

export class McpClient {
    private endpoint: string;
    private sessionId: string | null = null;

    constructor(endpoint: string) {
        this.endpoint = endpoint;
    }

    async request(method: string, params?: unknown): Promise<McpResponse> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        // Include session ID if we have one
        if (this.sessionId) {
            headers["Mcp-Session-Id"] = this.sessionId;
        }

        const response = await fetch(this.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: crypto.randomUUID(),
                method,
                params,
            }),
        });

        // Update session ID from response
        const newSessionId = response.headers.get("Mcp-Session-Id");
        if (newSessionId) {
            this.sessionId = newSessionId;
        }

        // Check if response is SSE stream or regular JSON
        const contentType = response.headers.get("Content-Type") ?? "";

        if (contentType.includes("text/event-stream")) {
            // Handle as SSE stream - collect final result
            return await this.handleStreamedResponse(response);
        } else {
            // Handle as regular JSON response
            return await response.json();
        }
    }

    private async handleStreamedResponse(
        response: Response
    ): Promise<McpResponse> {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: McpResponse | null = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    const data = JSON.parse(line.slice(6));
                    // Accumulate or process intermediate results
                    finalResult = data;
                }
            }
        }

        if (!finalResult) {
            throw new Error("No result received from stream");
        }
        return finalResult;
    }

    async initialize(): Promise<void> {
        // 1. Send initialize
        const result = await this.request("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: {
                name: "my-mcp-client",
                version: "1.0.0",
            },
        });

        if (result.error) {
            throw new Error(`Initialize failed: ${result.error.message}`);
        }

        // 2. Send notifications/initialized (202, no body — skip json())
        await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Mcp-Session-Id': this.sessionId!,
            },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        });
    }

    async callTool(name: string, args: unknown): Promise<unknown> {
        const result = await this.request("tools/call", {
            name,
            arguments: args,
        });

        if (result.error) {
            throw new Error(`Tool call failed: ${result.error.message}`);
        }

        return result.result;
    }
}