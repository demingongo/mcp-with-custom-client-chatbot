type SessionState = "pending" | "authenticated";

interface Session {
  state: SessionState;
}

// Tracks every session ID issued by POST /api/auth/session.
// A session starts as "pending" and moves to "authenticated" only after the
// full OAuth callback has completed and tokens have been saved.
const sessions = new Map<string, Session>();

export async function registerSession(sessionId: string): Promise<void> {
  sessions.set(sessionId, { state: "pending" });
}

export async function getSessionState(sessionId: string): Promise<SessionState | undefined> {
  return sessions.get(sessionId)?.state;
}

export async function markSessionAuthenticated(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) session.state = "authenticated";
}
