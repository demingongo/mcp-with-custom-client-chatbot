import type { OAuthClientInformation, OAuthTokens } from "@modelcontextprotocol/client";

// All users of this backend share the same OAuth client registration (same client_id).
// Tokens are issued per-user during the authorization code flow.
let sharedClientInfo: OAuthClientInformation | undefined;

const userTokens = new Map<string, OAuthTokens>();

export function getSharedClientInfo(): OAuthClientInformation | undefined {
    return sharedClientInfo;
}

export function saveSharedClientInfo(info: OAuthClientInformation): void {
    sharedClientInfo = info;
}

export function getUserTokens(userId: string): OAuthTokens | undefined {
    return userTokens.get(userId);
}

export function saveUserTokens(userId: string, tokens: OAuthTokens): void {
    userTokens.set(userId, tokens);
}

export function hasUserTokens(userId: string): boolean {
    return userTokens.has(userId);
}

export function clearUserTokens(userId: string): void {
    userTokens.delete(userId);
}
