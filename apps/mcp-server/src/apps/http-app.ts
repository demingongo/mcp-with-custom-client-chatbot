import { APP_NAME, APP_VERSION, HOST, PORT } from "../config/app";
import { LOG_LEVEL } from "../config/log";
import { badRequestResponse } from "../utils/responses";
import { errorSchema } from "../utils/schemas";
import inert from "@hapi/inert";
import { groupResponses, Kaapi } from "@kaapi/kaapi";
import { validatorZod } from "@kaapi/validator-zod";

export const app = new Kaapi({
  // ServerOptions
  port: PORT,
  host: HOST,

  // internal logger options
  loggerOptions: {
    level: LOG_LEVEL,
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
        customSiteTitle: `${APP_NAME}`
      },
    },

    // explicitly set host external url for production
    // optional for localhost as it is already defined at Hapi's ServerOptions
    /*host: {
            url: '{baseUrl}',
            variables: {
                baseUrl: {
                    default: process.env.EXTERNAL_URI || `http://${HOST}:${PORT}`,
                    enum: [process.env.EXTERNAL_URI || `http://${HOST}:${PORT}`],
                },
            },
        },*/

    // (OpenAPI: register some schemas in components section)
    schemas: [errorSchema],

    // (OpenAPI: register some responses in components section)
    responses: groupResponses(badRequestResponse),

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
