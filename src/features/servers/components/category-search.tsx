import { Plus, Search } from "lucide-react";
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

export default function CategorySearch({
	categories,
	selectedCategoryIds,
	onCategoryChange,
	onCustomCategoryAdd,
}: CategorySearchProps) {
	const [keyword, setKeyword] = useState("");
	const [customCategory, setCustomCategory] = useState("");

	const filtered = useMemo(() => {
		if (!keyword.trim()) return categories;

		const q = keyword.toLowerCase();
		return categories.filter((item) => item.name.toLowerCase().includes(q));
	}, [categories, keyword]);

	function addCustomCategory() {
		const next = customCategory.trim();
		if (!next) return;

		onCustomCategoryAdd?.(next);
		setCustomCategory("");
	}

	return (
		<div className="space-y-3">
			<div className="relative">
				<Input
					value={keyword}
					onChange={(event) => setKeyword(event.target.value)}
					placeholder="搜尋分類..."
					className="border-white/10 bg-[#1f2125] pl-9 text-white placeholder:text-gray-500"
				/>
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
			</div>

			<div className="space-y-2">
				<CategoryFilter
					categories={filtered}
					selectedCategoryIds={selectedCategoryIds}
					onCategoryChange={onCategoryChange}
				/>
			</div>

			{onCustomCategoryAdd && (
				<div className="flex gap-2">
					<Input
						value={customCategory}
						onChange={(event) => setCustomCategory(event.target.value)}
						placeholder="新增自訂分類"
						className="border-white/10 bg-[#1f2125] text-white placeholder:text-gray-500"
					/>
					<Button
						type="button"
						variant="outline"
						onClick={addCustomCategory}
						className="border-white/20 bg-transparent text-white hover:bg-white/10"
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
