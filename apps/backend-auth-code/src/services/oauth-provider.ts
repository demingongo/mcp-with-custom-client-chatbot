import { randomUUID } from "node:crypto";
import type { OAuthClientProvider, OAuthClientMetadata, OAuthClientInformation, OAuthTokens } from "@modelcontextprotocol/client";
import { MCP_OAUTH_CALLBACK_URL, MCP_OAUTH_SCOPE } from "../config/mcp";
import { getSharedClientInfo, saveSharedClientInfo, getUserTokens, saveUserTokens } from "./user-token-store";

/**
 * Per-user OAuthClientProvider for the authorization code flow.
 *
 * - clientInformation / saveClientInformation operate on a shared store since
 *   all users of this backend share the same OAuth client registration.
 * - tokens / saveTokens operate on a per-user store.
 * - redirectToAuthorization captures the URL instead of doing an actual redirect;
 *   the login route reads capturedAuthUrl after auth() returns 'REDIRECT'.
 */
export class UserOAuthClientProvider implements OAuthClientProvider {
    private _codeVerifier?: string;
    private _state: string = randomUUID();

    /** Set by redirectToAuthorization() during the login flow. */
    capturedAuthUrl?: URL;

    constructor(
        private readonly userId: string,
        options?: { codeVerifier?: string },
    ) {
        this._codeVerifier = options?.codeVerifier;
    }

    /** Used by auth() to set the `state` query param in the authorization URL (CSRF protection). */
    state(): string {
        return this._state;
    }

    /** Exposes the state so the login route can use it as the pending-auth map key. */
    get storedState(): string {
        return this._state;
    }

    get redirectUrl(): string {
        return MCP_OAUTH_CALLBACK_URL;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: "MCP Chatbot",
            redirect_uris: [MCP_OAUTH_CALLBACK_URL],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: MCP_OAUTH_SCOPE,
        };
    }

    clientInformation(): OAuthClientInformation | undefined {
        return getSharedClientInfo();
    }

    saveClientInformation(info: OAuthClientInformation): void {
        saveSharedClientInfo(info);
    }

    tokens(): OAuthTokens | undefined {
        return getUserTokens(this.userId);
    }

    saveTokens(tokens: OAuthTokens): void {
        saveUserTokens(this.userId, tokens);
    }

    /** Captures the URL — the login route reads capturedAuthUrl after auth() returns. */
    redirectToAuthorization(authorizationUrl: URL): void {
        this.capturedAuthUrl = authorizationUrl;
    }

    saveCodeVerifier(codeVerifier: string): void {
        this._codeVerifier = codeVerifier;
    }

    codeVerifier(): string {
        if (!this._codeVerifier) throw new Error("No code verifier saved");
        return this._codeVerifier;
    }

    /** Exposes the stored code verifier so the login route can persist it. */
    get storedCodeVerifier(): string | undefined {
        return this._codeVerifier;
    }
}
