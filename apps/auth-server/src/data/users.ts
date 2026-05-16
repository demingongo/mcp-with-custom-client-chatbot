// === Valid clients and users ===
export interface Client {
  client_id: string;
  client_secret?: string;
  allowed_scopes: string[];
  internal: boolean; // internal clients are not allowed to request tokens but can be used for other purposes (e.g. testing)
  meta?: Record<string, unknown>;
}

export const VALID_CLIENTS: Client[] = [
  {
    client_id: "example-client",
    client_secret: "s3cr3tK3y123!",
    allowed_scopes: ["openid", "profile", "email", "offline_access", "mcp:tools"],
    internal: false,
  },
  {
    client_id: "machine-client",
    client_secret: "machine",
    allowed_scopes: ["mcp:tools"],
    internal: true,
  },
];

export interface User {
  id: string;
  username: string;
  password: string;
  email: string;
  fullName: string;
}

export const REGISTERED_USERS: User[] = [
  { id: "user-1234", username: "user", password: "crossterm", email: "user@email.com", fullName: "User FullName" },
];
