import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import {
	Activity,
	ArrowUp,
	Clock,
	Flag,
	Globe,
	Heart,
	Star,
	Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import NotFound from "#/components/notFound";
import { OptimizedImage } from "#/components/OptimizedImage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { toggleFavoriteFn } from "#/features/users/users.functions";
import { signIn, useSession } from "#/lib/auth-client";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import {
	rateServerFn,
	reportServerFn,
	voteServerFn,
} from "../server-detail.functions";
import { serverDetailQueryOptions } from "../server-detail.query";
import type { ServerDetailTab, ServerReview } from "../server-detail.types";

const routeApi = getRouteApi("/servers/$serverId/");
const VALID_TABS: readonly ServerDetailTab[] = [
	"about",
	"rules",
	"screenshots",
];

function getSessionUserId(
	session: ReturnType<typeof useSession>["data"],
): string | null {
	return (
		session?.discordProfile?.id ??
		session?.user?.discordId ??
		session?.user?.id ??
		null
	);
}

function isServerDetailTab(value: string): value is ServerDetailTab {
	return VALID_TABS.includes(value as ServerDetailTab);
}

function showSuccess(message: string) {
	toast.success(message);
}

function formatRelativeTime(dateValue: string | null): string {
	if (!dateValue) return "未知";

	const ms = Date.now() - new Date(dateValue).getTime();
	const minutes = Math.floor(ms / 60000);
	if (minutes < 1) return "剛剛";
	if (minutes < 60) return `${minutes} 分鐘前`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小時前`;

	const days = Math.floor(hours / 24);
	if (days < 30) return `${days} 天前`;

	const months = Math.floor(days / 30);
	if (months < 12) return `${months} 個月前`;

	const years = Math.floor(months / 12);
	return `${years} 年前`;
}

function calculateAvgRating(reviewList: ServerReview[]): number {
	if (!reviewList.length) return 0;
	const sum = reviewList.reduce((total, item) => total + item.rating, 0);
	return Number((sum / reviewList.length).toFixed(2));
}

function isCloudinaryUrl(value: string): boolean {
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase();
		return host === "res.cloudinary.com" || host.endsWith(".cloudinary.com");
	} catch {
		return false;
	}
}

export function ServerDetailPage() {
	const { serverId } = routeApi.useParams();
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const { data: detail } = useSuspenseQuery(serverDetailQueryOptions(serverId));

	const [isReportOpen, setIsReportOpen] = useState(false);
	const [reportSubject, setReportSubject] = useState("");
	const [reportContent, setReportContent] = useState("");

	const activeTab = (search.tab ?? "about") as ServerDetailTab;
	const sessionUserId = getSessionUserId(session);
	const isSignedIn = Boolean(sessionUserId);
	const bannerIsCloudinary = Boolean(
		detail?.banner && isCloudinaryUrl(detail.banner),
	);
	const detailQueryKey = useMemo(
		() => queryKeys.servers.detail(serverId),
		[serverId],
	);

	const favoriteMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: () =>
			runEffect(
				tryEffectPromise("Failed to toggle favorite", () =>
					toggleFavoriteFn({
						data: {
							target: "server",
							id: serverId,
						},
					}),
				),
			),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData(detailQueryKey);
			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old) return old;
				return {
					...old,
					isFavorite: !old.isFavorite,
				};
			});

			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(detailQueryKey, context.previous);
			}
			showErrorAlert(error, "收藏失敗");
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old) return old;
				return {
					...old,
					isFavorite: result.favorited,
				};
			});

			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
			await queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
		},
	});

	const voteMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: () =>
			runEffect(
				tryEffectPromise("Failed to vote server", () =>
					voteServerFn({ data: { serverId } }),
				),
			),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData(detailQueryKey);
			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old || old.hasVotedRecently) return old;

				return {
					...old,
					upvotes: old.upvotes + 1,
					hasVotedRecently: true,
					nextVoteAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
				};
			});

			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(detailQueryKey, context.previous);
			}
			showErrorAlert(error, "投票失敗");
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old) return old;
				return {
					...old,
					upvotes: result.upvotes,
					hasVotedRecently: result.success ? true : old.hasVotedRecently,
					nextVoteAt: result.nextVoteAt,
				};
			});

			showSuccess(result.message);
			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
			await queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
		},
	});

	const rateMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: (rating: number) =>
			runEffect(
				tryEffectPromise("Failed to rate server", () =>
					rateServerFn({ data: { serverId, rating } }),
				),
			),
		onMutate: async (rating) => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData(detailQueryKey);
			if (!sessionUserId) return { previous };

			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old) return old;

				const nextReviews = [...old.reviews];
				const existingIndex = nextReviews.findIndex(
					(item) => item.userId === sessionUserId,
				);

				if (existingIndex >= 0) {
					nextReviews[existingIndex] = {
						...nextReviews[existingIndex],
						rating,
					};
				} else {
					nextReviews.push({
						id: `temp-${sessionUserId}-${serverId}`,
						createdAt: new Date().toISOString(),
						botId: null,
						rating,
						vote: 0,
						comment: null,
						userId: sessionUserId,
						serverId,
					});
				}

				return {
					...old,
					reviews: nextReviews,
					userRating: rating,
					currentRating: calculateAvgRating(nextReviews),
					totalReviews: nextReviews.length,
				};
			});

			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(detailQueryKey, context.previous);
			}
			showErrorAlert(error, "評分失敗");
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
				if (!old) return old;
				return {
					...old,
					currentRating: Number(result.averageRating.toFixed(2)),
					totalReviews: result.totalReviews,
					userRating: result.rating,
				};
			});

			showSuccess("評分已更新");
			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
		},
	});

	const reportMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: (payload: { subject: string; content: string }) =>
			runEffect(
				tryEffectPromise("Failed to submit report", () =>
					reportServerFn({
						data: {
							serverId,
							itemName: detail?.name ?? "Unknown Server",
							subject: payload.subject,
							content: payload.content,
						},
					}),
				),
			),
		onSuccess: (result) => {
			showSuccess(result.message);
			setIsReportOpen(false);
			setReportSubject("");
			setReportContent("");
		},
		onError: (error) => {
			showErrorAlert(error, "檢舉失敗");
		},
	});

	if (!detail) {
		return <NotFound />;
	}

	function ensureSignedIn(): boolean {
		if (isSignedIn) return true;
		void signIn(window.location.href);
		return false;
	}

	function handleTabChange(value: string) {
		if (!isServerDetailTab(value)) return;

		navigate({
			replace: true,
			search: (previous) => ({
				...previous,
				tab: value,
			}),
		});
	}

	function handleReportSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!ensureSignedIn()) return;

		reportMutation.mutate({
			subject: reportSubject.trim(),
			content: reportContent.trim(),
		});
	}

	return (
		<div className="min-h-screen bg-[#1e1f22] pb-16 text-white">
			<div className="relative h-52 overflow-hidden bg-[#36393f] md:h-64 lg:h-80">
				{detail.banner ? (
					<>
						{bannerIsCloudinary ? (
							<Image
								cdn="cloudinary"
								src={detail.banner}
								alt={`${detail.name} banner`}
								layout="fullWidth"
								height={480}
								className="absolute inset-0 h-full w-full object-cover"
								loading="eager"
							/>
						) : (
							<OptimizedImage
								src={detail.banner}
								alt={`${detail.name} banner`}
								width={1024}
								height={400}
								loading="eager" // 🟢 穿透屬性：讓首屏核心大圖立即加載，優化效能
								className="absolute inset-0 h-full w-full object-cover"
							/>
						)}
						<div className="absolute inset-0 bg-linear-to-t from-[#1e1f22] to-transparent" />
					</>
				) : (
					<div className="h-full w-full bg-linear-to-r from-[#5865f2] to-[#8c54ff]" />
				)}
			</div>

			<div className="relative z-10 mx-auto -mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="flex flex-col gap-6 md:flex-row">
					<div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
						<div className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#1e1f22] bg-[#36393f] md:h-32 md:w-32">
							{detail.icon ? (
								<OptimizedImage
									src={detail.icon}
									alt={detail.name}
									width={128}
									height={128}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center bg-[#5865f2] font-bold text-3xl">
									{detail.name.charAt(0).toUpperCase()}
								</div>
							)}
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-2">
								<h1 className="font-bold text-2xl md:text-3xl">
									{detail.name}
								</h1>
							</div>

							<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300 text-sm">
								<div className="flex items-center">
									<Users size={16} className="mr-1" />
									<span>{detail.members.toLocaleString()} 成員</span>
								</div>
								<div className="flex items-center">
									<Activity size={16} className="mr-1" />
									<span>{(detail.online ?? 0).toLocaleString()} 在線</span>
								</div>
								<div className="flex items-center">
									<ArrowUp size={16} className="mr-1" />
									<span>{detail.upvotes.toLocaleString()} 投票</span>
								</div>
								<div className="flex items-center">
									<Clock size={16} className="mr-1" />
									<span>{formatRelativeTime(detail.createdAt)}</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6 flex flex-wrap gap-2">
					{detail.nsfw && (
						<Badge
							variant="destructive" /* 這裡使用 shadcn 的 destructive 通常預設就是紅色，或者用 className 自訂 */
							className="relative z-20 cursor-default bg-red-600 font-bold text-white hover:bg-red-700"
						>
							<span className="mr-1">🔞</span>{" "}
							{/* 你可以使用 Emoji 或是你的 Icon 組件 */}
							NSFW
						</Badge>
					)}

					{/* 原有的 tags 渲染 */}
					{detail.tags.slice(0, 5).map((tag) => (
						<Badge
							key={tag}
							variant="secondary"
							className="relative z-20 cursor-default bg-[#36393f] text-gray-300 hover:bg-[#4f545c]"
						>
							{tag}
						</Badge>
					))}
				</div>

				<div className="mt-6 mb-4 flex flex-wrap gap-3">
					<Button
						size="lg"
						onClick={() => {
							if (!detail.inviteUrl) return;
							window.open(detail.inviteUrl, "_blank", "noopener,noreferrer");
						}}
						disabled={!detail.inviteUrl}
						className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
					>
						立即加入
					</Button>

					<Button
						onClick={() => {
							if (!ensureSignedIn()) return;
							favoriteMutation.mutate();
						}}
						disabled={favoriteMutation.isPending}
						className={`flex transform cursor-pointer items-center gap-2 rounded-md px-6 py-5 font-medium text-sm transition-all duration-150 hover:scale-105 ${
							detail.isFavorite
								? "bg-rose-500 hover:bg-rose-600"
								: "bg-indigo-500 hover:bg-indigo-600"
						} text-white disabled:cursor-not-allowed`}
					>
						<Heart
							size={18}
							className={`h-4 w-4 transition-colors duration-150 ${
								detail.isFavorite ? "fill-white stroke-white" : "stroke-white"
							}`}
						/>
						{detail.isFavorite ? "已收藏" : "收藏"}
					</Button>

					<Button
						onClick={() => setIsReportOpen((prev) => !prev)}
						size="lg"
						className="flex w-full transform cursor-pointer items-center gap-2 bg-red-600 text-white transition-all duration-150 hover:scale-105 hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400 md:w-auto"
					>
						<Flag className="h-4 w-4" />
						檢舉
					</Button>
				</div>

				{isReportOpen ? (
					<form
						onSubmit={handleReportSubmit}
						className="mb-6 rounded-xl border border-white/10 bg-[#2b2d31] p-4"
					>
						<div className="mb-3 text-gray-300 text-sm">提交伺服器檢舉</div>
						<div className="grid gap-3">
							<Input
								value={reportSubject}
								onChange={(event) => setReportSubject(event.target.value)}
								placeholder="檢舉主旨"
								required
								maxLength={120}
							/>
							<Textarea
								value={reportContent}
								onChange={(event) => setReportContent(event.target.value)}
								placeholder="請描述檢舉內容"
								required
								maxLength={2000}
								className="min-h-28"
							/>
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="ghost"
									onClick={() => setIsReportOpen(false)}
								>
									取消
								</Button>
								<Button type="submit" disabled={reportMutation.isPending}>
									送出檢舉
								</Button>
							</div>
						</div>
					</form>
				) : null}

				<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
					<div className="lg:col-span-1">
						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 font-semibold text-lg">伺服器資訊</h3>
							<div className="space-y-4">
								{detail.owner ? (
									<div>
										<h4 className="mb-2 text-gray-400">擁有者</h4>
										<Link
											to="/users/$userId"
											preload="intent"
											params={{ userId: detail.owner.id }}
											className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:cursor-pointer hover:bg-white/5"
										>
											{detail.owner.avatar ? (
												<OptimizedImage
													src={detail.owner.avatar}
													alt={`${detail.owner.username} avatar`}
													width={32}
													height={32}
													className="rounded-full object-cover"
												/>
											) : (
												<div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] font-semibold text-sm">
													{detail.owner.username.charAt(0).toUpperCase()}
												</div>
											)}
											<p className="font-medium text-gray-100 text-sm">
												{detail.owner.name || detail.owner.username}
											</p>
										</Link>
									</div>
								) : null}

								<div className="flex items-center">
									<span className="w-24 text-gray-400">建立於:</span>
									<span className="text-gray-300">
										{new Date(detail.createdAt).toLocaleDateString("zh-TW")}
									</span>
								</div>

								{detail.website ? (
									<div className="flex items-center">
										<span className="w-24 text-gray-400">網站:</span>
										<a
											href={detail.website}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center text-[#5865f2] hover:underline"
										>
											<Globe size={14} className="mr-1" />
											<span>訪問網站</span>
										</a>
									</div>
								) : null}
							</div>
						</div>

						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-3 font-semibold text-lg">評分此伺服器</h3>
							<p className="mb-4 text-gray-300 text-sm">
								給它一個分數，幫助其他人快速判斷這個伺服器是否適合加入。
							</p>
							<div className="mb-4 rounded-lg bg-[#36393f] p-4">
								<div className="flex items-center justify-between">
									<span className="text-gray-300">平均評分</span>
									<div className="flex items-center text-[#ffd700]">
										<Star size={16} className="mr-1 fill-current" />
										<span className="font-bold">
											{detail.currentRating.toFixed(1)}
										</span>
										<span className="ml-2 text-gray-400 text-xs">
											({detail.totalReviews} 人評分)
										</span>
									</div>
								</div>
							</div>
							<div className="flex justify-center gap-1">
								{[1, 2, 3, 4, 5].map((value) => (
									<button
										key={value}
										type="button"
										onClick={() => {
											if (!ensureSignedIn()) return;
											rateMutation.mutate(value);
										}}
										disabled={rateMutation.isPending}
										className="rounded p-1 text-[#ffd700] transition hover:scale-110"
									>
										<Star
											className={`h-8 w-8 ${detail.userRating >= value ? "fill-current" : ""}`}
										/>
									</button>
								))}
							</div>
							<p className="mt-2 text-center text-gray-400 text-xs">
								{isSignedIn ? "點擊星星即可更新你的評分" : "登入後可評分"}
							</p>
						</div>

						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-3 font-semibold text-lg">支持此伺服器</h3>
							<p className="mb-4 text-gray-300 text-sm">
								每 12 小時可投一次票，幫助這個伺服器獲得更多曝光。
							</p>
							<div className="mb-4 rounded-lg bg-[#36393f] p-4">
								<div className="flex items-center justify-between">
									<span className="text-gray-300">當前票數</span>
									<div className="flex items-center text-[#5865f2]">
										<ArrowUp size={16} className="mr-1" />
										<span className="font-bold">
											{detail.upvotes.toLocaleString()}
										</span>
									</div>
								</div>
							</div>
							<Button
								onClick={() => {
									if (!ensureSignedIn()) return;
									voteMutation.mutate();
								}}
								disabled={voteMutation.isPending || detail.hasVotedRecently}
								className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
							>
								{detail.hasVotedRecently ? "稍後可再投票" : "投票"}
							</Button>
							<p className="mt-2 text-center text-gray-400 text-xs">
								{detail.nextVoteAt
									? `下次可投票時間：${new Date(detail.nextVoteAt).toLocaleString("zh-TW")}`
									: "每 12 小時可投一次票"}
							</p>
						</div>

						<div className="rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 font-semibold text-lg">相關伺服器</h3>
							<div className="space-y-3">
								{detail.relatedServers.length ? (
									detail.relatedServers.map((relatedServer) => (
										<Link
											key={relatedServer.id}
											to="/servers/$serverId"
											params={{ serverId: relatedServer.id }}
											className="flex items-center rounded p-2 transition-colors hover:bg-[#36393f]"
										>
											<div className="mr-3 h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
												<OptimizedImage
													src={relatedServer.icon}
													fallbackSrc="https://cdn.discordapp.com/embed/avatars/0.png"
													alt={relatedServer.name}
													width={64}
													height={64}
													className="h-full w-full object-cover"
												/>
											</div>
											<div>
												<div className="font-medium">{relatedServer.name}</div>
												<div className="flex items-center text-gray-400 text-xs">
													<Users size={12} className="mr-1" />
													{relatedServer.members.toLocaleString()} 成員
												</div>
											</div>
										</Link>
									))
								) : (
									<p className="text-gray-400 text-sm">暫無相關伺服器</p>
								)}
							</div>
						</div>
					</div>

					<div className="lg:col-span-3">
						<Tabs
							value={activeTab}
							onValueChange={handleTabChange}
							className="mb-8"
						>
							<TabsList className="h-full w-full overflow-hidden border-[#1e1f22] border-b bg-[#2b2d31]">
								<TabsTrigger
									value="about"
									className="data-[state=active]:bg-[#36393f]"
								>
									關於伺服器
								</TabsTrigger>
								<TabsTrigger
									value="rules"
									className="data-[state=active]:bg-[#36393f]"
								>
									規則
								</TabsTrigger>
								<TabsTrigger
									value="screenshots"
									className="data-[state=active]:bg-[#36393f]"
								>
									截圖
								</TabsTrigger>
							</TabsList>

							<TabsContent value="about" className="mt-6">
								<div className="rounded-lg bg-[#2b2d31] p-6">
									<h2 className="mb-4 font-bold text-xl">伺服器介紹</h2>
									<div className="prose prose-invert wrap-break-word max-w-none text-gray-300">
										<MarkdownRenderer
											content={
												detail.longDescription?.trim() ||
												detail.description ||
												"暫無介紹"
											}
										/>
									</div>

									{detail.features.length > 0 ? (
										<div className="mt-8">
											<h3 className="mb-3 font-semibold text-lg">伺服器特色</h3>
											<ul className="space-y-2 text-gray-300">
												{detail.features.map((feature) => (
													<li key={feature} className="flex items-start">
														<span className="mr-2 text-[#5865f2]">•</span>
														<span>{feature}</span>
													</li>
												))}
											</ul>
										</div>
									) : null}
								</div>
							</TabsContent>

							<TabsContent value="rules" className="mt-6">
								<div className="rounded-lg bg-[#2b2d31] p-6">
									<h2 className="mb-4 font-bold text-xl">伺服器規則</h2>
									{detail.rules.length > 0 ? (
										<ol className="list-decimal space-y-2 pl-6 text-gray-300">
											{detail.rules.map((rule) => (
												<li key={rule}>{rule}</li>
											))}
										</ol>
									) : (
										<p className="text-gray-400">此伺服器尚未提供規則。</p>
									)}
								</div>
							</TabsContent>

							<TabsContent value="screenshots" className="mt-6">
								<div className="rounded-lg bg-[#2b2d31] p-6">
									<h2 className="mb-4 font-bold text-xl">伺服器截圖</h2>
									{detail.screenshots.length > 0 ? (
										<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
											{detail.screenshots.map((screenshot, index) => (
												<div
													key={screenshot}
													className="overflow-hidden rounded-lg bg-[#36393f]"
												>
													<OptimizedImage
														src={screenshot}
														alt={`${detail.name} screenshot ${index + 1}`}
														width={800}
														height={450}
														className="h-auto w-full"
													/>
												</div>
											))}
										</div>
									) : (
										<p className="text-gray-400">此伺服器尚未提供截圖。</p>
									)}
								</div>
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</div>
		</div>
	);
}
