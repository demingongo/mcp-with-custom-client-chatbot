import { KaapiServerRoute } from "@kaapi/kaapi";
import { auth } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { FRONTEND_URL, MCP_BASE_URL } from "../config/mcp";
import { UserOAuthClientProvider } from "../services/oauth-provider";
import { consumePendingAuth, savePendingAuth } from "../services/pending-auth-store";
import { clearUserSession } from "../services/mcp-client";
import { log } from "../services/log-service";

const MCP_ENDPOINT = new URL("/mcp", MCP_BASE_URL);

/**
 * POST /api/auth/session
 *
 * Creates a new anonymous session and returns a session ID.
 * The frontend stores this ID and passes it as the X-User-Id header on all
 * subsequent requests. It is also used as the userId parameter in /api/auth/login
 * to bind the OAuth tokens to this session.
 */
export const createSessionRoute: KaapiServerRoute = {
    method: "post",
    path: "/api/auth/session",
    handler: () => ({ ok: true, userId: randomUUID() }),
    options: {
        description: "Create a new session",
        notes: "Returns a session ID (userId) the frontend must store and include in every request as the X-User-Id header.",
        tags: ["auth"],
    },
};

/**
 * GET /api/auth/login?userId=<id>
 *
 * Initiates the OAuth authorization code flow for a user.
 * Returns { authorizationUrl } — the frontend should redirect the user's browser there.
 * If the user already has valid tokens, returns { alreadyAuthenticated: true } instead.
 *
 * Flow:
 *  1. auth() discovers the auth server (RFC 9728), handles Dynamic Client Registration
 *     if needed, builds the PKCE authorization URL, then calls provider.redirectToAuthorization().
 *  2. UserOAuthClientProvider captures the URL instead of doing a real redirect.
 *  3. We persist { userId, codeVerifier } keyed by `state` for the callback.
 */
export const loginRoute: KaapiServerRoute = {
    method: "get",
    path: "/api/auth/login",
    handler: async (request, h) => {
        try {
            const userId = (request.query as Record<string, string>).userId;
            if (!userId) {
                return h.response({ ok: false, error: "userId query parameter is required" }).code(400);
            }

            const provider = new UserOAuthClientProvider(userId);
            const result = await auth(provider, { serverUrl: MCP_ENDPOINT });

            if (result === "AUTHORIZED") {
                return { ok: true, alreadyAuthenticated: true };
            }

            if (!provider.capturedAuthUrl || !provider.storedCodeVerifier) {
                return h.response({ ok: false, error: "Failed to generate authorization URL" }).code(500);
            }

            savePendingAuth(provider.storedState, userId, provider.storedCodeVerifier);
            return { ok: true, authorizationUrl: provider.capturedAuthUrl.toString() };
        } catch (err) {
            log.error({ err }, "Error in login route");
            return h.response({ ok: false, error: (err as Error).message }).code(500);
        }

    },
    options: {
        description: "Initiate OAuth authorization code login",
        notes: "Returns authorizationUrl to redirect the user's browser to. Returns alreadyAuthenticated: true if the user already has valid tokens.",
        tags: ["auth"],
    },
};

/**
 * GET /api/auth/callback?code=<code>&state=<state>
 *
 * OAuth redirect target. The auth server sends the user's browser here after they log in.
 * Exchanges the authorization code for tokens and redirects to the frontend.
 */
export const callbackRoute: KaapiServerRoute = {
    method: "get",
    path: "/api/auth/callback",
    handler: async (request, h) => {
        const { code, state } = request.query as { code?: string; state?: string };

        if (!code || !state) {
            return h.response({ ok: false, error: "Missing code or state" }).code(400);
        }

        const pending = consumePendingAuth(state);
        if (!pending) {
            return h.response({ ok: false, error: "Invalid or expired state parameter" }).code(400);
        }

        const provider = new UserOAuthClientProvider(pending.userId, { codeVerifier: pending.codeVerifier });
        await auth(provider, { serverUrl: MCP_ENDPOINT, authorizationCode: code });

        // Clear any stale session so the next chat request creates a fresh authenticated connection.
        clearUserSession(pending.userId);

        return h.redirect(`${FRONTEND_URL}?auth=success`);
    },
    options: {
        description: "OAuth authorization code callback",
        notes: "Receives the authorization code from the OAuth server and exchanges it for tokens. Redirects the browser to the frontend on success.",
        tags: ["auth"],
    },
};
