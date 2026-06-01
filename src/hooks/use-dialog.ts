import { useCallback, useState } from "react";

export function useDialog<T>() {
	const [item, setItem] = useState<T | null>(null);

	const open = useCallback((value: T) => setItem(value), []);
	const close = useCallback(() => setItem(null), []);

	return { item, isOpen: item !== null, open, close } as const;
}
