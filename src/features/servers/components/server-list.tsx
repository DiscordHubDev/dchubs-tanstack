import { Link } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { ArrowUp, BadgeCheck, Clock, Heart, Pin, Users } from "lucide-react";
import { memo } from "react";
import ListSkeleton from "#/components/list-skeleton";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/utils/time";
import type { PublicServer } from "../servers.types";

type ServerListProps = {
	servers: PublicServer[];
	isLoading: boolean;
	skeletonCount?: number;
};

function ServerList({
	servers,
	isLoading,
	skeletonCount = 10,
}: ServerListProps) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				<ListSkeleton count={skeletonCount} />
			</div>
		);
	}

	if (!servers.length) {
		return (
			<div className="rounded-xl border border-white/10 bg-[#2b2d31] p-8 text-center text-gray-300">
				找不到符合條件的伺服器。
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{servers.map((item) => (
				<article
					key={item.id}
					className="relative rounded-xl border border-white/10 bg-[#2b2d31] p-4 transition hover:border-white/20"
				>
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
						<Image
							src={
								item.icon ?? "https://cdn.discordapp.com/embed/avatars/0.png"
							}
							alt={`${item.name} icon`}
							width={64}
							height={64}
							className="h-16 w-16 rounded-xl object-cover"
							loading="lazy"
						/>

						<div className="min-w-0 flex-1">
							<div className="mb-2 flex flex-wrap items-center gap-2">
								<h3 className="inline-flex items-center gap-2 text-lg font-semibold text-white">
									<span>{item.name}</span>
									{item.pin && <Pin className="h-4 w-4 text-gray-400" />}
								</h3>
								{item.isFavorite && (
									<span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 border border-rose-100">
										<Heart className="h-3.5 w-3.5 fill-rose-500 stroke-rose-500" />
										已收藏
									</span>
								)}
							</div>

							{item.description && (
								<p className="line-clamp-2 text-sm text-gray-300">
									{item.description}
								</p>
							)}

							<div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
								<span className="inline-flex items-center gap-1">
									<Users className="h-4 w-4" />
									{item.members.toLocaleString()} 成員
								</span>
								<span className="inline-flex items-center gap-1">
									<ArrowUp className="h-4 w-4" />
									{item.upvotes.toLocaleString()} 票
								</span>
								<span className="inline-flex items-center gap-1">
									<div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
									{item.online || "0"} 在線
								</span>
								<span className="inline-flex items-center gap-1">
									<Clock className="h-4 w-4" />
									{formatTime(item.createdAt)}
								</span>
							</div>

							<div className="mt-3 flex flex-wrap gap-2">
								{item.nsfw && (
									<Badge
										variant="destructive" /* 這裡使用 shadcn 的 destructive 通常預設就是紅色，或者用 className 自訂 */
										className="relative z-20 bg-red-600 hover:bg-red-700 text-white cursor-default font-bold"
									>
										<span className="mr-1">🔞</span>{" "}
										{/* 你可以使用 Emoji 或是你的 Icon 組件 */}
										NSFW
									</Badge>
								)}

								{/* 原有的 tags 渲染 */}
								{item.tags.slice(0, 5).map((tag) => (
									<Badge
										key={tag}
										variant="secondary"
										className="relative z-20 bg-[#36393f] hover:bg-[#4f545c] text-gray-300 cursor-default"
									>
										{tag}
									</Badge>
								))}
							</div>
						</div>

						<div className="relative z-20 flex items-center sm:items-start">
							{item.inviteUrl ? (
								<a
									href={item.inviteUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
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
			))}
		</div>
	);
}

export default memo(ServerList);
