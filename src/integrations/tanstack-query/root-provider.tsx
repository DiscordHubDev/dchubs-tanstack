import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { showErrorAlert } from "#/lib/error-alert";

export function getContext() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (query.meta?.suppressErrorAlert) return;
				showErrorAlert(error);
			},
		}),
		mutationCache: new MutationCache({
			onError: (error, _variables, _context, mutation) => {
				if (mutation.meta?.suppressErrorAlert) return;
				showErrorAlert(error);
			},
		}),
	});

	return {
		queryClient,
	};
}
export default function TanstackQueryProvider() {}
