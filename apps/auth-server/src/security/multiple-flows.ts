import { flow as authCodeFlow } from "./authorization-code";
import { flow as clientCredentialsFlow } from "./client-credentials";
import { OIDCMultipleFlows } from "@saurbit/oauth2";

const flows = [authCodeFlow, clientCredentialsFlow];

export const multipleFlows = new OIDCMultipleFlows({
  flows: flows,
  discoveryUrl: "/.well-known/openid-configuration",
  securitySchemeName: "OpenID Connect",
  tokenEndpoint: "/oauth2/v1.0/token",
  jwksEndpoint: "/.well-known/jwks.json",
  description: "OpenID Connect implementation with Saurbit OAuth2 library, supporting multiple flows.",
  openidConfiguration: {
    registration_endpoint: "/oauth2/v1.0/registration", // activates dynamic client registration endpoint
  },
});
