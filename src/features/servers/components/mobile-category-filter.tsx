// mobile-category-filter.tsx
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import type { CategoryType } from "#/lib/types";
import CategorySearch from "./category-search";

function CategorySkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-2" aria-hidden="true">
      {/* 模擬搜尋框 */}
      <div className="h-10 w-full rounded-md bg-white/10" />

      {/* 模擬分類標籤群組 */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-white/10"
            style={{ width: `${64 + ((i * 17) % 56)}px` }}
          />
        ))}
      </div>

      {/* 模擬清單列 */}
      <div className="space-y-2 pt-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-4 shrink-0 rounded bg-white/10" />
            <div className="h-4 flex-1 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

type MobileCategoryFilterProps = {
  categories: CategoryType[];
  selectedCategoryIds: string[];
  onCategoryChange: (ids: string[]) => void;
  onCustomCategoryAdd?: (name: string) => void;
  isPending?: boolean;
};

export default function MobileCategoryFilter({
  categories,
  selectedCategoryIds,
  onCategoryChange,
  onCustomCategoryAdd,
  isPending = false,
}: MobileCategoryFilterProps) {
  const [open, setOpen] = useState(false);

  // 開啟時鎖住背景捲動，符合手機下拉式選單的常見行為
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  const selectedCount = selectedCategoryIds.length;

  return (
    <div className="rounded-lg border border-white/10 bg-[#2b2d31] p-3 sm:p-4">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-category-sheet"
        className="h-11 w-full justify-between border-white/20 bg-transparent text-white active:bg-white/10"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          <span className="text-sm">分類篩選</span>
        </span>
        {selectedCount > 0 ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-white">
            {selectedCount} 已選
          </span>
        ) : (
          <span className="text-xs text-gray-400">未選擇</span>
        )}
      </Button>

      {open && (
        <>
          {/* 背景遮罩：點擊可關閉 */}
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* 底部抽屜 */}
          <div
            id="mobile-category-sheet"
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl border-t border-white/10 bg-[#2b2d31] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            {/* 拖曳手把樣式（純視覺提示，非實際可拖曳） */}
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-medium text-white">分類篩選</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-300 active:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(85vh-96px)] overflow-y-auto px-4 pb-2">
              {isPending ? (
                <CategorySkeleton />
              ) : (
                <CategorySearch
                  categories={categories}
                  selectedCategoryIds={selectedCategoryIds}
                  onCategoryChange={onCategoryChange}
                  onCustomCategoryAdd={onCustomCategoryAdd}
                />
              )}
            </div>

            <div className="flex gap-2 px-4 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onCategoryChange([])}
                disabled={isPending || selectedCount === 0}
                className="h-11 flex-1 border-white/20 bg-transparent text-white active:bg-white/10"
              >
                清除
              </Button>
              <Button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="h-11 flex-1"
              >
                完成
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
