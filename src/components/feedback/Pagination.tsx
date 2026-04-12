import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Button } from "../ui/button";

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	compact?: boolean;
}

function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	compact = false,
}: PaginationProps) {
	const pageNumbers = useMemo(() => {
		if (compact) {
			if (totalPages <= 5) {
				return Array.from({ length: totalPages }, (_, i) => i + 1);
			}

			const pages: (number | string)[] = [1];

			if (currentPage <= 3) {
				pages.push(2, 3, "ellipsis-end", totalPages);
				return pages;
			}

			if (currentPage >= totalPages - 2) {
				pages.push(
					"ellipsis-start",
					totalPages - 2,
					totalPages - 1,
					totalPages,
				);
				return pages;
			}

			pages.push("ellipsis-start", currentPage, "ellipsis-end", totalPages);
			return pages;
		}

		const MAX_PAGES_TO_SHOW = 5;
		const pages: (number | string)[] = [];

		// 如果總頁數小於等於最大顯示數，顯示所有頁碼
		if (totalPages <= MAX_PAGES_TO_SHOW) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		// 計算顯示範圍
		const SIDE_PAGES = 1; // 當前頁兩側顯示的頁數
		let startPage = Math.max(2, currentPage - SIDE_PAGES);
		let endPage = Math.min(totalPages - 1, currentPage + SIDE_PAGES);

		// 確保至少顯示3個中間頁碼（如果可能）
		const middlePageCount = endPage - startPage + 1;
		if (middlePageCount < 3) {
			if (startPage === 2) {
				endPage = Math.min(totalPages - 1, startPage + 2);
			} else if (endPage === totalPages - 1) {
				startPage = Math.max(2, endPage - 2);
			}
		}

		// 總是顯示第一頁
		pages.push(1);

		// 添加左側省略號
		if (startPage > 2) {
			pages.push("ellipsis-start");
		}

		// 添加中間頁碼
		for (let i = startPage; i <= endPage; i++) {
			pages.push(i);
		}

		// 添加右側省略號
		if (endPage < totalPages - 1) {
			pages.push("ellipsis-end");
		}

		// 總是顯示最後一頁（避免重複）
		if (totalPages > 1) {
			pages.push(totalPages);
		}

		return pages;
	}, [compact, currentPage, totalPages]);

	// 安全的頁面變更處理 - 使用 useCallback
	const handlePageChange = useCallback(
		(page: number) => {
			if (page >= 1 && page <= totalPages && page !== currentPage) {
				onPageChange(page);
			}
		},
		[currentPage, totalPages, onPageChange],
	);

	const handlePrevPage = useCallback(() => {
		handlePageChange(currentPage - 1);
	}, [handlePageChange, currentPage]);

	const handleNextPage = useCallback(() => {
		handlePageChange(currentPage + 1);
	}, [handlePageChange, currentPage]);

	if (totalPages <= 1) return null;

	const navButtonSize = compact ? "icon-sm" : "icon";
	const pageButtonSize = compact ? "sm" : "default";
	const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";
	const containerSpacing = compact
		? "mt-2 gap-1 flex-nowrap overflow-x-hidden"
		: "mt-8 gap-2";
	const stableButtonClass = "hover:scale-100 active:scale-100";

	return (
		<div
			className={`flex w-full max-w-full items-center justify-center ${containerSpacing}`}
		>
			{/* 上一頁按鈕 */}
			<Button
				variant="outline"
				size={navButtonSize}
				onClick={handlePrevPage}
				disabled={currentPage === 1}
				className={`bg-[#36393f] border-[#1e1f22] text-white hover:bg-[#4f545c] hover:text-white ${stableButtonClass}`}
			>
				<ChevronLeft className={iconSize} />
			</Button>

			{/* 頁碼按鈕 */}
			{pageNumbers.map((page) => {
				const isEllipsis = typeof page === "string";

				if (isEllipsis) {
					return (
						<Button
							key={page}
							variant="outline"
							size={navButtonSize}
							disabled
							className={`bg-[#36393f] border-[#1e1f22] text-white ${stableButtonClass}`}
						>
							<MoreHorizontal className={iconSize} />
						</Button>
					);
				}

				const pageNumber = page as number;
				const isCurrentPage = currentPage === pageNumber;

				return (
					<Button
						key={pageNumber}
						variant={isCurrentPage ? "default" : "outline"}
						size={pageButtonSize}
						onClick={() => handlePageChange(pageNumber)}
						className={
							isCurrentPage
								? `bg-[#5865f2] hover:bg-[#4752c4] text-white ${stableButtonClass}`
								: `bg-[#36393f] border-[#1e1f22] text-white hover:bg-[#4f545c] hover:text-white ${stableButtonClass}`
						}
					>
						{pageNumber}
					</Button>
				);
			})}

			{/* 下一頁按鈕 */}
			<Button
				variant="outline"
				size={navButtonSize}
				onClick={handleNextPage}
				disabled={currentPage === totalPages}
				className={`bg-[#36393f] border-[#1e1f22] text-white hover:bg-[#4f545c] hover:text-white ${stableButtonClass}`}
			>
				<ChevronRight className={iconSize} />
			</Button>
		</div>
	);
}

export default memo(Pagination);
