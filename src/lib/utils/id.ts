/** Generate a new UUID. Wrap here so React Native can swap in expo-crypto without touching callers. */
export function newId(): string {
  return crypto.randomUUID();
}
