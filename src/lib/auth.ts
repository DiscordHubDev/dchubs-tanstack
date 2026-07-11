// auth.ts
export async function getAuth() {
  // Always create a fresh auth instance per request (safest on Cloudflare)
  const { createAuth } = await import("@/lib/auth.runtime");
  return createAuth();
}
