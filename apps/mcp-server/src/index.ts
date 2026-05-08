import { app } from "./apps/http-app";
import { invokeRoute, toolsRoute, toolsV2Route } from "./routes/mcp";
import {
  listCategoriesRoute,
  listProductsRoute,
  searchProductsRoute,
  productsByCategoryRoute,
  getProductRoute,
} from "./routes/products";
import { publicFilesRoute } from "./routes/public";
import { log } from "./services/log-service";

app
  // public files
  .route(publicFilesRoute)

  // product routes
  .route(listProductsRoute)
  .route(getProductRoute)
  .route(searchProductsRoute)
  .route(listCategoriesRoute)
  .route(productsByCategoryRoute)

  // mcp routes
  .route(toolsRoute)
  .route(toolsV2Route)
  .route(invokeRoute);

// start the server
await app.listen();

// log server info
const BASE_URI = process.env.EXTERNAL_URI || app.base().info.uri;

log.info(`Server running on ${BASE_URI}\n`);
log.info(`Swagger UI on ${BASE_URI}/docs/api`);
log.info(`OpenAPI specification on ${BASE_URI}/docs/api/schema`);
log.info(`Postman collection on ${BASE_URI}/docs/api/schema?format=postman`);
