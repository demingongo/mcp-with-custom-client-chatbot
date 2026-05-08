import {
  filterByCategory,
  getProductById,
  listCategories,
  listProducts,
  searchProducts,
} from "../services/productService";
import { McpRequest, McpResponse, McpToolDefinition } from "../types";
import { Router, Request, Response } from "express";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "debug" }).child({
  tag: "mcp",
});

const router = Router();

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

router.get("/tools", (_req: Request, res: Response) => {
  log.debug({ count: TOOLS.length }, "GET /mcp/tools");
  res.json({ ok: true, tools: TOOLS });
});

router.post("/invoke", (req: Request, res: Response) => {
  const body = req.body as McpRequest;
  const tool = body?.tool;
  const args = (body?.arguments ?? {}) as Record<string, string>;

  log.info({ arguments: args }, `invoke '${tool ?? "?"}'`);

  const respond = <T>(data: T): McpResponse<T> => ({ ok: true, tool, data });
  const fail = (status: number, error: string): void => {
    log.warn({ status, error }, `'${tool ?? "?"}' failed`);
    res.status(status).json({ ok: false, tool, error } satisfies McpResponse);
  };

  if (!tool) return fail(400, "Missing 'tool' in request body.");

  switch (tool) {
    case "list_products": {
      const data = listProducts();
      log.info({ count: data.length }, `'${tool}' ok`);
      return res.json(respond(data));
    }

    case "get_product": {
      if (!args.id) return fail(400, "Missing argument: id");
      const p = getProductById(args.id);
      if (!p) return fail(404, `Product '${args.id}' not found`);
      log.info({ id: p.id }, `'${tool}' ok`);
      return res.json(respond(p));
    }

    case "search_products": {
      if (!args.query) return fail(400, "Missing argument: query");
      const data = searchProducts(args.query);
      log.info({ query: args.query, hits: data.length }, `'${tool}' ok`);
      return res.json(respond(data));
    }

    case "list_categories": {
      const data = listCategories();
      log.info({ count: data.length }, `'${tool}' ok`);
      return res.json(respond(data));
    }

    case "products_by_category": {
      if (!args.category) return fail(400, "Missing argument: category");
      const data = filterByCategory(args.category);
      log.info({ category: args.category, hits: data.length }, `'${tool}' ok`);
      return res.json(respond(data));
    }

    default:
      return fail(400, `Unknown tool: ${tool}`);
  }
});

export default router;
