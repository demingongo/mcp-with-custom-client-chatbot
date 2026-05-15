import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION,
  DOC_PATH,
  EXTERNAL_URI,
  PORT,
  SERVER_BIND_ADDRESS,
} from "../config/app";
import { LOG_LEVEL } from "../config/log";
import { Kaapi } from "@kaapi/kaapi";
import { validatorArk } from "@kaapi/validator-arktype";
import hapiScalar from "hapi-scalar";
import { log } from "../services/log-service";
import { apiKeyAuthDesign } from "../security/api-key";

//#region Create and configure Kaapi app

export const app = new Kaapi({
  // ServerOptions
  port: PORT,
  host: SERVER_BIND_ADDRESS,

  // internal logger options
  loggerOptions: {
    level: LOG_LEVEL,
  },

  // CORS configuration for all routes
  routes: {
    cors: true,
  },

  // DocsConfig
  docs: {
    path: DOC_PATH,
    title: APP_NAME,
    license: {
      name: "",
    },
    version: APP_VERSION,

    host: {
      url: EXTERNAL_URI,
      description: APP_DESCRIPTION,
      variables: {}
    },

    // (OpenAPI: register some schemas in components section)
    //schemas: [errorSchema],

    // (OpenAPI: register some responses in components section)
    //responses: groupResponses(badRequestResponse),

    // more tags definition
    tags: [],
  },
});

//#endregion

//#region Extend server with plugins

await app.extend([
  // to validate request with Arktype schemas
  validatorArk,
  // to handle API key authentication
  apiKeyAuthDesign,
  // to serve Scalar UI for API docs
  {
    async integrate(t) {
      await t.server.register({
        plugin: hapiScalar,
        options: {
          routePrefix: "/scalar",
          scalarConfig: {
            url: `${DOC_PATH}/schema`,
            theme: "bluePlanet",
            pageTitle: `${APP_NAME}`,
            showDeveloperTools: "never",
            darkMode: false,
          },
        },
      });
    },
  },
]);

//#endregion

app.base().ext("onRequest", (request, h) => {
  log.debug({ payload: request.payload }, `Incoming request: ${request.method.toUpperCase()} ${request.path}`);
  return h.continue;
});