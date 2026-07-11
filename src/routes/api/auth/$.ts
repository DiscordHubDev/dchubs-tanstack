import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await getAuth(); // ← Call inside handler
        return auth.handler(request);
      },

      POST: async ({ request }) => {
        const auth = await getAuth(); // ← Call inside handler
        return auth.handler(request);
      },
    },
  },
});
