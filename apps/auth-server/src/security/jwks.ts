import { createInMemoryKeyStore, JoseJwksAuthority, JwksRotator } from "@saurbit/oauth2-jwt";

const jwksStore = createInMemoryKeyStore();

// Signs JWTs and exposes the public JWKS endpoint
export const jwksAuthority = new JoseJwksAuthority(jwksStore, 8.64e6); // 100-day key lifetime

// Rotates keys every 91 days and cleans up expired ones
export const jwksRotator = new JwksRotator({
  keyGenerator: jwksAuthority,
  rotationTimestampStore: jwksStore,
  rotationIntervalMs: 7.884e9, // 91 days
});
