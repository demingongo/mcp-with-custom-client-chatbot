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
import oidcAuthFlows from "../security/oidc-multiple-flows";
import { log } from "../services/log-service";
import Boom from "@hapi/boom";
import inert from "@hapi/inert";
import Vision from "@hapi/vision";
import { Kaapi } from "@kaapi/kaapi";
import { validatorZod } from "@kaapi/validator-zod";
import hapiScalar from "hapi-scalar";
import path from "path";
import Pug from "pug";

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
    cors: {
      origin: ["*"],
      additionalHeaders: ["Mcp-Session-Id", "Last-Event-ID", "Mcp-Protocol-Version"],
      additionalExposedHeaders: ["Mcp-Session-Id"],
      preflightStatusCode: 204,
    },
  },

  // DocsConfig
  docs: {
    disabled: false,
    path: DOC_PATH,
    title: APP_NAME,
    license: {
      name: "",
    },
    version: APP_VERSION,
    ui: {
      swagger: {
        customCssUrl: "/public/swagger-ui.css",
        customJsStr: `
                setTimeout(() => {
                if (document.documentElement.classList.contains("dark-mode")) { document.documentElement.classList.remove("dark-mode"); }
                }, 10);
                `,
        customSiteTitle: `${APP_NAME}`,
      },
    },

    // explicitly set host external url for production
    // optional for localhost as it is already defined at Hapi's ServerOptions
    host: {
      url: EXTERNAL_URI,
      description: APP_DESCRIPTION,
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

//#region Security on localhost binding

const LOCAL_BIND_ADDRESSES = new Set(["127.0.0.1", "localhost"]);
const isLocalBind = LOCAL_BIND_ADDRESSES.has(SERVER_BIND_ADDRESS);

// DNS rebinding protection — only active when bound to localhost.
// Rejects browser-originated requests whose Origin is not a localhost URL,
// preventing remote websites from reaching a locally-running server via DNS rebinding.
if (isLocalBind) {
  app.base().ext("onPreAuth", (request, h) => {
    const origin = request.headers["origin"];
    // Non-browser clients (curl, MCP clients) do not send an Origin header — allow them.
    // Browser requests must originate from a localhost origin.
    if (typeof origin !== "undefined") {
      const isLocalOrigin =
        origin === "null" ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(Array.isArray(origin) ? origin[0] : origin);

      if (!isLocalOrigin) {
        // This immediately stops the request and returns a 403
        throw Boom.forbidden("Forbidden: cross-origin request rejected");
      }
    }
    return h.continue;
  });
}

//#endregion

//#region Extend server with plugins

await app.extend([
  // to use zod validation
  validatorZod,
  // to serve static files
  {
    async integrate(t) {
      await t.server.register(inert);
    },
  },
  // to serve Scalar UI for API docs
  {
    async integrate(t) {
      await t.server.register({
        plugin: hapiScalar,
        options: {
          routePrefix: "/scalar",
          scalarConfig: {
            url: `${DOC_PATH}/schema`,
            theme: "mars",
            pageTitle: `${APP_NAME}`,
            showDeveloperTools: "never",
            darkMode: false,
          },
        },
      });
    },
  },
  // to use OIDC authentication flows
  oidcAuthFlows,
  // to use Vision for rendering views
  {
    async integrate(t) {
      await t.server.register(Vision);

      t.server.views({
        engines: { pug: Pug },
        relativeTo: process.cwd(),
        path: "views",
        compileOptions: {
          basedir: path.join(process.cwd(), "views"),
        },
      });
    },
  },
]);

//#endregion

//#region Log server events

app.base().ext("onRequest", (request, h) => {
  log.debug({ payload: request.payload }, `Incoming request: ${request.method.toUpperCase()} ${request.path}`);
  return h.continue;
});

app.base().ext("onPreResponse", (request, h) => {
  const response = request.response;
  if ("isBoom" in response && response.isBoom) {
    log.error({ error: response }, `Error response for ${request.method.toUpperCase()} ${request.path}`);
    if (request.path === "/mcp" && response.output.statusCode === 401) {
      // customize 401 response for the MCP endpoint to include WWW-Authenticate header with resource metadata link
      response.output.headers["WWW-Authenticate"] =
        `Bearer realm="mcp", resource_metadata="${EXTERNAL_URI}/.well-known/oauth-protected-resource"`;
    }
  } else {
    log.debug(
      { statusCode: "statusCode" in response && response.statusCode },
      `Response for ${request.method.toUpperCase()} ${request.path}`
    );
  }
  return h.continue;
});

//#endregion
