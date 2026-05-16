import { KaapiServerRoute } from "@kaapi/kaapi";
import { auth } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { FRONTEND_URL, MCP_BASE_URL } from "../config/mcp";
import { UserOAuthClientProvider } from "../services/oauth-provider";
import { consumePendingAuth, savePendingAuth } from "../services/pending-auth-store";
import { clearUserSession } from "../services/mcp-client";
import { log } from "../services/log-service";
import { registerSession, getSessionState, markSessionAuthenticated } from "../services/session-store";

const MCP_ENDPOINT = new URL("/mcp", MCP_BASE_URL);

/**
 * POST /api/auth/login
 *
 * Initiates the OAuth authorization code flow.
 * Handles both first-time visitors (no session yet) and returning users:
 *
 *  - No Authorization header → creates a new session on the spot, then starts the
 *    auth flow. Returns { userId, authorizationUrl } so the frontend can store the
 *    session ID and redirect in a single round trip.
 *  - Authorization: Bearer <sessionId> → validates the existing session and returns
 *    { authorizationUrl } (pending) or { alreadyAuthenticated: true } (already done).
 *
 * Flow:
 *  1. auth() discovers the auth server (RFC 9728), handles Dynamic Client Registration
 *     if needed, builds the PKCE authorization URL, then calls provider.redirectToAuthorization().
 *  2. UserOAuthClientProvider captures the URL instead of doing a real redirect.
 *  3. We persist { userId, codeVerifier } keyed by `state` for the callback.
 */
export const loginRoute: KaapiServerRoute = {
    method: "post",
    path: "/api/auth/login",
    handler: async (request, h) => {
        try {
            const authHeader = (request.headers as Record<string, string>)["authorization"] ?? "";
            const existingId = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

            let userId: string;
            let isNewSession = false;

            if (!existingId) {
                // No session yet — create one inline so the client only needs one round trip.
                userId = randomUUID();
                await registerSession(userId);
                isNewSession = true;
            } else {
                userId = existingId;
                const sessionState = await getSessionState(userId);
                if (sessionState === undefined) {
                    return h.response({ ok: false, error: "Unknown session ID" }).code(403);
                }
                if (sessionState === "authenticated") {
                    return { ok: true, alreadyAuthenticated: true };
                }
            }

            const provider = new UserOAuthClientProvider(userId);
            const result = await auth(provider, { serverUrl: MCP_ENDPOINT });

            if (result === "AUTHORIZED") {
                // Tokens already present from a previous flow — sync the session state.
                markSessionAuthenticated(userId);
                return { ok: true, alreadyAuthenticated: true };
            }

            if (!provider.capturedAuthUrl || !provider.storedCodeVerifier) {
                return h.response({ ok: false, error: "Failed to generate authorization URL" }).code(500);
            }

            savePendingAuth(provider.storedState, userId, provider.storedCodeVerifier);
            return {
                ok: true,
                // Only include userId when we just created the session — the client already
                // knows its own ID for subsequent requests.
                ...(isNewSession && { userId }),
                authorizationUrl: provider.capturedAuthUrl.toString(),
            };
        } catch (err) {
            log.error({ err }, "Error in login route");
            return h.response({ ok: false, error: (err as Error).message }).code(500);
        }
    },
    options: {
        description: "Initiate OAuth authorization code login",
        notes: "Returns authorizationUrl to redirect the user's browser to. Returns alreadyAuthenticated: true if the user already has valid tokens. Returns userId when a new session was created.",
        tags: ["auth"],
        plugins: {
            kaapi: {
                docs: false
            }
        }
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

        await markSessionAuthenticated(pending.userId);

        // Clear any stale session so the next chat request creates a fresh authenticated connection.
        clearUserSession(pending.userId);

        return h.redirect(`${FRONTEND_URL}?auth=success`);
    },
    options: {
        description: "OAuth authorization code callback",
        notes: "Receives the authorization code from the OAuth server and exchanges it for tokens. Redirects the browser to the frontend on success.",
        tags: ["auth"],
        plugins: {
            kaapi: {
                docs: false
            }
        }
    },
};
