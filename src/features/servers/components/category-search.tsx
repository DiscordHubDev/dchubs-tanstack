import { AlertCircle, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { CategoryType } from "#/lib/types";
import CategoryFilter from "./category-filter";

type CategorySearchProps = {
	categories: CategoryType[];
	selectedCategoryIds: string[];
	onCategoryChange: (ids: string[]) => void;
	onCustomCategoryAdd?: (name: string) => void;
};

// 分類頁籤類型
type TabType = "all" | "preset" | "custom";

const MAX_CUSTOM_LIMIT = 5; // 策略 C：自訂標籤上限
const MAX_DISPLAY_COUNT = 12; // 策略 B：預設顯示的最大熱門標籤數

export default function CategorySearch({
	categories,
	selectedCategoryIds,
	onCategoryChange,
	onCustomCategoryAdd,
}: CategorySearchProps) {
	const [keyword, setKeyword] = useState("");
	const [customCategory, setCustomCategory] = useState("");
	const [activeTab, setActiveTab] = useState<TabType>("all");

	// 計算目前的自訂標籤數量 (假設自訂標籤的 id 都以 'custom-' 開頭)
	const customCount = useMemo(
		() => categories.filter((c) => c.id.startsWith("custom-")).length,
		[categories],
	);
	const isCustomLimitReached = customCount >= MAX_CUSTOM_LIMIT;

	// 核心過濾邏輯 (結合策略 A & 策略 B)
	const displayCategories = useMemo(() => {
		let result = categories;

		// 1. 如果有輸入關鍵字：全域搜尋
		if (keyword.trim()) {
			const q = keyword.toLowerCase();
			return result.filter((item) => item.name.toLowerCase().includes(q));
		}

		// 2. 根據當前頁籤進行過濾
		if (activeTab === "preset") {
			result = result.filter(
				(c) => c.id.startsWith("bot-") || c.id.startsWith("server-"),
			);
			// 預設標籤可以限制顯示數量 (如果你想的話)
			return result.slice(0, MAX_DISPLAY_COUNT);
		} else if (activeTab === "custom") {
			// 【自訂】：API 抓回來的其他機器人標籤 + 使用者新增的
			result = result.filter(
				(c) => !c.id.startsWith("bot-") && !c.id.startsWith("server-"),
			);
			// ⚠️ 關鍵：如果是自訂頁籤，不要 slice，全部顯示出來，讓滾動條發揮作用！
			return result;
		}

		// 預設 fallback (全部)
		return result.slice(0, MAX_DISPLAY_COUNT);
	}, [categories, keyword, activeTab]);

	function addCustomCategory() {
		const next = customCategory.trim();
		if (!next || isCustomLimitReached) return;

		onCustomCategoryAdd?.(next);
		setCustomCategory("");
	}

	return (
		<div className="space-y-3">
			{/* 搜尋列 */}
			<div className="relative">
				<Input
					value={keyword}
					onChange={(event) => setKeyword(event.target.value)}
					placeholder="搜尋分類..."
					className="border-white/10 bg-[#1f2125] pl-9 text-white placeholder:text-gray-500"
				/>
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
			</div>

			{/* 頁籤切換 (有搜尋關鍵字時隱藏，因為搜尋是全域的) */}
			{!keyword.trim() && (
				<div className="flex items-center ju gap-2 border-b border-white/10 pb-2">
					{(
						[
							{ id: "all", label: "全部" },
							{ id: "preset", label: "預設" },
							{ id: "custom", label: "自訂" },
						] as const
					).map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`rounded-md px-2 py-1 text-xs transition-colors ${
								activeTab === tab.id
									? "bg-white/10 text-white"
									: "text-gray-400 hover:bg-white/5 hover:text-gray-200"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
			)}

			{/* 標籤顯示區塊 (加入滾動條與最大高度限制) */}
			<div className="space-y-2">
				{displayCategories.length > 0 ? (
					<CategoryFilter
						categories={displayCategories}
						selectedCategoryIds={selectedCategoryIds}
						onCategoryChange={onCategoryChange}
					/>
				) : (
					<div className="text-center text-xs text-gray-500 py-4">
						找不到相關分類
					</div>
				)}
			</div>

			{/* 新增自訂分類區塊 */}
			{onCustomCategoryAdd && (
				<div className="flex flex-col gap-1 pt-2 border-t border-white/10">
					<div className="flex gap-2">
						<Input
							value={customCategory}
							onChange={(event) => setCustomCategory(event.target.value)}
							placeholder={
								isCustomLimitReached ? "已達自訂上限" : "新增自訂分類"
							}
							disabled={isCustomLimitReached}
							maxLength={15} // 建議加上字數限制防止排版破掉
							className="border-white/10 bg-[#1f2125] text-white placeholder:text-gray-500 disabled:opacity-50"
						/>
						<Button
							type="button"
							variant="outline"
							onClick={addCustomCategory}
							disabled={!customCategory.trim() || isCustomLimitReached}
							className="border-white/20 bg-transparent text-white hover:bg-white/10 disabled:opacity-50"
						>
							<Plus className="h-4 w-4" />
						</Button>
					</div>
					{/* 策略 C：上限提示 */}
					{isCustomLimitReached && (
						<span className="flex items-center text-[10px] text-yellow-500/80">
							<AlertCircle className="w-3 h-3 mr-1" />
							最多只能建立 {MAX_CUSTOM_LIMIT} 個自訂標籤
						</span>
					)}
				</div>
			)}
		</div>
	);
}
