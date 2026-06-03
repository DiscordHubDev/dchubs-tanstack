# Imperative Soaring Galaxy

## Context
The user wants to implement a middleware and context injection mechanism for Better Auth within TanStack Start's Server Functions. This will allow the session (and the authenticated user) to be automatically parsed and available in the `context` of any `createServerFn` where it's needed, avoiding manual session fetching in every function.

## Proposed Approach

### 1. Modify `src/lib/auth.functions.ts`
- Export `SessionLike` and `withDiscordProfile` from this file so they can be used in the middleware.

### 2. Create `src/lib/auth-middleware.ts`
- Implement an `authMiddleware` function.
- The middleware will:
    - Call `getAuth()` to get the Better Auth instance.
    - Use `getRequest()` from `@tanstack/react-start/server` to get the request.
    - Fetch the session using `auth.api.getSession({ headers: req.headers })`.
    - Use `withDiscordProfile` to normalize the session (including the `discordProfile`).
    - Inject this normalized session into the server function's context using `next({ ...context, session: normalizedSession })`.

### 3. Demonstrate/Apply to `src/features/users/users.functions.ts`
- Update `getCurrentUserFn` (and potentially others) to use the `authMiddleware`.
- The handler of these functions will then be able to access `context.session` directly.

## Critical Files
- `src/lib/auth.functions.ts` (Export types and utility)
- `src/lib/auth-middleware.ts` (New file for middleware)
- `src/features/users/users.functions.ts` (Demonstrate usage)

## Verification Plan
- Verify that `getCurrentUserFn` (or a similar function) can successfully access the session from the `context` when the middleware is applied.
- Check that the session data (user info, discord profile) is correctly populated in the context.
- Ensure the middleware correctly handles unauthenticated requests (e.g., by providing a `null` session).
- Verify that the imports are correct (`getRequest` from `@tanstack/react-start/server`).
