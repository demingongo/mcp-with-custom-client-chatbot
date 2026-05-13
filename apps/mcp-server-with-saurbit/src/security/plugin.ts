
import { multipleFlows } from "./multiple-flows";
import { AccessDeniedError, OIDCMultipleFlows, UnauthorizedClientError, UnsupportedGrantTypeError } from "@saurbit/oauth2";
import { flow as authCodeFlow } from "./authorization-code";
import { AuthDesign, KaapiTools, Request as KaapiRequest, ReqRef, ReqRefDefaults } from "@kaapi/kaapi";
import Boom from "@hapi/boom";
import { jwksAuthority } from "./jwks";
import { withSchema } from "@kaapi/validator-zod";
import { z } from "zod";
import { OAuth2Util, SecuritySchemeObject } from '@novice1/api-doc-generator';
import { log } from "../services/log-service";

//#region Utility function to convert KaapiRequest to Web Standard Request

export function createWebStandardRequest<Refs extends ReqRef = ReqRefDefaults>(request: KaapiRequest<Refs>): Request {
  // Build the absolute URL required by the Request constructor
  const protocol = request.server.info.protocol;
  const host = request.info.host; // Reads the Host header
  const fullUrl = `${protocol}://${host}${request.url.pathname}${request.url.search}`;

  // Build the Web Standard Request options object
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  const requestOptions: {
    method: string;
    headers: Headers;
    body?: BodyInit | null | undefined;
  } = {
    method: request.method.toUpperCase(),
    headers: new Headers(headers), // Uses web-standard Headers API
  };

  // Attach the body if it is a mutation request
  if (['POST', 'PUT', 'PATCH'].includes(requestOptions.method)) {
    // Check if the content-type matches URL-encoded form data
    const isUrlEncoded = request.headers['content-type']?.includes('application/x-www-form-urlencoded');

    if (isUrlEncoded && request.payload) {
      // Convert Hapi's parsed key-value payload object into a standard URL search string
      const searchParams = new URLSearchParams();

      for (const [key, value] of Object.entries(request.payload)) {
        searchParams.append(key, value);
      }

      requestOptions.body = searchParams.toString();

      // Explicitly set the proper Web standard header value
      requestOptions.headers.set('content-type', 'application/x-www-form-urlencoded');
    } else {
      // If parsed JSON/object, stringify it; if buffer/stream, pass directly
      requestOptions.body = request.payload && typeof request.payload === 'object'
        ? JSON.stringify(request.payload)
        : request.payload;
    }
  }

  // Create the native Web Standard Request instance
  return new Request(fullUrl, requestOptions);
}

//#endregion

//#region Custom AuthDesign for Saurbit OAuth2 multiple flows integration with Kaapi

class CustomAuthUtil extends OAuth2Util {
  protected oidcMultipleFlows: OIDCMultipleFlows

  constructor(oidcMultipleFlows: OIDCMultipleFlows) {
    super(oidcMultipleFlows.getSecuritySchemeName());
    this.oidcMultipleFlows = oidcMultipleFlows
  }

  toOpenAPI(): Record<string, SecuritySchemeObject> {
    const issuer = this.getHost();
    const schemes = this.oidcMultipleFlows.toOpenAPISecurityScheme();

    for (const schemeName in schemes) {
      schemes[schemeName].openIdConnectUrl = `${issuer}${schemes[schemeName].openIdConnectUrl}`;
    }
    return schemes;
  }
}

export class CustomAuthDesign extends AuthDesign {
  docs() {
    return new CustomAuthUtil(multipleFlows);
  }

  getStrategyName() {
    return multipleFlows.getSecuritySchemeName()
  }

  async integrateStrategy(t: KaapiTools) {
    // Register the auth scheme for the multiple flows
    t.scheme(this.getStrategyName(), (_server) => {
      return {
        async authenticate(request, h) {
          try {
            const webStandardRequest = createWebStandardRequest(request);
            const result = await multipleFlows.verifyToken(webStandardRequest);
            if (result.success) {
              return h.authenticated({ credentials: result.credentials });
            }
            return h.unauthenticated(
              Boom.unauthorized(result.error.message, "Bearer"),
              {
                credentials: {}
              }
            );
          } catch (err) {
            return Boom.internal(err instanceof Error ? err : `${err}`);
          }
        }
      }
    });
    t.strategy(this.getStrategyName(), this.getStrategyName());
  }

