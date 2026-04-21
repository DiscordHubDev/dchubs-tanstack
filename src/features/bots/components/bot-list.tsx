/** biome-ignore-all lint/suspicious/noArrayIndexKey: Already guaranteed to be stable and unique for this purpose */
import { Link } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { AlertTriangle, ArrowUp, BadgeCheck, Pin, Users } from "lucide-react";
import { memo } from "react";
import { FaCheck } from "react-icons/fa6";
import ListSkeleton from "#/components/list-skeleton";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { PublicBot } from "../bots.types";

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
			{bots.map((item) => (
				<article
					key={item.id}
					className="relative rounded-xl border border-white/10 bg-[#2b2d31] p-4 transition hover:border-white/20"
				>
					<Link
						to="/bots/$botId"
						params={{ botId: item.id }}
						preload="intent"
						className="absolute inset-0 z-10 rounded-xl"
						aria-label={`前往 ${item.name} 機器人頁面`}
					>
						<span className="sr-only">前往 {item.name} 機器人頁面</span>
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

								{item.verified && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge className="relative z-20 bg-[#5865F2] text-white text-sm px-3 rounded-full gap-1 inline-flex items-center cursor-default hover:bg-[#4752c4] hover:text-white">
													<FaCheck className="w-3.5 h-3.5" />
													驗證
												</Badge>
											</TooltipTrigger>
											<TooltipContent>已驗證的 Discord 機器人</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}

								{item.isAdmin && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="relative z-20 text-yellow-600 hover:text-yellow-500 cursor-pointer">
													<AlertTriangle className="w-5 h-5" />
												</div>
											</TooltipTrigger>
											<TooltipContent className="bg-yellow-100 border border-yellow-400 text-yellow-900 max-w-sm px-3 py-2 rounded-md text-sm">
												<div className="flex flex-col space-y-1">
													<span>
														此機器人所需的權限包含 <strong>管理者權限</strong>
														，可能會有潛在的安全疑慮，請謹慎邀請。
													</span>
													<span className="text-xs text-yellow-700">
														（僅為提醒用途，並非禁止邀請。請確認您信任此機器人開發者）
													</span>
												</div>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}

								{item.isFavorite && (
									<span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">
										<BadgeCheck className="h-3.5 w-3.5" />
										已收藏
									</span>
								)}
							</div>

							<p className="line-clamp-2 text-sm text-gray-300">
								{item.description}
							</p>

							<div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
								<span className="inline-flex items-center gap-1">
									<Users className="h-4 w-4" />
									{item.servers.toLocaleString()} 伺服器
								</span>
								<span className="inline-flex items-center gap-1">
									<ArrowUp className="h-4 w-4" />
									{item.upvotes.toLocaleString()} 票
								</span>
							</div>

							<div className="mt-3 flex flex-wrap gap-2">
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
								<a
									href={item.inviteUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
										立即邀請
									</Button>
								</a>
							) : item.website ? (
								<a
									href={item.website}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
										前往網站
									</Button>
								</a>
							) : (
								<Link to="/about">
									<Button
										variant="outline"
										className="border-white/20 text-white hover:bg-white/10"
									>
										查看資訊
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

export default memo(BotList);
