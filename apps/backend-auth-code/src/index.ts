import { app } from "./apps/http-app";
import { chatConfigRoute, chatRoute } from "./routes/chat";
import { loginRoute, callbackRoute } from "./routes/auth";
import { log } from "./services/log-service";

app.route(loginRoute)
    .route(callbackRoute)
    .route(chatConfigRoute)
    .route(chatRoute);

// start the server
await app.listen();

// log server info
const BASE_URI = process.env.EXTERNAL_URI || app.base().info.uri;

log.info(`Server running on ${BASE_URI}`);
log.info(`Scalar UI on ${BASE_URI}/scalar`);
log.info(`OpenAPI specification on ${BASE_URI}/docs/api/schema`);
log.info(`Postman collection on ${BASE_URI}/docs/api/schema?format=postman`);