import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { showErrorAlert } from "#/lib/error-alert";

function getErrorPriority(error: unknown): "normal" | "critical" {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";

  if (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("session") ||
    message.includes("登入已過期")
  ) {
    return "critical";
  }

  return "normal";
}

export function getQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.suppressErrorAlert) return;
        showErrorAlert(error, "Error", { priority: getErrorPriority(error) });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.suppressErrorAlert) return;
        showErrorAlert(error, "Error", { priority: getErrorPriority(error) });
      },
    }),
  });
}
export default function TanstackQueryProvider() {}
