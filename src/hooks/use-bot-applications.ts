import { useCallback, useMemo, useState } from "react";
import { reviewBotFn } from "#/features/admin/admin.functions";
import type { Bot, BotStatus } from "#/types/admin";

interface UseBotApplicationsOptions {
  initial: readonly Bot[];
  onError?: (error: unknown) => void;
}

export function useBotApplications({ initial, onError }: UseBotApplicationsOptions) {
  const [items, setItems] = useState<Bot[]>(() => [...initial]);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.developers.some((d) => d.username.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const review = useCallback(
    async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: Extract<BotStatus, "approved" | "rejected">;
      reason?: string;
    }) => {
      try {
        // 直接 await，不用檢查 success
        await reviewBotFn({
          data: { id, status, rejectionReason: reason },
        });

        // 只要沒報錯走到這裡，就代表審核成功 ✅
        setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
        return true;
      } catch (err) {
        // 所有的失敗 (包含權限不足、資料庫錯誤、網路斷線) 都會統一集中到這裡處理 ❌
        const errorMessage = err instanceof Error ? err.message : "審核失敗";
        onError?.(errorMessage);
        return false;
      }
    },
    [onError],
  );

  return { filtered, search, setSearch, review } as const;
}
