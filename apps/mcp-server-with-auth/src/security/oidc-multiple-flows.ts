import { oidcAuthCodeBuilder } from "./oidc-auth-code";
import { createInMemoryKeyStore, MultipleFlowsBuilder } from "@kaapi/oauth2-auth-design";

const oidcAuthFlows = MultipleFlowsBuilder.create()
  .tokenEndpoint("/oauth2/v1.0/token")
  .jwksRoute((route) => route.setPath("/.well-known/jwks.json")) // activates jwks uri
  .setPublicKeyExpiry(86400) // 24h
  .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
  .setJwksRotatorOptions({
    intervalMs: 7.884e9, // 91 days
    timestampStore: createInMemoryKeyStore(),
  })
  .add(oidcAuthCodeBuilder)
  .additionalConfiguration({
    registration_endpoint: "/oauth2/v1.0/registration", // activates dynamic client registration endpoint
  })
  .build();

oidcAuthFlows.setSecuritySchemeName("OpenID Connect");

export default oidcAuthFlows;
