import {
  filterByCategory,
  getProductById,
  listCategories,
  loadCatalog,
  searchProducts,
} from "../services/product-service";
import { badRequestResponse } from "../utils/responses";
import { groupResponses, MediaTypeModifier, ResponseDocsModifier, SchemaModel, applyModifiers } from "@kaapi/kaapi";
import { withSchema } from "@kaapi/validator-zod";
import { z } from "zod/v4";

// --- List all products with basic info ---

const listProductsResponseSchema = z.object({
  ok: z.literal(true),
  source: z.string(),
  lastUpdated: z.string(),
  count: z.number(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      category: z.string(),
      shortDescription: z.string(),
    })
  ),
});

type ListProductsResponseType = z.infer<typeof listProductsResponseSchema>;

export const listProductsRoute = applyModifiers(
  {
    handler: async () => {
      const catalog = loadCatalog();
      const response: ListProductsResponseType = {
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
      };
      return response;
    },
    method: "get",
    path: "/api/products",
    options: {
      description: "List all ConnectAuz products with id, name, URL, and short description.",
      tags: ["Products"],
      id: "list_products",
    },
  },
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: listProductsResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(200)
    ),
  }
);

// --- List all product categories ---

const listCategoriesResponseSchema = z.object({
  ok: z.literal(true),
  categories: z.array(z.string()),
});

export const listCategoriesRoute = applyModifiers(
  {
    handler: async () => ({ ok: true, categories: listCategories() }),
    method: "get",
    path: "/api/products/categories",
    options: {
      description: "List the distinct product categories / industries served.",
      tags: ["Products"],
      id: "list_categories",
    },
  },
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: listCategoriesResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(200)
    ),
  }
);

// --- Search products by keyword across multiple fields ---

const searchQuerySchema = z.object({
  q: z.string().trim().max(100).meta({ description: "Search keywords." }).optional(),
});

const searchProductsResponseSchema = z.object({
  ok: z.literal(true),
  query: z.string(),
  count: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      category: z.string(),
      shortDescription: z.string(),
    })
  ),
});

type SearchProductsResponseType = z.infer<typeof searchProductsResponseSchema>;

export const searchProductsRoute = applyModifiers(
  withSchema({ query: searchQuerySchema }).route({
    handler: async ({ query }) => {
      const q = query.q ?? "";
      const results = searchProducts(q);
      const response: SearchProductsResponseType = {
        ok: true,
        query: q,
        count: results.length,
        results: results.map((p) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          category: p.category,
          shortDescription: p.shortDescription,
        })),
      };
      return response;
    },
    method: "get",
    path: "/api/products/search",
    options: {
      description: "Free-text search across product names, descriptions, features, and use cases.",
      tags: ["Products"],
      id: "search_products",
    },
  }),
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: searchProductsResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(200)
    ),
  }
);

// --- Get products by category (substring match) ---

const productsByCategoryParamsSchema = z.object({
  category: z.string().trim().min(2).max(50).toLowerCase().meta({
    description: "Category keyword, e.g. 'Fleet'.",
  }),
});

const productsByCategoryResponseSchema = z.object({
  ok: z.literal(true),
  category: z.string(),
  count: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      category: z.string(),
      shortDescription: z.string(),
    })
  ),
});

type ProductsByCategoryResponseType = z.infer<typeof productsByCategoryResponseSchema>;

export const productsByCategoryRoute = applyModifiers(
  withSchema({ params: productsByCategoryParamsSchema }).route({
    handler: async ({ params }) => {
      const results = filterByCategory(params.category);
      const response: ProductsByCategoryResponseType = {
        ok: true,
        category: params.category,
        count: results.length,
        results,
      };
      return response;
    },
    method: "get",
    path: "/api/products/category/{category}",
    options: {
      description: "List products that belong to a category (substring match).",
      tags: ["Products"],
      id: "products_by_category",
    },
  }),
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: productsByCategoryResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(200),
      badRequestResponse.withContext().setCode(400)
    ),
  }
);

// --- Get product by ID or name ---

const idParamsSchema = z.object({
  id: z.string().trim().min(1).max(100).meta({ description: "Product id (e.g. 'ca-fleet') or product name." }),
});

const getProductResponseSchema = z.object({
  ok: z.boolean(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    shortDescription: z.string(),
    overview: z.string().optional(),
    category: z.string(),
    targetCustomers: z.array(z.string()).optional(),
    businessProblem: z.string().optional(),
    keyFeatures: z.array(z.string()),
    advancedFeatures: z.array(z.string()).optional(),
    technologyScope: z.array(z.string()).optional(),
    platformsSupported: z.array(z.string()).optional(),
    integrations: z.array(z.string()).optional(),
    complianceStandards: z.array(z.string()).optional(),
    businessBenefits: z.array(z.string()).optional(),
    useCases: z.array(z.string()).optional(),
    deploymentType: z.array(z.enum(["Cloud", "Web", "Mobile", "On-Premise"])).optional(),
  }),
});

const getProductErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

type GetProductResponseType = z.infer<typeof getProductResponseSchema>;
type GetProductErrorResponseType = z.infer<typeof getProductErrorResponseSchema>;

export const getProductRoute = applyModifiers(
  withSchema({ params: idParamsSchema }).route({
    handler: async ({ params }, h) => {
      const product = getProductById(params.id);
      if (!product) {
        const response: GetProductErrorResponseType = {
          ok: false,
          error: `Product '${params.id}' not found`,
        };
        return h.response(response).code(404);
      }
      const response: GetProductResponseType = {
        ok: true,
        product,
      };
      return response;
    },
    method: "get",
    path: "/api/products/{id}",
    options: {
      description: "Get full details for a single product by id or name.",
      tags: ["Products"],
      id: "get_product",
    },
  }),
  {
    responses: groupResponses(
      new ResponseDocsModifier()
        .setDescription("Success")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: getProductResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(200),
      badRequestResponse.withContext().setCode(400),
      new ResponseDocsModifier()
        .setDescription("Product not found")
        .addMediaType(
          "application/json",
          new MediaTypeModifier({
            schema: getProductErrorResponseSchema.toJSONSchema() as SchemaModel,
          })
        )
        .setCode(404)
    ),
  }
);
