import { OIDCAuthorizationCodeFlowBuilder } from "@saurbit/oauth2";
import { REGISTERED_USERS, VALID_CLIENTS } from "../data/users";
import { log } from "../services/log-service";
import { jwksAuthority } from "./jwks";

const codeStorage: Record<
  string,
  {
    clientId: string;
    scope: string[];
    userId: string;
    expiresAt: number;
    codeChallenge?: string;
    nonce?: string;
  }
> = {};

export const flow = new OIDCAuthorizationCodeFlowBuilder({
  securitySchemeName: "oidc-auth-code",
})
  .setScopes({
    openid: "OpenID Connect scope",
    offline_access: "Request refresh token for offline access",
    profile: "Access to basic profile information such as name and picture.",
    email: "Access to the user's email address and its verification status.",
    read: "Grants read-only access to protected resources",
    write: "Grants write access to protected resources",
    "mcp:tools": "Access to MCP-specific tools and functionalities.",
  })
  .setDescription("Example OpenID Connect Authorization Code Flow")
  .setAuthorizationEndpoint("/oauth2/v1.0/authorize")
  .noneAuthenticationMethod()
  .setAccessTokenLifetime(3600)
  .setOpenIdConfiguration({
    claims_supported: ["sub", "aud", "iss", "exp", "iat", "nbf", "name", "email", "username"],
  })
  .getClientForAuthentication((data) => {

    const client = VALID_CLIENTS.find((c) => c.client_id === data.clientId && !c.internal);
    if (!client) return undefined;

    // filter client's allowed scoped
    const requestedScopes = data.scope ? data.scope : [];
    const grantedScopes = requestedScopes.length
      ? requestedScopes.filter((s) => client.allowed_scopes.includes(s))
      : client.allowed_scopes;
    if (grantedScopes.length === 0) return undefined;


    return {
      id: client.client_id,
      grants: client.meta && "grant_types" in client.meta ? (client.meta.grant_types as string[]) : ["authorization_code"],
      redirectUris: client.meta && "redirect_uris" in client.meta ? (client.meta.redirect_uris as string[]) : [],
      scopes: client.allowed_scopes,
    };
  })
  .getUserForAuthentication((_ctxt, parsedData) => {
    const user = REGISTERED_USERS.find(
      (u) => u.username === parsedData.username && u.password === parsedData.password
    );
    if (!user) return undefined;
    return {
      type: "authenticated",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    };
  })
  .generateAuthorizationCode((grantContext, user) => {
    if (!user.id) {
      return undefined;
    }
    const code = crypto.randomUUID();
    codeStorage[code] = {
      clientId: grantContext.client.id,
      scope: grantContext.scope,
      userId: `${user.id}`,
      expiresAt: Date.now() + 60000,
      codeChallenge: grantContext.codeChallenge,
      nonce: grantContext.nonce,
    };
    return { type: "code", code };
  })
  .getClient(async (tokenRequest) => {
    const client = VALID_CLIENTS.find((c) => c.client_id === tokenRequest.clientId && !c.internal);
    if (!client) return undefined;
    if (
      tokenRequest.grantType === "authorization_code" &&
      tokenRequest.code
    ) {
      const codeData = codeStorage[tokenRequest.code];
      if (!codeData) return undefined;
      if (codeData.clientId !== tokenRequest.clientId) return undefined;
      if (codeData.expiresAt < Date.now()) {
        delete codeStorage[tokenRequest.code];
        return undefined;
      }

      if (tokenRequest.codeVerifier && codeData.codeChallenge) {
        // Public client — verify PKCE code_verifier against the stored code_challenge
        const data = new TextEncoder().encode(tokenRequest.codeVerifier);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = new Uint8Array(hashBuffer);
        const base64url = btoa(String.fromCharCode(...hashArray))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        if (base64url !== codeData.codeChallenge) return undefined;
      } else {
        return undefined;
      }

      const user = REGISTERED_USERS.find(
        (u) => u.id === codeData.userId
      );
      if (!user) return undefined;

      return {
        id: client.client_id,
        grants: client.meta && "grant_types" in client.meta ? (client.meta.grant_types as string[]) : ["authorization_code"],
        redirectUris: client.meta && "redirect_uris" in client.meta ? (client.meta.redirect_uris as string[]) : [],
        scopes: client.allowed_scopes,
        metadata: {
          accessScope: codeData.scope,
          userId: codeData.userId,
          username: user.username,
          userEmail: user.email,
          nonce: codeData.nonce,
        },
      };
    }
    return undefined;
  })
  .generateAccessToken(async (grantContext) => {
    const accessScope = Array.isArray(grantContext.client.metadata?.accessScope)
      ? grantContext.client.metadata.accessScope
      : [];

    const registeredClaims = {
      exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      iss: grantContext.origin,
      aud: grantContext.client.id,
      jti: crypto.randomUUID(),
      sub: `${grantContext.client.metadata?.userId}`,
    };

    const { token: accessToken } = await jwksAuthority.sign({
      scope: accessScope.join(" "),
      ...registeredClaims,
    });

    const { token: idToken } = await jwksAuthority.sign({
      username: `${grantContext.client.metadata?.username}`,
      name: accessScope.includes("profile")
        ? `${grantContext.client.metadata?.userFullName}`
        : undefined,
      email: accessScope.includes("email")
        ? `${grantContext.client.metadata?.userEmail}`
        : undefined,
      nonce: grantContext.client.metadata?.nonce
        ? `${grantContext.client.metadata?.nonce}`
        : undefined,
      ...registeredClaims,
    });

    return {
      accessToken,
      scope: accessScope,
      idToken,
    };
  })
  .verifyToken(async (_req, { token }) => {
    try {
      const payload = await jwksAuthority.verify(token);
      if (payload && typeof payload.scope === "string") {
        const user = REGISTERED_USERS.find(
          (u) => u.id === payload.sub
        );
        if (user) {
          return {
            isValid: true,
            credentials: {
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
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