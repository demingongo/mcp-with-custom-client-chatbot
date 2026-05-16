import { app } from "./apps/http-app";
import { oauthAuthorizationServerRoute, oauthRegistrationRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { jwksRotator } from "./security/jwks";
import { multipleFlows } from "./security/multiple-flows";
import { log } from "./services/log-service";

app
  // health check endpoint
  .route(healthRoute)

  // auth endpoint
  .route(oauthAuthorizationServerRoute)
  .route(oauthRegistrationRoute);

// start the server
await app.listen();

// Generate keys at launch
await jwksRotator.checkAndRotateKeys();
// Key rotation check every hour (rotation happens according to jwksRotatorOptions.intervalMs)
setInterval(async () => {
  await jwksRotator.checkAndRotateKeys();
}, 3.6e6); // 1h

// log server info
const BASE_URI = process.env.EXTERNAL_URI || app.base().info.uri;

log.info(`Server running on ${BASE_URI}`);
log.info(`OpenID Connect configuration available at ${BASE_URI}${multipleFlows.getDiscoveryUrl()}`);
