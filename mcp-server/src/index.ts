import mcpRouter from "./routes/mcp";
import productsRouter from "./routes/products";
import { loadCatalog } from "./services/productService";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import pino from "pino";

const baseLog = pino({ level: process.env.LOG_LEVEL ?? "debug" });
const httpLog = baseLog.child({ tag: "http" });
const serverLog = baseLog.child({ tag: "server" });

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const t0 = Date.now();
  httpLog.debug({ ip: req.ip, ua: req.headers["user-agent"]?.slice(0, 80) }, `→ ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    const ms = Date.now() - t0;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    httpLog[level]({ status: res.statusCode, ms }, `← ${req.method} ${req.originalUrl}`);
  });
  next();
});

app.get("/info", (_req: Request, res: Response) => {
  const catalog = loadCatalog();
  res.json({
    name: "ConnectAuz Knowledge MCP Server",
    description: "Structured product knowledge for ConnectAuz — see /mcp/tools for the MCP tool surface.",
    source: catalog.source,
    lastUpdated: catalog.lastUpdated,
    productCount: catalog.products.length,
    endpoints: {
      products: "/products",
      productSearch: "/products/search?q=...",
      productById: "/products/:id",
      categories: "/products/categories",
      mcpTools: "/mcp/tools",
      mcpInvoke: "POST /mcp/invoke",
    },
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use("/products", productsRouter);
app.use("/mcp", mcpRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  serverLog.error({ error: err.message, stack: err.stack }, "unhandled error");
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  serverLog.info({ port: PORT, logLevel: process.env.LOG_LEVEL ?? "debug" }, "ConnectAuz MCP server started");
});
