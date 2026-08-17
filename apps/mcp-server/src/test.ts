import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { type } from 'arktype';

// 1. Initialize your MCP Server
const server = new McpServer({
    name: 'arktype-mcp-server',
    version: '1.0.0'
});

// 2. Define your tool parameters using ArkType
const WeatherInput = type({
    city: 'string',
    days: '1<=number<=7' // Leveraging ArkType's natural type syntax
});

// 3. Register the tool with the McpServer instance
server.registerTool(
    'get_weather',
    {
        description: 'Get weather forecast for a given city',
        inputSchema: WeatherInput, // Passes the ArkType validator directly
    },
    async ({ city, days }, _ctx) => {
        // The arguments here are completely type-safe based on your ArkType definition
        return {
            _meta: {
                progressToken: 'weather_progress_token_123'
            },
            content: [
                {
                    type: 'text',
                    text: `The weather in ${city} for the next ${days} days will be sunny!`
                }
            ]
        };
    }
);

// 4. Start the server via Stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);