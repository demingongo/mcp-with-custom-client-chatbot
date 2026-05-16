import { OIDCClientCredentialsFlowBuilder } from "@saurbit/oauth2";
import { VALID_CLIENTS } from "../data/users";
import { jwksAuthority } from "./jwks";
import { log } from "../services/log-service";

export const flow = new OIDCClientCredentialsFlowBuilder({
  securitySchemeName: "clientCredentials",
})
  .setScopes({
    "mcp:tools": "Access to MCP-specific tools and functionalities.",
  })
  .setDescription("Client Credentials flow for machine-to-machine authentication.")
  .clientSecretBasicAuthenticationMethod()
  .setAccessTokenLifetime(300) // 5 minutes
  .setOpenIdConfiguration({
    claims_supported: ["sub", "aud", "iss", "exp", "iat", "nbf"],
  })
  .getClient((tokenRequest) => {
    const client = VALID_CLIENTS.find(c =>
      c.client_id === tokenRequest.clientId &&
      c.client_secret === tokenRequest.clientSecret &&
      c.internal
    );
    if (!client) {
      return undefined;
    }
    return {
      id: client.client_id,
      grants: ["client_credentials"],
      scopes: client.allowed_scopes,
      redirectUris: [],
    };
  })
  .generateAccessToken(async (grantContext) => {
    const registeredClaims = {
      exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      iss: grantContext.origin,
      aud: grantContext.client.id,
      jti: crypto.randomUUID(),
      sub: grantContext.client.id,
    };

    const { token: accessToken } = await jwksAuthority.sign({
      scope: grantContext.scope.join(" "),
      ...registeredClaims,
    });
    return { accessToken };
  })
  .verifyToken(async (_, { token }) => {
    try {
      const payload = await jwksAuthority.verify(token);
      if (payload && typeof payload.scope === "string") {
        const client = VALID_CLIENTS.find(
          (c) => c.client_id === payload.sub
        );
        if (client) {
          return {
            isValid: true,
            credentials: {
              app: {
                id: client.client_id
              },
              scope: payload.scope.split(" "),
            },
          };
        }
      }
    } catch (error) {
      log.error({
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      }, "Token verification error:");
    }
    return { isValid: false };
  })
  .build();