import { Product, ProductCatalog } from "../types-products";
import { log } from "./log-service";
import fs from "fs";
import path from "path";
import { z } from 'zod';

const DATA_PATH = path.join(process.cwd(), "data", "products.json");

let cache: ProductCatalog | null = null;

export function loadCatalog(force = false): ProductCatalog {
  if (cache && !force) return cache;
  log.info({ path: DATA_PATH, force }, "loading products.json");
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  cache = JSON.parse(raw) as ProductCatalog;
  log.info({ products: cache.products.length, lastUpdated: cache.lastUpdated }, "loaded");
  return cache;
}

export function saveCatalog(catalog: ProductCatalog): void {
  log.info({ products: catalog.products.length }, "saving products.json");
  fs.writeFileSync(DATA_PATH, JSON.stringify(catalog, null, 2), "utf-8");
  cache = catalog;
}

export function listProducts(): Product[] {
  return loadCatalog().products;
}

export const productByIdArgsSchema = z.object({
  id: z.string().describe("The unique identifier of the product (e.g. 'connectauz-analytics')."),
});

export function getProductById(args: z.infer<typeof productByIdArgsSchema>): Product | undefined {
  const { id } = args;
  const needle = id.toLowerCase().trim();
  const found = listProducts().find((p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle);
  log.debug({ id, hit: Boolean(found) }, "getProductById");
  return found;
}

export const searchProductsArgsSchema = z.object({
  query: z.string().optional()
    .describe("A keyword or phrase to search for in product names, descriptions, categories, features, and use cases."),
});

export function searchProducts(args: z.infer<typeof searchProductsArgsSchema>): Product[] {
  const q = args.query?.toLowerCase().trim() ?? "";
  if (!q) return listProducts();
  const results = listProducts().filter((p) => {
    const haystack = [
      p.name,
      p.id,
      p.shortDescription,
      p.overview ?? "",
      p.category,
      ...(p.keyFeatures ?? []),
      ...(p.advancedFeatures ?? []),
      ...(p.useCases ?? []),
      ...(p.targetCustomers ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  log.debug({ query: q, hits: results.length }, "searchProducts");
  return results;
}

export const filterByCategoryArgsSchema = z.object({
  category: z.string().describe("Category keyword, e.g. 'Fleet'."),
});

export function filterByCategory(args: z.infer<typeof filterByCategoryArgsSchema>): Product[] {
  const c = args.category.toLowerCase().trim();
  const results = listProducts().filter((p) => p.category.toLowerCase().includes(c));
  log.debug({ category: c, hits: results.length }, "filterByCategory");
  return results;
}

export function listCategories(): string[] {
  return Array.from(new Set(listProducts().map((p) => p.category))).sort();
}
