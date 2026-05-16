import { app } from "./apps/http-app";
import { oauthProtectedResourceRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { mcpDeleteRoute, mcpGetRoute, mcpPostRoute } from "./routes/mcp";
import { log } from "./services/log-service";

app
  // health check endpoint
  .route(healthRoute)

  // MCP endpoint
  .route(mcpPostRoute)
  .route(mcpGetRoute)
  .route(mcpDeleteRoute)

  // auth endpoint
  .route(oauthProtectedResourceRoute);

// start the server
await app.listen();

// log server info
const BASE_URI = process.env.EXTERNAL_URI || app.base().info.uri;

log.info(`Server running on ${BASE_URI}`);
log.info(`Scalar UI on ${BASE_URI}/scalar`);
log.info(`Swagger UI on ${BASE_URI}/docs/api`);
log.info(`OpenAPI specification on ${BASE_URI}/docs/api/schema`);
log.info(`Postman collection on ${BASE_URI}/docs/api/schema?format=postman`);
