import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { CategoryType } from "#/lib/types";
import CategorySearch from "./category-search";

type MobileCategoryFilterProps = {
	categories: CategoryType[];
	selectedCategoryIds: string[];
	onCategoryChange: (ids: string[]) => void;
	onCustomCategoryAdd?: (name: string) => void;
};

export default function MobileCategoryFilter({
	categories,
	selectedCategoryIds,
	onCategoryChange,
	onCustomCategoryAdd,
}: MobileCategoryFilterProps) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-lg border border-white/10 bg-[#2b2d31] p-4">
			<Button
				type="button"
				variant="outline"
				onClick={() => setOpen((prev) => !prev)}
				className="w-full justify-between border-white/20 bg-transparent text-white hover:bg-white/10"
			>
				<span className="inline-flex items-center gap-2">
					<SlidersHorizontal className="h-4 w-4" />
					分類篩選
				</span>
				<span className="text-xs text-gray-300">
					{selectedCategoryIds.length} 已選
				</span>
			</Button>

			{open && (
				<div className="mt-4">
					<CategorySearch
						categories={categories}
						selectedCategoryIds={selectedCategoryIds}
						onCategoryChange={onCategoryChange}
						onCustomCategoryAdd={onCustomCategoryAdd}
					/>
				</div>
			)}
		</div>
	);
}
