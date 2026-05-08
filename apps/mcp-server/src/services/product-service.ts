import { Product, ProductCatalog } from "../types";
import { log } from "./log-service";
import fs from "fs";
import path from "path";

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

export function getProductById(id: string): Product | undefined {
  const needle = id.toLowerCase().trim();
  const found = listProducts().find((p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle);
  log.debug({ id, hit: Boolean(found) }, "getProductById");
  return found;
}

export function searchProducts(query: string): Product[] {
  const q = query.toLowerCase().trim();
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

export function filterByCategory(category: string): Product[] {
  const c = category.toLowerCase().trim();
  const results = listProducts().filter((p) => p.category.toLowerCase().includes(c));
  log.debug({ category: c, hits: results.length }, "filterByCategory");
  return results;
}

export function listCategories(): string[] {
  return Array.from(new Set(listProducts().map((p) => p.category))).sort();
}
