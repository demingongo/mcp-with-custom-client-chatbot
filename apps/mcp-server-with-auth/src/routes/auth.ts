import { OIDC_ISSUER_URL } from "../config/app";
import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";

export const oauthProtectedResourceRoute = applyModifiers(
  {
    method: "GET",
    path: "/.well-known/oauth-protected-resource",
    handler: ({ info, server }) => ({
      resource: `${server.info.protocol}://${info.host}/mcp`,
      authorization_servers: [OIDC_ISSUER_URL],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "offline_access", "mcp:tools"],
    }),
    options: {
      description: "OAuth protected resource endpoint",
      notes: [
        "This endpoint provides metadata about the protected resource and its authorization requirements.",
        "[Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728#name-protected-resource-metadata)",
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
