import { Check } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Pagination from "#/components/feedback/Pagination";
import type { CategoryType } from "#/lib/types";

interface CategoryFilterProps {
  categories: CategoryType[];
  selectedCategoryIds: string[];
  onCategoryChange: (selectedCategories: string[]) => void;
  isPending?: boolean; // 新增
}

const CategorySkeleton = memo(function CategorySkeleton() {
  return (
    <div className="space-y-2 px-1 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded p-2">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gray-600/50" />
          <span className="h-5 w-5 shrink-0 animate-pulse rounded border border-gray-600/50" />
          <span
            className="h-3 flex-1 animate-pulse rounded bg-gray-600/40"
            style={{ maxWidth: `${60 + ((i * 13) % 30)}%` }}
          />
        </div>
      ))}
    </div>
  );
});

const CATEGORIES_PER_PAGE = 10;

// 抽取分類項目為獨立的 memo 組件
const CategoryItem = memo(function CategoryItem({
  category,
  selected,
  onToggle,
}: {
  category: CategoryType;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const handleClick = useCallback(() => {
    onToggle(category.id);
  }, [category.id, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle(category.id);
      }
    },
    [category.id, onToggle],
  );

  return (
    <button
      className="flex w-full cursor-pointer items-center justify-between rounded p-2
        transition-colors hover:rounded-lg hover:bg-[#36393f]
        hover:scale-100 hover:translate-y-0 active:scale-100"
      // ↑ 關鍵：滿版按鈕明確覆寫全域 scale/translate，避免橫向撐破容器
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      type="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${category.color}`}></span>
        <div
          className={`h-5 w-5 shrink-0 rounded border ${
            selected ? "border-[#5865f2] bg-[#5865f2]/10" : "border-gray-600"
          } mr-2 flex items-center justify-center transition-colors`}
        >
          {selected && <Check size={14} className="text-[#5865f2]" />}
        </div>
        <span className="flex-1 truncate text-left">{category.name}</span>
      </div>
    </button>
  );
});

const CategoryFilter = memo(function CategoryFilter({
  categories,
  selectedCategoryIds,
  onCategoryChange,
  isPending,
}: CategoryFilterProps) {
  const [currentPage, setCurrentPage] = useState(1);

  // 計算總頁數
  const totalPages = useMemo(
    () => Math.ceil(categories.length / CATEGORIES_PER_PAGE),
    [categories.length],
  );

  // 獲取當前頁的分類
  const currentPageCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * CATEGORIES_PER_PAGE;
    const endIndex = startIndex + CATEGORIES_PER_PAGE;
    return categories.slice(startIndex, endIndex);
  }, [categories, currentPage]);

  // 關鍵字篩選改變後，確保頁碼在有效範圍內
  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      return;
    }

    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleCategory = useCallback(
    (id: string) => {
      const isSelected = selectedCategoryIds.includes(id);
      const nextIds = isSelected
        ? selectedCategoryIds.filter((selectedId) => selectedId !== id)
        : [...selectedCategoryIds, id];

      onCategoryChange(nextIds);
    },
    [onCategoryChange, selectedCategoryIds],
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  if (isPending) {
    return <CategorySkeleton />;
  }

  return (
    <div className="space-y-2">
      <div className="max-h-64 space-y-2 overflow-y-auto overflow-x-hidden px-1 py-1 pr-2">
        {currentPageCategories.map((category) => (
          <CategoryItem
            key={category.id}
            category={category}
            selected={selectedCategoryIds.includes(category.id)}
            onToggle={toggleCategory}
          />
        ))}
      </div>

      {/* 分頁控制器 - 只有當總頁數大於1時才顯示 */}
      {totalPages > 1 && (
        <div className="overflow-hidden pt-1">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            compact
          />
        </div>
      )}
    </div>
  );
});

export default CategoryFilter;
