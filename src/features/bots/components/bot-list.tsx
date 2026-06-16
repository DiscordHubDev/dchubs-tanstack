import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useRef, useState } from "react";
import ListSkeleton from "#/components/list-skeleton";
import type { PublicBot } from "../bots.types";
import BotCard from "./bot-card";

/** 首屏優先載入的數量（避免 LCP 圖片被 lazy 延遲） */
const PRIORITY_COUNT = 3;

type BotListProps = {
	bots: PublicBot[];
	isLoading: boolean;
	skeletonCount?: number;
};

function BotList({ bots, isLoading, skeletonCount = 10 }: BotListProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [scrollMargin, setScrollMargin] = useState(0);

	// 動態計算列表距離視窗頂部的實際距離，確保虛擬滾動定位精確
	useEffect(() => {
		if (listRef.current) {
			setScrollMargin(listRef.current.offsetTop);
		}
	}, []);

	const windowVirtualizer = useWindowVirtualizer({
		count: bots.length,
		estimateSize: () => 146, // 預估每張卡片（含間距）的基礎高度
		overscan: 5, // 快取視窗外額外渲染的數量，確保平滑滾動不白屏
		scrollMargin,
	});

	if (isLoading) {
		return (
			<div className="space-y-4">
				<ListSkeleton count={skeletonCount} />
			</div>
		);
	}

	if (!bots.length) {
		return (
			<div className="rounded-xl border border-white/10 bg-[#2b2d31] p-8 text-center text-gray-300">
				找不到符合條件的機器人。
			</div>
		);
	}

	const virtualItems = windowVirtualizer.getVirtualItems();

	return (
		<div
			ref={listRef}
			style={{
				height: `${windowVirtualizer.getTotalSize()}px`, // 撐開總高度以維持原生滾動條
				width: "100%",
				position: "relative",
			}}
		>
			{virtualItems.map((virtualItem) => {
				const item = bots[virtualItem.index];
				return (
					<div
						key={virtualItem.key}
						ref={windowVirtualizer.measureElement} // 自動動態測量不同內容長度的真實高度
						data-index={virtualItem.index}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							// 減去偏移量實現正確的絕對定位
							transform: `translateY(${
								virtualItem.start - windowVirtualizer.options.scrollMargin
							}px)`,
							paddingBottom: "16px", // 替代原本 space-y-4 的卡片間距效果
						}}
					>
						<BotCard
							item={item}
							priority={virtualItem.index < PRIORITY_COUNT}
						/>
					</div>
				);
			})}
		</div>
	);
}

export default memo(BotList);
