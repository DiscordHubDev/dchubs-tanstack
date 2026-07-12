import { Check } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import Pagination from "#/components/feedback/Pagination";
import type { CategoryType } from "#/lib/types";

interface CategoryFilterProps {
  categories: CategoryType[];
  selectedCategoryIds: string[];
  onCategoryChange: (selectedCategories: string[]) => void;
  isPending?: boolean;
}

const CATEGORIES_PER_PAGE = 10;

// ==================== 骨架屏 ====================
const CategorySkeleton = memo(function CategorySkeleton() {
  return (
    <div className="space-y-2 px-1 py-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-2" aria-hidden="true">
          {/* Color dot */}
          <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gray-500/40" />

          {/* Checkbox */}
          <div className="h-5 w-5 shrink-0 animate-pulse rounded border border-gray-600/50 bg-gray-700/30" />

          {/* Text */}
          <div
            className="h-4 animate-pulse rounded bg-gray-600/40"
            style={{
              width: `${Math.max(45, 85 - (i % 5) * 8)}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
});

// ==================== 單一分類項目 ====================
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
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle(category.id);
      }
    },
    [category.id, onToggle],
  );

  return (
    <button
      className="group flex w-full items-center justify-between rounded-lg p-2
      transition-all hover:bg-[#36393f] active:bg-[#2f3136]
      focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-[#5865f2]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      type="button"
      tabIndex={0}
      aria-pressed={selected}
      role="checkbox"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Color indicator */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${category.color}`} aria-hidden="true" />

        {/* Checkbox */}
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors
            ${
              selected
                ? "border-[#5865f2] bg-[#5865f2]/10"
                : "border-gray-600 group-hover:border-gray-500"
            }`}
        >
          {selected && <Check size={14} className="text-[#5865f2]" />}
        </div>

        {/* Category name */}
        <span className="flex-1 truncate text-left text-sm">{category.name}</span>
      </div>
    </button>
  );
});

// ==================== 主組件 ====================
const CategoryFilter = memo(function CategoryFilter({
  categories,
  selectedCategoryIds,
  onCategoryChange,
  isPending,
}: CategoryFilterProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(
    () => Math.ceil(categories.length / CATEGORIES_PER_PAGE),
    [categories.length],
  );

  // 當分類列表改變時，重置到有效頁碼
  const safeCurrentPage = useMemo(() => {
    if (totalPages === 0) return 1;
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  // 當 totalPages 改變時同步頁碼
  useMemo(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [safeCurrentPage, currentPage]);

  const currentPageCategories = useMemo(() => {
    const start = (safeCurrentPage - 1) * CATEGORIES_PER_PAGE;
    return categories.slice(start, start + CATEGORIES_PER_PAGE);
  }, [categories, safeCurrentPage]);

  const toggleCategory = useCallback(
    (id: string) => {
      const isSelected = selectedCategoryIds.includes(id);
      const nextIds = isSelected
        ? selectedCategoryIds.filter((selectedId) => selectedId !== id)
        : [...selectedCategoryIds, id];

      onCategoryChange(nextIds);
    },
    [selectedCategoryIds, onCategoryChange],
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  if (isPending) {
    return <CategorySkeleton />;
  }

  return (
    <div className="space-y-3">
      {/* 分類列表 */}
      <div className="max-h-64 space-y-1 overflow-y-auto overflow-x-hidden px-1 py-1 pr-2">
        {currentPageCategories.length > 0 ? (
          currentPageCategories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              selected={selectedCategoryIds.includes(category.id)}
              onToggle={toggleCategory}
            />
          ))
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">沒有符合的分類</div>
        )}
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="pt-1">
          <Pagination
            currentPage={safeCurrentPage}
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
