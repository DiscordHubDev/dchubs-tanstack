import { memo } from "react";
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

	return (
		<div className="space-y-4">
			{bots.map((item, index) => (
				<BotCard key={item.id} item={item} priority={index < PRIORITY_COUNT} />
			))}
		</div>
	);
}

export default memo(BotList);
