import { AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
	error?: Error | unknown;
	resetErrorBoundary?: () => void;
}

export function ErrorState({ error, resetErrorBoundary }: ErrorStateProps) {
	const errorMessage = error instanceof Error ? error.message : "發生未知錯誤";

	return (
		<div className="mx-auto flex min-h-75 w-full max-w-md flex-col items-center justify-center p-6">
			<Alert variant="destructive" className="shadow-sm">
				<AlertCircle className="h-5 w-5" />
				<AlertTitle className="mb-2 font-semibold text-base">
					糟糕，出現了一些問題！
				</AlertTitle>
				<AlertDescription className="wrap-break-word mt-2 rounded-md bg-destructive/10 p-2 font-mono text-sm opacity-90">
					{errorMessage}
				</AlertDescription>
			</Alert>

			{resetErrorBoundary && (
				<Button
					onClick={resetErrorBoundary}
					variant="outline"
					className="mt-6 w-full max-w-50 transition-colors hover:bg-secondary"
				>
					<RefreshCcw className="mr-2 h-4 w-4" />
					重新嘗試
				</Button>
			)}
		</div>
	);
}
