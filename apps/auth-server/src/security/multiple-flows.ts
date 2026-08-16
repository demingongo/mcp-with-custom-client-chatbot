import { KaapiOIDCMultipleFlowsBuilder } from "@kaapi/oauth2-auth-design";
import { flow as authCodeFlow } from "./authorization-code";
import { flow as clientCredentialsFlow } from "./client-credentials";
import { jwksAuthority } from "./jwks";
import { EXTERNAL_URI } from "../config/app";

const flows = [authCodeFlow, clientCredentialsFlow];

export const multipleFlows = new KaapiOIDCMultipleFlowsBuilder()
  .setTokenEndpoint("/oauth2/v1.0/token")
  .setDiscoveryUrl("/.well-known/openid-configuration")
  .onDiscoveryRequest(async (request) => {
    return multipleFlows.kaapi().getDiscoveryConfiguration(request, {
      origin: EXTERNAL_URI, // Use the externally accessible URI for discovery to ensure correct endpoint URLs are provided to clients
    });
  })
  .setJwksEndpoint("/.well-known/jwks.json")
  .onJwksRequest(async () => {
    return await jwksAuthority.getJwksEndpointResponse();
  })
  .addFlows(flows)
  .setSecuritySchemeName("OpenID Connect")
  .setDescription("OpenID Connect implementation with Saurbit OAuth2 library, supporting multiple flows.")
  .setOpenidConfiguration({
    registration_endpoint: "/oauth2/v1.0/registration", // activates dynamic client registration endpoint
  })
  .build();
