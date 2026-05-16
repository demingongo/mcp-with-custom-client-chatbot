interface PendingAuth {
  userId: string;
  codeVerifier: string;
  expiresAt: number;
}

// Keyed by the OAuth `state` parameter — maps in-flight login attempts to the
// user and PKCE code verifier that were generated at login time.
const pending = new Map<string, PendingAuth>();

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function savePendingAuth(state: string, userId: string, codeVerifier: string): void {
  pending.set(state, { userId, codeVerifier, expiresAt: Date.now() + TTL_MS });
}

/** Retrieves and removes the pending auth entry for a given state. Returns undefined if missing or expired. */
export function consumePendingAuth(state: string): { userId: string; codeVerifier: string } | undefined {
  const entry = pending.get(state);
  if (!entry) return undefined;
  pending.delete(state);
  if (Date.now() > entry.expiresAt) return undefined;
  return { userId: entry.userId, codeVerifier: entry.codeVerifier };
}
