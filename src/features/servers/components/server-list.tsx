import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, Clock, Heart, Pin, Users } from "lucide-react";
import { memo, useRef } from "react";
import ListSkeleton from "#/components/list-skeleton";
import { OptimizedImage } from "#/components/OptimizedImage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/utils/time";
import type { PublicServer } from "../servers.types";

type ServerListProps = {
	servers: PublicServer[];
	isLoading: boolean;
	skeletonCount?: number;
};

// 獨立卡片元件，確保重繪成本降到最低
const ServerCard = memo(({ item }: { item: PublicServer }) => (
	<article className="relative h-full rounded-xl border border-white/10 bg-[#2b2d31] p-4 transition hover:border-white/20">
		<Link
			to="/servers/$serverId"
			params={{ serverId: item.id }}
			preload="intent"
			className="absolute inset-0 z-10 rounded-xl"
			aria-label={`前往 ${item.name} 伺服器頁面`}
		>
			<span className="sr-only">前往 {item.name} 伺服器頁面</span>
		</Link>
		<div className="flex flex-col gap-4 sm:flex-row">
			<OptimizedImage
				src={item.icon}
				fallbackSrc="https://cdn.discordapp.com/embed/avatars/0.png"
				alt={`${item.name} icon`}
				width={64}
				height={64}
				loading="lazy" // 延遲載入非首屏圖片
				className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
			/>
			<div className="min-w-0 flex-1">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					<h3 className="inline-flex items-center gap-2 font-semibold text-lg text-white">
						<span className="truncate">{item.name}</span>
						{item.pin && <Pin className="h-4 w-4 text-gray-400" />}
					</h3>
					{item.isFavorite && (
						<span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-1 font-semibold text-rose-600 text-xs">
							<Heart className="h-3.5 w-3.5 fill-rose-500 stroke-rose-500" />
							已收藏
						</span>
					)}
				</div>
				{item.description && (
					<p className="line-clamp-2 text-gray-300 text-sm">
						{item.description}
					</p>
				)}
				<div className="mt-3 flex flex-wrap items-center gap-3 text-gray-400 text-sm">
					<span className="inline-flex items-center gap-1">
						<Users className="h-4 w-4" />
						{item.members.toLocaleString()}
					</span>
					<span className="inline-flex items-center gap-1">
						<ArrowUp className="h-4 w-4" />
						{item.upvotes.toLocaleString()}
					</span>
					<span className="inline-flex items-center gap-1">
						<div className="mr-1 h-2 w-2 rounded-full bg-green-500" />
						{item.online || "0"}
					</span>
					<span className="inline-flex items-center gap-1">
						<Clock className="h-4 w-4" />
						{formatTime(item.createdAt)}
					</span>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					{item.nsfw && (
						<Badge
							variant="destructive"
							className="relative z-20 cursor-default bg-red-600 font-bold text-white hover:bg-red-700"
						>
							<span className="mr-1">🔞</span> NSFW
						</Badge>
					)}
					{item.tags.slice(0, 5).map((tag) => (
						<Badge
							key={tag}
							variant="secondary"
							className="relative z-20 cursor-default bg-[#36393f] text-gray-300 hover:bg-[#4f545c]"
						>
							{tag}
						</Badge>
					))}
				</div>
			</div>
			<div className="relative z-20 flex items-center sm:items-start">
				{item.inviteUrl ? (
					<a href={item.inviteUrl} target="_blank" rel="noopener noreferrer">
						<Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
							立即加入
						</Button>
					</a>
				) : (
					<Link to="/tutorial">
						<Button
							variant="outline"
							className="border-white/20 text-white hover:bg-white/10"
						>
							查看教學
						</Button>
					</Link>
				)}
			</div>
		</div>
	</article>
));

function ServerList({
	servers,
	isLoading,
	skeletonCount = 10,
}: ServerListProps) {
	const listRef = useRef<HTMLDivElement>(null);

	// 使用 Window Virtualizer，讓滾動事件綁定在整個畫面上
	const virtualizer = useWindowVirtualizer({
		count: isLoading ? skeletonCount : servers.length,
		estimateSize: () => 180, // 估算單個卡片高度 (含間距)
		overscan: 3, // 預先渲染視窗外的數量，防破圖
		scrollMargin: listRef.current?.offsetTop ?? 0,
	});

	if (!isLoading && !servers.length) {
		return (
			<div className="rounded-xl border border-white/10 bg-[#2b2d31] p-8 text-center text-gray-300">
				找不到符合條件的伺服器。
			</div>
		);
	}

	return (
		<div
			ref={listRef}
			className="relative w-full"
			style={{ height: `${virtualizer.getTotalSize()}px` }}
		>
			<div
				className="absolute top-0 left-0 w-full"
				style={{
					transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
				}}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const isLoaderRow = isLoading;
					const item = isLoaderRow ? null : servers[virtualRow.index];

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="pb-4" // 替代原來的 space-y-4 間距
						>
							{isLoaderRow ? (
								<ListSkeleton count={1} />
							) : (
								item && <ServerCard item={item} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default memo(ServerList);
