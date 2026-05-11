import { APP_DESCRIPTION, APP_NAME, APP_VERSION, EXTERNAL_URI, PORT, SERVER_BIND_ADDRESS } from "../config/app";
import { LOG_LEVEL } from "../config/log";
//import { badRequestResponse } from "../utils/responses";
//import { errorSchema } from "../utils/schemas";
import inert from "@hapi/inert";
import {
  //groupResponses, 
  Kaapi
} from "@kaapi/kaapi";
import { validatorZod } from "@kaapi/validator-zod";
import Boom from "@hapi/boom";

const LOCAL_BIND_ADDRESSES = new Set(["127.0.0.1", "localhost"]);
const isLocalBind = LOCAL_BIND_ADDRESSES.has(SERVER_BIND_ADDRESS);

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
      additionalHeaders: ["Mcp-Session-Id", "Last-Event-ID"],
      additionalExposedHeaders: ["Mcp-Session-Id"],
      preflightStatusCode: 204,
    },
  },

  // DocsConfig
  docs: {
    disabled: false,
    path: "/docs/api",
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
    tags: [
      {
        name: "Products",
        description: "Endpoints related to ConnectAuz product information.",
        externalDocs: {
          url: "https://github.com/demingongo/mcp-with-custom-client-chatbot",
          description: `See Github repo for source code and documentation.`,
        },
      },
    ],
  },
});

await app.extend(validatorZod);
await app.extend({
  async integrate(t) {
    await t.server.register(inert);
  },
});

// DNS rebinding protection — only active when bound to localhost.
// Rejects browser-originated requests whose Origin is not a localhost URL,
// preventing remote websites from reaching a locally-running server via DNS rebinding.
if (isLocalBind) {
  app.base().ext("onPreAuth", (request, h) => {
    const origin = request.headers['origin'];
    // Non-browser clients (curl, MCP clients) do not send an Origin header — allow them.
    // Browser requests must originate from a localhost origin.
    if (typeof origin !== "undefined") {
      const isLocalOrigin = origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
        Array.isArray(origin) ? origin[0] : origin
      );

      if (!isLocalOrigin) {
        // This immediately stops the request and returns a 403
        throw Boom.forbidden('Forbidden: cross-origin request rejected');
      }
    }
    return h.continue;
  });
}
