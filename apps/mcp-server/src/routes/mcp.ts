import { app } from "../apps/http-app";
import { log } from "../services/log-service";
import {
  filterByCategory,
  getProductById,
  listCategories,
  listProducts,
  searchProducts,
} from "../services/product-service";
import { McpRequest, McpResponse, McpToolDefinition } from "../types";
import { KaapiServerRoute } from "@kaapi/kaapi";
import { OpenAPIV3_1 } from "openapi-types";

const TOOLS: McpToolDefinition[] = [
  {
    name: "list_products",
    description: "List all ConnectAuz products with id, name, URL, and short description.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_product",
    description: "Get full details for a single product by id or name.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Product id (e.g. 'ca-fleet') or product name.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "search_products",
    description: "Free-text search across product names, descriptions, features, and use cases.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_categories",
    description: "List the distinct product categories / industries served.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "products_by_category",
    description: "List products that belong to a category (substring match).",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Category keyword, e.g. 'Fleet'.",
        },
      },
      required: ["category"],
    },
  },
];

export const toolsRoute: KaapiServerRoute = {
  handler: () => {
    log.debug({ count: TOOLS.length }, "GET /mcp/tools");
    return { ok: true, tools: TOOLS };
  },
  method: "get",
  path: "/mcp/tools",
  options: {
    description: "List available tools with metadata.",
    tags: ["MCP"],
    id: "mcp_list_tools",
  },
};

const NAMES = ["list_products", "get_product", "search_products", "list_categories", "products_by_category"];

const cachedTools: {
  tools: McpToolDefinition[];
  updatedAt: number;
} = {
  tools: [],
  updatedAt: 0,
};

export const toolsV2Route: KaapiServerRoute = {
  handler: () => {
    try {
      if (Date.now() - cachedTools.updatedAt > 60 * 1000) {
        const tools = [];
        const appOpenApi = app.openapi.result() as unknown as OpenAPIV3_1.Document;
        for (const [_path, value] of Object.entries(appOpenApi.paths ?? {})) {
          for (const [_method, op] of Object.entries(value || {})) {
            if (!(op && typeof op === "object")) {
              continue;
            }
            if ("operationId" in op && typeof op.operationId === "string" && NAMES.includes(op.operationId)) {
              // TODO: use response 200 for output schema if available
              console.log(op);

              const inputSchema: McpToolDefinition["inputSchema"] = {
                type: "object",
                properties: {},
              };

              //let outputSchema: McpToolDefinition["outputSchema"] = undefined;

              // 1. Process parameters (query, path, header)
              if (op.parameters?.length) {
                inputSchema.properties = inputSchema.properties ?? {};
                for (const param of op.parameters) {
                  if ("$ref" in param) {
                    log.warn({ ref: param.$ref }, "Referenced parameters are not supported in tool input schema");
                    continue;
                  }
                  if (!param.name || !param.in) {
                    log.warn({ param }, "Invalid parameter definition, missing 'name' or 'in'");
                    continue;
                  }

                  // const key = `${param.in}_${param.name}`; // prefix with 'query_' or 'path_' to avoid name collisions
                  const key = `${param.name}`;
                  if (param.schema && "type" in param.schema && param.schema.type) {
                    inputSchema.properties[key] = param.schema
                  } else {
                    inputSchema.properties[key] = {
                      type: "string", // For simplicity, we treat all parameters as strings in this example.
                      description: param.description,
                    };
                  }

                  if (param.required) {
                    inputSchema.required = inputSchema.required ?? [];
                    inputSchema.required.push(key);
                  }
                }
              }

              // 2. Process Request Body (Flattening objects into the root)
              if ("requestBody" in op && op.requestBody && typeof op.requestBody === "object" &&
                "content" in op.requestBody && op.requestBody.content && typeof op.requestBody.content === "object"
              ) {
                const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
                if (bodySchema && typeof bodySchema === "object" && "type" in bodySchema && bodySchema.type) {
                  if (bodySchema.type === "object" && bodySchema.properties) {
                    Object.entries(bodySchema.properties).forEach(([name, schema]) => {
                      inputSchema.properties[name] = schema;
                    });
                    if (bodySchema.required) {
                      inputSchema.required = inputSchema.required ?? [];
                      inputSchema.required.push(...bodySchema.required);
                    }
                  } else {
                    // If the body is a primitive or array, wrap it in a "body" property
                    inputSchema.properties["body"] = bodySchema;
                    inputSchema.required = inputSchema.required ?? [];
                    inputSchema.required.push("body");
                  }
                }
              }

              const tool: McpToolDefinition = {
                name: op.operationId,
                description: op.summary ?? "",
                inputSchema: inputSchema,
                //outputSchema: outputSchema,
              };
              tools.push(tool);
            }
          }
        }
        cachedTools.tools = tools;
        cachedTools.updatedAt = Date.now();
      }
    } catch (err) {
      log.error({ err }, "Error fetching tools");
    }

    log.debug({ count: cachedTools.tools.length }, "GET /mcp/v2/tools");
    return { ok: true, tools: cachedTools.tools };
  },
  method: "get",
  path: "/mcp/v2/tools",
  options: {
    description: "List available tools with metadata.",
    tags: ["MCP"],
    id: "mcp_list_tools_v2",
  },
};

export const invokeRoute: KaapiServerRoute = {
  handler: (request, h) => {
    const body = request.payload as McpRequest;
    const tool = body?.tool;
    const args = (body?.arguments ?? {}) as Record<string, string>;

    log.info({ arguments: args }, `invoke '${tool ?? "?"}'`);

    const respond = <T>(data: T): McpResponse<T> => ({ ok: true, tool, data });
    const fail = (status: number, error: string): ReturnType<typeof h.response> => {
      log.warn({ status, error }, `'${tool ?? "?"}' failed`);
      return h.response({ ok: false, tool, error } satisfies McpResponse).code(status);
    };

    if (!tool) return fail(400, "Missing 'tool' in request body.");

    switch (tool) {
      case "list_products": {
        const data = listProducts();
        log.info({ count: data.length }, `'${tool}' ok`);
        return respond(data);
      }

      case "get_product": {
        if (!args.id) return fail(400, "Missing argument: id");
        const p = getProductById(args.id);
        if (!p) return fail(404, `Product '${args.id}' not found`);
        log.info({ id: p.id }, `'${tool}' ok`);
        return respond(p);
      }

      case "search_products": {
        if (!args.query) return fail(400, "Missing argument: query");
        const data = searchProducts(args.query);
        log.info({ query: args.query, hits: data.length }, `'${tool}' ok`);
        return respond(data);
      }

      case "list_categories": {
        const data = listCategories();
        log.info({ count: data.length }, `'${tool}' ok`);
        return respond(data);
      }

      case "products_by_category": {
        if (!args.category) return fail(400, "Missing argument: category");
        const data = filterByCategory(args.category);
        log.info({ category: args.category, hits: data.length }, `'${tool}' ok`);
        return respond(data);
      }

      default:
        return fail(400, `Unknown tool: ${tool}`);
    }
  },
  method: "post",
  path: "/mcp/invoke",
  options: {
    description: "Invoke a tool with arguments.",
    tags: ["MCP"],
    id: "mcp_invoke_tool",
  },
};
