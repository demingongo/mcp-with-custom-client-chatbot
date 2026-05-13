import { REGISTERED_USERS, VALID_CLIENTS } from "../data/users";
import {
  OIDCAuthorizationCodeBuilder,
  createMatchAuthCodeResult,
  OAuth2TokenResponse,
  NoneAuthMethod,
  OAuth2ErrorCode,
  OAuth2ErrorBody,
} from "@kaapi/oauth2-auth-design";

// codes store
const authCodesStore: Map<
  string,
  { clientId: string; scopes: string[]; userId: string; codeChallenge?: string | undefined }
> = new Map();

// === OIDC Authorization Code Builder ===
export const oidcAuthCodeBuilder = OIDCAuthorizationCodeBuilder.create()
  // the name of the strategy
  .strategyName("oidc-auth-code")
  // access token ttl (used in generateToken controller)
  .setTokenTtl(3600)
  // activate auto parsing of access token (jwtAccessTokenPayload + createJwtAccessToken)
  .useAccessTokenJwks(true)

  // Client authentication methods
  .addClientAuthenticationMethod(new NoneAuthMethod())

  // Define scopes
  .setScopes({
    profile: "Access to basic profile information such as name and picture.",
    email: "Access to the user's email address and its verification status.",
    read: "Grants read-only access to protected resources",
    write: "Grants write access to protected resources",
    "mcp:tools": "Access to MCP-specific tools and functionalities.",
  })

  // Step 1: Authorization
  .authorizationRoute<object, { Payload: { username?: string; password?: string } }>((route) =>
    route
      .setPath("/oauth2/v1.0/authorize")
      .setUsernameField("username")
      .setPasswordField("password")
      // validate the authorization request and render the login form
      .validateGET(async ({ clientId, scope }, _, h) => {
        // client exists?
        const client = VALID_CLIENTS.find((c) => c.client_id === clientId && !c.internal);
        if (!client) return { error: "invalid_client" } as OAuth2ErrorBody;

        // filter client's allowed scoped
        const requestedScopes = (scope ?? "").split(/\s+/).filter(Boolean);
        const grantedScopes = requestedScopes.length
          ? requestedScopes.filter((s) => client.allowed_scopes.includes(s))
          : client.allowed_scopes;
        if (grantedScopes.length === 0) return { error: "invalid_client" } as OAuth2ErrorBody;

        return h.view("login", { errorMessage: null });
      })
      // error renderer for the authorization endpoint
      .setPOSTErrorRenderer(async ({ statusCode, error, errorMessage }, _params, _req, h) => {
        if (error && ["invalid_client"].includes(error)) {
          return { error, error_description: errorMessage } as OAuth2ErrorBody;
        }
        return h.view("login", { errorMessage }).code(statusCode);
      })
      // generate the authorization code after successful login
      .generateCode(async ({ clientId, codeChallenge, scope }, req, _h) => {
        // client exists?
        const client = VALID_CLIENTS.find((c) => c.client_id === clientId && !c.internal);
        if (!client) return null;

        // filter client's allowed scoped
        const requestedScopes = (scope ?? "").split(/\s+/).filter(Boolean);
        const grantedScopes = requestedScopes.length
          ? requestedScopes.filter((s) => client.allowed_scopes.includes(s))
          : client.allowed_scopes;
        if (grantedScopes.length === 0) return null;

        // user exists?
        const user = REGISTERED_USERS.find(
          (u) => u.username === req.payload.username && u.password === req.payload.password
        );
        if (!user) return null;

        // generate code
        const code = `auth-${Date.now()}`;
        authCodesStore.set(code, { clientId, scopes: grantedScopes, userId: user.id, codeChallenge });
        return { type: "code", value: code };
      })
      // handle the redirection
      .finalizeAuthorization(async (ctx, _params, _req, h) => {
        // redirect to callback url (could do something else depending on the code result)
        const matcher = createMatchAuthCodeResult({
          code: async () => h.redirect(ctx.fullRedirectUri),
          continue: async () => h.redirect(ctx.fullRedirectUri),
          deny: async () => h.redirect(ctx.fullRedirectUri),
        });
        return matcher(ctx.authorizationResult);
      })
  )

  // Step 2: Token exchange
  .tokenRoute((route) =>
    route.generateToken(
      async ({
        clientId,
        ttl,
        tokenType,
        code,
        clientSecret,
        codeVerifier,
        createJwtAccessToken,
        createIdToken,
        verifyCodeVerifier,
      }) => {
        const entry = authCodesStore.get(code);
        if (!entry || entry.clientId !== clientId) return null;

        const client = VALID_CLIENTS.find((c) => c.client_id === clientId && !c.internal);
        if (!client) {
          return {
            error: OAuth2ErrorCode.INVALID_CLIENT,
            error_description: "Client authentication failed.",
          };
        }

        if (entry.codeChallenge && codeVerifier) {
          if (!verifyCodeVerifier(codeVerifier, entry.codeChallenge)) {
            return {
              error: OAuth2ErrorCode.INVALID_GRANT,
              error_description: "Invalid authorization grant.",
            };
          }
        } else if (clientSecret) {
          if (client.client_secret !== clientSecret) {
            return {
              error: OAuth2ErrorCode.INVALID_CLIENT,
              error_description: "Client authentication failed.",
            };
          }
        } else {
          return {
            error: OAuth2ErrorCode.INVALID_REQUEST,
            error_description: "Missing or invalid request parameter.",
          };
        }

        const user = REGISTERED_USERS.find((u) => u.id === entry.userId);
        if (!user) {
          return {
            error: OAuth2ErrorCode.INVALID_GRANT,
            error_description: "Invalid authorization grant.",
          };
        }

        // Generate a signed JWT access token
        const { token: accessToken } = await createJwtAccessToken!({
          sub: entry.userId,
          client_id: clientId,
          user: true,
          scope: entry.scopes,
        });

        // Generate a signed JWT id token
        const idToken = entry.scopes.includes("openid")
          ? (await createIdToken!({ sub: entry.userId, name: user.username, aud: clientId })).token
          : undefined;

        // Return token response
        return new OAuth2TokenResponse({ access_token: accessToken })
          .setExpiresIn(ttl)
          .setTokenType(tokenType)
          .setScope(entry.scopes)
          .setIdToken(idToken);
      }
    )
  )

  // Step 3: Access Token Validation
  .validate(async (_req, { jwtAccessTokenPayload }) => {
    if (!jwtAccessTokenPayload?.sub || !jwtAccessTokenPayload.user) return { isValid: false };
    return {
      isValid: true,
      credentials: {
        user: {
          id: jwtAccessTokenPayload.sub,
          clientId: jwtAccessTokenPayload.client_id,
        },
        scope: Array.isArray(jwtAccessTokenPayload.scope) ? jwtAccessTokenPayload.scope : [],
      },
    };
  });
