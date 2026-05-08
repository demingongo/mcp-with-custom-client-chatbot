import {
  filterByCategory,
  getProductById,
  listCategories,
  listProducts,
  loadCatalog,
  searchProducts,
} from "../services/productService";
import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const catalog = loadCatalog();
  res.json({
    ok: true,
    source: catalog.source,
    lastUpdated: catalog.lastUpdated,
    count: catalog.products.length,
    products: catalog.products.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      category: p.category,
      shortDescription: p.shortDescription,
    })),
  });
});

router.get("/categories", (_req: Request, res: Response) => {
  res.json({ ok: true, categories: listCategories() });
});

router.get("/search", (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined) ?? "";
  const results = searchProducts(q);
  res.json({ ok: true, query: q, count: results.length, results });
});

router.get("/category/:category", (req: Request, res: Response) => {
  const results = filterByCategory(req.params.category);
  res.json({
    ok: true,
    category: req.params.category,
    count: results.length,
    results,
  });
});

router.get("/:id", (req: Request, res: Response) => {
  const product = getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ ok: false, error: `Product '${req.params.id}' not found` });
  }
  res.json({ ok: true, product });
});

export default router;
export { listProducts };
