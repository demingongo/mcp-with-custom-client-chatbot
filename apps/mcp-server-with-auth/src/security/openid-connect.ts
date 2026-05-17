import { OIDC_ISSUER_URL, OIDC_JWKS_URL } from "../config/app";
import { log } from "../services/log-service";
import { APIKeyAuthDesign } from "@kaapi/kaapi";
import { ApiKeyUtil, SecuritySchemeObject } from "@novice1/api-doc-generator";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export class RemoteOpenIDConnectDocs extends ApiKeyUtil {
  toOpenAPI(): Record<string, SecuritySchemeObject> {
    return {
      [this.getSecuritySchemeName()]: {
        type: "openIdConnect",
        description: "Authenticate using an OpenID Connect provider",
        openIdConnectUrl: `${OIDC_ISSUER_URL}/.well-known/openid-configuration`,
      },
    };
  }
}

export class RemoteOpenIDConnect extends APIKeyAuthDesign {
  docs() {
    return new RemoteOpenIDConnectDocs("OpenID Connect");
  }
}

export const openidConnectDesign = new RemoteOpenIDConnect({
  strategyName: "remote-openid-connect",
  key: "Authorization",
  auth: {
    headerTokenType: "Bearer",
    validate: async (_, token) => {
      // For demonstration purposes, we accept any non-empty token as valid.
      // In a real implementation, you would validate the token against the OpenID Connect provider's introspection endpoint or by verifying the JWT signature and claims.
      try {
        if (token) {
          const client = jwksClient({
            jwksUri: `${OIDC_JWKS_URL}`,
            timeout: 10000, // 10s
          });

          // verify the token using the JWKS client (this is a simplified example, you should also check token expiration, audience, etc.)

          const decodedToken = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
          const kid = decodedToken.kid;
          const key = await client.getSigningKey(kid);
          const signingKey = key.getPublicKey();
          // Here you would verify the token signature using the signingKey and also validate claims like exp, aud, etc.
          const payload = jwt.verify(token, signingKey, { algorithms: ["RS256"] });

          if (payload && typeof payload === "object" && payload.sub && payload.aud) {
            return {
              isValid: true,
              credentials: {
                // if the sub claim is the same as the aud claim, we treat it as a machine-to-machine token and set the client id in the credentials.
                app: payload.sub === payload.aud ? { id: payload.aud } : undefined,
                // if the sub claim is different from the aud claim, we treat it as a user token and set the user info in the credentials.
                user:
                  payload.sub !== payload.aud
                    ? {
                        id: payload.sub,
                        username: payload.username || payload.email || payload.sub,
                        name: payload.name,
                        email: payload.email,
                      }
                    : undefined,
                scope: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
              },
            };
          }
        }
      } catch (error) {
        log.error({ error }, "Error validating OpenID Connect token");
      }
      return {
        isValid: false,
      };
    },
  },
});
