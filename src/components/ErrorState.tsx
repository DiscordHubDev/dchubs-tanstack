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
		<div className="flex flex-col items-center justify-center min-h-75 p-6 w-full max-w-md mx-auto">
			<Alert variant="destructive" className="shadow-sm">
				<AlertCircle className="h-5 w-5" />
				<AlertTitle className="text-base font-semibold mb-2">
					糟糕，出現了一些問題！
				</AlertTitle>
				<AlertDescription className="text-sm opacity-90 wrap-break-word font-mono bg-destructive/10 p-2 rounded-md mt-2">
					{errorMessage}
				</AlertDescription>
			</Alert>

			{resetErrorBoundary && (
				<Button
					onClick={resetErrorBoundary}
					variant="outline"
					className="mt-6 w-full max-w-50 hover:bg-secondary transition-colors"
				>
					<RefreshCcw className="mr-2 h-4 w-4" />
					重新嘗試
				</Button>
			)}
		</div>
	);
}
