import { app } from "../apps/http-app";
import { Client, VALID_CLIENTS } from "../data/users";
import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";
import { withSchema } from "@kaapi/validator-zod";
import { z } from "zod";

export const oauthProtectedResourceRoute = applyModifiers(
  {
    method: "GET",
    path: "/.well-known/oauth-protected-resource",
    handler: ({ info, server }) => ({
      resource: `${server.info.protocol}://${info.host}/mcp`,
      authorization_servers: [`${server.info.protocol}://${info.host}`],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "offline_access", "mcp:tools"],
    }),
    options: {
      description: "OAuth protected resource endpoint",
      notes: [
        "This endpoint provides metadata about the protected resource and its authorization requirements.",
        "https://datatracker.ietf.org/doc/html/rfc9728#name-protected-resource-metadata",
      ],
      tags: ["OAuth"],
    },
  },
  {
    responses: groupResponses(
      new ResponseDocsModifier("OAuthProtectedResourceResponse")
        .setDescription("Response schema for OAuth protected resource endpoint")
        .addMediaType(
          "application/json",
          new MediaTypeModifier().setSchema({
            type: "object",
            properties: {
              resource: { type: "string", format: "uri" },
              authorization_servers: {
                type: "array",
                items: { type: "string", format: "uri" },
              },
              jwks_uri: { type: "string", format: "uri" },
              scopes_supported: {
                type: "array",
                items: { type: "string" },
              },
              bearer_methods_supported: {
                type: "array",
                items: { type: "string" },
                description: "Methods supported for bearer token transmission (e.g., header, query, body)",
              },
              resource_signing_alg_values_supported: {
                type: "array",
                items: { type: "string" },
              },
              resource_name: { type: "string" },
              resource_documentation: { type: "string", format: "uri" },
              resource_policy_uri: { type: "string", format: "uri" },
              resource_tos_uri: { type: "string", format: "uri" },
              tls_client_certificate_bound_access_tokens: { type: "boolean" },

              authorization_details_types_supported: {
                type: "array",
                items: { type: "string" },
              },
              dpop_signing_alg_values_supported: {
                type: "array",
                items: { type: "string" },
              },
              dpop_bound_access_tokens_required: { type: "boolean" },
            },
            required: ["resource"],
          })
        )
        .setCode(200)
    ),
  }
);

export const oauthAuthorizationServerRoute = applyModifiers(
  {
    method: "GET",
    path: "/.well-known/oauth-authorization-server",
    handler: async () =>
      (
        await app.base().inject({
          method: "GET",
          url: "/.well-known/openid-configuration",
        })
      ).result,
    options: {
      description: "OAuth authorization server endpoint",
      notes: [
        "This endpoint provides metadata about the authorization server and its requirements.",
        "The response is based on the OpenID Connect Discovery specification, as this server implements OIDC flows for authorization.",
        "https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata",
      ],
      tags: ["OAuth"],
    },
  },
  {}
);

export const oauthRegistrationRoute = applyModifiers(
  withSchema({
    payload: z
      .object({
        redirect_uris: z.array(z.url()).min(1),
        token_endpoint_auth_method: z.enum(["none"]).optional(), // only support public clients for now
        grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
        response_types: z.array(z.enum(["code"])).optional(),
        client_name: z.string().optional(),
        client_uri: z.url().optional(),
        logo_uri: z.url().optional(),
        scope: z.string().optional(),
        contacts: z.array(z.email()).optional(),
        tos_uri: z.url().optional(),

        policy_uri: z.url().optional(),
        jwks_uri: z.url().optional(),
        jwks: z
          .object({
            keys: z.array(z.looseObject({})),
          })
          .optional(),
        software_id: z.string().optional(),
        software_version: z.string().optional(),
      })
      .meta({
        description: "Client registration request schema",
        uri: "https://datatracker.ietf.org/doc/html/rfc7591#section-2",
      }),
  }).route({
    method: ["POST"],
    path: "/oauth2/v1.0/registration",
    handler: async (request) => {
      const payload = request.payload;
      const newClient: Client = {
        client_id: `client-${Date.now()}`,
        allowed_scopes: payload.scope ? payload.scope.split(/\s+/) : [],
        internal: false,
        meta: {
          ...payload,
        },
      };

      VALID_CLIENTS.push(newClient);

      return { ...newClient.meta, client_id: newClient.client_id };
    },
    options: {
      description: "OAuth client registration endpoint",
      notes: [
        "Dynamic Client Registration endpoint for registering new OAuth clients with the authorization server.",
        "https://datatracker.ietf.org/doc/html/rfc7591#section-3",
      ],
      tags: ["OAuth"],
    },
  }),
  {
    responses: groupResponses(
      new ResponseDocsModifier("ClientRegistrationResponse")
        .setDescription("Response schema for client registration endpoint")
        .addMediaType("application/json", {
          schema: {
            type: "object",
            properties: {
              client_id: { type: "string", description: "Client identifier issued by the authorization server" },
              client_secret: { type: "string", description: "Client secret issued by the authorization server" },
              client_id_issued_at: {
                type: "integer",
                description: "Timestamp of when the client ID was issued, in seconds since the epoch",
              },
              client_secret_expires_at: {
                type: "integer",
                description: "Timestamp of when the client secret will expire, in seconds since the epoch",
              },
              registration_access_token: {
                type: "string",
                description: "Access token for managing the registered client",
              },
              registration_client_uri: {
                type: "string",
                format: "uri",
                description: "URI for managing the registered client",
              },
              client_name: { type: "string", description: "Name of the client" },
              client_uri: { type: "string", format: "uri", description: "URI of the client" },
              logo_uri: { type: "string", format: "uri", description: "URI of the client's logo" },
              scope: { type: "string", description: "Scopes requested by the client" },
              token_endpoint_auth_method: {
                type: "string",
                description: "Authentication method used by the client at the token endpoint",
              },
              grant_types: {
                type: "array",
                items: { type: "string" },
              },
              response_types: {
                type: "array",
                items: { type: "string" },
              },
              contacts: {
                type: "array",
                items: { type: "string", format: "email" },
              },
              tos_uri: { type: "string", format: "uri", description: "URI of the client's terms of service" },
              policy_uri: { type: "string", format: "uri", description: "URI of the client's privacy policy" },
              jwks_uri: { type: "string", format: "uri", description: "URI of the client's JSON Web Key Set" },
              jwks: {
                type: "object",
                properties: {
                  keys: {
                    type: "array",
                    items: { type: "object" },
                  },
                },
                description: "JSON Web Key Set provided by the client (if jwks_uri is not provided)",
              },
              software_id: { type: "string", description: "Identifier for the client's software" },
              software_version: { type: "string", description: "Version of the client's software" },
            },
            required: ["client_id"],
          },
        })
    ),
  }
);