  async integrateHook(t: KaapiTools) {
    // Register the multiple flows with Kaapi's OpenAPI and Postman generators
    const securityScheme = new CustomAuthUtil(multipleFlows);
    if (securityScheme instanceof OAuth2Util && !securityScheme.getHost() && t.postman?.getHost().length) {
      securityScheme.setHost(t.postman.getHostValue());
    }
    t.openapi
      ?.addSecuritySchemeAliases(securityScheme)
      .setDefaultSecurity(securityScheme);
    t.postman?.setDefaultSecurity(securityScheme);

    // Register the discovery endpoint for the multiple flows
    t.route({
      method: "GET",
      path: multipleFlows.getDiscoveryUrl(),
      options: {
        plugins: {
          kaapi: {
            docs: false
          }
        }
      },
      handler: async (request) => multipleFlows.getDiscoveryConfiguration(createWebStandardRequest(request)),
    });

    // Register the JWKS endpoint for the multiple flows
    t.route({
      method: "GET",
      path: multipleFlows.getJwksEndpoint(),
      options: {
        plugins: {
          kaapi: {
            docs: false
          }
        }
      },
      handler: async () => await jwksAuthority.getJwksEndpointResponse(),
    });

    // Register authorization page for authorization code flow
    t.route({
      method: "GET",
      path: authCodeFlow.getAuthorizationEndpoint(),
      options: {
        plugins: {
          kaapi: {
            docs: false
          }
        }
      },
      handler: async (request, h) => {
        const result = await authCodeFlow.initiateAuthorization(createWebStandardRequest(request));
        if (result.success) {
          return h.view("login", { errorMessage: null }).code(200);
        }
        return h.response({ error: "invalid_request" }).code(400);
      }
    });

    // Register authorization page handler for authorization code flow
    t.route(withSchema({
      payload: z.object({
        username: z.string(),
        password: z.string(),
      }),
      failAction: async (_, h) => {
        return h.view("login", { errorMessage: "Bad request" }).code(400).takeover();
      }
    }).route({
      method: "POST",
      path: authCodeFlow.getAuthorizationEndpoint(),
      options: {
        plugins: {
          kaapi: {
            docs: false
          }
        }
      },
      handler: async (request, h) => {
        try {
          const result = await authCodeFlow.processAuthorization(createWebStandardRequest(request), request.payload);

          if (result.type === "error") {
            const error = result.error;
            if (result.redirectable) {
              const qs = [
                `error=${encodeURIComponent(error instanceof AccessDeniedError ? error.errorCode : "invalid_request")}`,
                `error_description=${encodeURIComponent(
                  error instanceof AccessDeniedError ? error.message : "Invalid request"
                )}`,
                result.state ? `state=${encodeURIComponent(result.state)}` : null,
              ]
                .filter(Boolean)
                .join("&");
              return h.redirect(`${result.redirectUri}?${qs}`);
            }
            return h.view("login", { errorMessage: error.message }).code(400);
          }

          if (result.type === "code") {
            const {
              code,
              context: { state, redirectUri },
            } = result.authorizationCodeResponse;
            const searchParams = new URLSearchParams();
            searchParams.set("code", code);
            if (state) searchParams.set("state", state);
            return h.redirect(`${redirectUri}?${searchParams.toString()}`);
          }

          if (result.type === "unauthenticated") {
            return h.view("login", { errorMessage: result.message || "Authentication failed. Please try again." }).code(400);
          }
        } catch (error) {
          log.error({
            error: error instanceof Error ? { name: error.name, message: error.message } : error,
          }, "Unexpected error at authorization endpoint:");
          return h.view("login", { errorMessage: "An unexpected error occurred. Please try again later." }).code(500);
        }
        return h.view("login", { errorMessage: "Could not process the request. Please try again." }).code(400);
      }
    }));

    // Register the token endpoint for the multiple flows
    t.route({
      method: "POST",
      path: multipleFlows.getTokenEndpoint(),
      options: {
        plugins: {
          kaapi: {
            docs: false
          }
        }
      },
      handler: async (request, h) => {
        const result = await multipleFlows.token(createWebStandardRequest(request));
        if (result.success) {
          return result.tokenResponse;
        }
        const error = result.error;
        log.error({ error }, "Error")
        if (error instanceof UnsupportedGrantTypeError || error instanceof UnauthorizedClientError) {
          return h.response({ error: error.errorCode, errorDescription: error.message }).code(400);
        }
        return h.response({ error: "invalid_request" }).code(400);
      }
    });

  }
}

//#endregion

export const multipleFlowsPlugin = new CustomAuthDesign()