import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowUp,
	Clock,
	Flag,
	Globe,
	Heart,
	Star,
	Terminal,
	Users,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { FaCheck, FaDiscord } from "react-icons/fa6";
import { toast } from "react-toastify";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import NotFound from "#/components/notFound";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import {
	rateBotFn,
	reportBotFn,
	voteBotFn,
} from "#/features/bots/bot-detail.functions.ts";
import { botDetailQueryOptions } from "#/features/bots/bot-detail.query";
import type { BotDetailSearch } from "#/features/bots/bot-detail.schemas";
import type {
	BotDetail,
	BotDetailTab,
	BotReview,
} from "#/features/bots/bot-detail.types";
import BotLoading from "#/features/bots/components/bot-loading";
import { toggleFavoriteFn } from "#/features/users/users.functions";
import { signIn, useSession } from "#/lib/auth-client";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";

const DEFAULT_BOT_ICON_URL = "https://cdn.discordapp.com/embed/avatars/0.png";
const BOT_DETAIL_TABS: readonly BotDetailTab[] = [
	"about",
	"commands",
	"screenshots",
];
const siteUrl =
	(typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
	"https://dchubs.org";

const STAR_RATINGS = [1, 2, 3, 4, 5] as const;

function createBotMetaTitle(detail: BotDetail): string {
	const tagLabel = detail.tags.slice(0, 2).join(" / ");
	if (!tagLabel) {
		return `${detail.name} Discord 機器人 | DiscordHubs`;
	}

	return `${detail.name} - ${tagLabel} Discord 機器人 | DiscordHubs`;
}

function createBotHead(detail: BotDetail | null, botId: string) {
	// ... 原本的 meta 生成邏輯完全保留 ...
	if (!detail) {
		const fallbackTitle = "找不到機器人 | DiscordHubs";
		const fallbackDescription =
			"此機器人可能不存在或尚未通過審核，請返回列表探索更多 Discord 機器人。";
		const fallbackCanonical = new URL(`/bots/${botId}`, siteUrl).toString();
		const fallbackImage = new URL("/dchub.png", siteUrl).toString();

		return {
			meta: [
				{ title: fallbackTitle },
				{ name: "description", content: fallbackDescription },
				{ property: "og:title", content: fallbackTitle },
				{ property: "og:description", content: fallbackDescription },
				{ property: "og:url", content: fallbackCanonical },
				{ property: "og:site_name", content: "DiscordHubs" },
				{ property: "og:image", content: fallbackImage },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: fallbackTitle },
				{ name: "twitter:description", content: fallbackDescription },
				{ name: "twitter:image", content: fallbackImage },
			],
			links: [{ rel: "canonical", href: fallbackCanonical }],
		};
	}

	const metaTitle = createBotMetaTitle(detail);
	const metaDescription = detail.description;
	const canonicalUrl = new URL(`/bots/${detail.id}`, siteUrl).toString();

	const isDefaultIcon = !detail.icon || detail.icon === DEFAULT_BOT_ICON_URL;
	const hasCustomIcon = Boolean(detail.icon) && !isDefaultIcon;
	const hasBanner = Boolean(detail.banner);

	const botJsonLd = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: detail.name,
		applicationCategory: "SocialNetworkingApplication",
		description: detail.description,
		url: new URL(`/bots/${detail.id}`, siteUrl).toString(),
		image: detail.icon || DEFAULT_BOT_ICON_URL,
		interactionStatistic: [
			{
				"@type": "InteractionCounter",
				interactionType: {
					"@type": "LikeAction",
				},
				userInteractionCount: detail.upvotes,
			},
			{
				"@type": "InteractionCounter",
				interactionType: {
					"@type": "UseAction",
				},
				userInteractionCount: detail.servers,
			},
		],
	}).replace(/</g, "\\u003c");

	let previewImage: string | undefined;
	let twitterCard: "summary" | "summary_large_image" = "summary";

	if (hasCustomIcon) {
		previewImage = detail.icon ?? undefined;
		twitterCard = "summary";
	} else if (hasBanner) {
		previewImage = detail.banner ?? undefined;
		twitterCard = "summary_large_image";
	}

	const ogImage = previewImage ?? new URL("/dchub.png", siteUrl).toString();

	return {
		meta: [
			{ title: metaTitle },
			{ name: "description", content: metaDescription },
			{ name: "keywords", content: detail.tags.join("，") },
			{ property: "og:title", content: metaTitle },
			{ property: "og:description", content: metaDescription },
			{ property: "og:url", content: canonicalUrl },
			{ property: "og:site_name", content: "DiscordHubs" },
			{ property: "og:image", content: ogImage },
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: twitterCard },
			{ name: "twitter:title", content: metaTitle },
			{ name: "twitter:description", content: metaDescription },
			{ name: "twitter:image", content: ogImage },
			{ name: "twitter:url", content: canonicalUrl },
		],
		links: [{ rel: "canonical", href: canonicalUrl }],
		scripts: [
			{
				type: "application/ld+json",
				children: botJsonLd,
			},
		],
	};
}

function validateSearch(search: Record<string, unknown>): BotDetailSearch {
	const tab =
		typeof search.tab === "string" &&
		BOT_DETAIL_TABS.includes(search.tab as BotDetailTab)
			? (search.tab as BotDetailTab)
			: undefined;

	return tab ? { tab } : {};
}

export const Route = createFileRoute("/bots/$botId")({
	validateSearch,
	head: ({ loaderData, params }) => {
		const detail =
			(loaderData as { detail: BotDetail | null } | undefined)?.detail ?? null;
		return createBotHead(detail, params.botId);
	},
	loader: async ({ context, params }) => {
		const detail = await context.queryClient.ensureQueryData(
			botDetailQueryOptions(params.botId),
		);
		return { detail };
	},
	component: BotDetailPage,
	pendingComponent: BotLoading,
	notFoundComponent: () => NotFound(),
});

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

function calculateAvgRating(reviewList: BotReview[]): number {
	if (!reviewList.length) return 0;
	const sum = reviewList.reduce((total, item) => total + item.rating, 0);
	return Number((sum / reviewList.length).toFixed(2));
}

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

function setFeedbackMessage(message: string) {
	toast.success(message);
}

// 將檢舉表單獨立抽離為 Memo 元件，避免在輸入打字時造成整個 BotDetailPage（包含 MarkdownRenderer）重新渲染
const ReportBotForm = memo(
	({
		botId,
		itemName,
		isSignedIn,
		onSignIn,
		onCancel,
	}: {
		botId: string;
		itemName: string;
		isSignedIn: boolean;
		onSignIn: () => void;
		onCancel: () => void;
	}) => {
		const [subject, setSubject] = useState("");
		const [content, setContent] = useState("");

		const reportMutation = useMutation({
			meta: { suppressErrorAlert: true },
			mutationFn: (payload: { subject: string; content: string }) =>
				runEffect(
					tryEffectPromise("Failed to submit report", () =>
						reportBotFn({
							data: {
								botId,
								itemName,
								subject: payload.subject,
								content: payload.content,
							},
						}),
					),
				),
			onError: (error) => {
				showErrorAlert(error, "檢舉失敗");
			},
			onSuccess: (result) => {
				setFeedbackMessage(result.message);
				setSubject("");
				setContent("");
				onCancel();
			},
		});

		const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!isSignedIn) {
				onSignIn();
				return;
			}
			reportMutation.mutate({
				subject: subject.trim(),
				content: content.trim(),
			});
		};

		return (
			<form
				onSubmit={handleSubmit}
				className="mb-6 rounded-xl border border-white/10 bg-[#2b2d31] p-4"
			>
				<div className="mb-3 text-sm text-gray-300">提交機器人檢舉</div>
				<div className="grid gap-3">
					<Input
						value={subject}
						onChange={(event) => setSubject(event.target.value)}
						placeholder="檢舉主旨"
						required
						maxLength={120}
					/>
					<Textarea
						value={content}
						onChange={(event) => setContent(event.target.value)}
						placeholder="請描述檢舉內容"
						required
						maxLength={2000}
						className="min-h-28"
					/>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" onClick={onCancel}>
							取消
						</Button>
						<Button type="submit" disabled={reportMutation.isPending}>
							送出檢舉
						</Button>
					</div>
				</div>
			</form>
		);
	},
);

function BotDetailPage() {
	const { botId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { data: session } = useSession();

	const { data: detailData } = useSuspenseQuery(botDetailQueryOptions(botId));

	if (!detailData) {
		throw notFound();
	}

	const detail = detailData!;

	const [isReportOpen, setIsReportOpen] = useState(false);

	const activeTab = (search.tab ?? "about") as BotDetailTab;
	const sessionUserId = getSessionUserId(session);
	const isSignedIn = Boolean(sessionUserId);

	const detailQueryKey = useMemo(() => queryKeys.bots.detail(botId), [botId]);

	const favoriteMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: () =>
			runEffect(
				tryEffectPromise("Failed to toggle favorite", () =>
					toggleFavoriteFn({
						data: {
							target: "bot",
							id: botId,
						},
					}),
				),
			),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData<BotDetail | null>(
				detailQueryKey,
			);
			queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
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
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
			await queryClient.invalidateQueries({ queryKey: queryKeys.bots.all });
		},
	});

	const voteMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: () =>
			runEffect(
				tryEffectPromise("Failed to vote bot", () =>
					voteBotFn({ data: { botId } }),
				),
			),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData<BotDetail | null>(
				detailQueryKey,
			);
			queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
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
		onSuccess: (result) => {
			queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
				if (!old) return old;
				return {
					...old,
					upvotes: result.upvotes,
					hasVotedRecently: result.success ? true : old.hasVotedRecently,
					nextVoteAt: result.nextVoteAt,
				};
			});
			setFeedbackMessage(result.message);
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
			await queryClient.invalidateQueries({ queryKey: queryKeys.bots.all });
		},
	});

	const rateMutation = useMutation({
		meta: { suppressErrorAlert: true },
		mutationFn: (rating: number) =>
			runEffect(
				tryEffectPromise("Failed to rate bot", () =>
					rateBotFn({ data: { botId, rating } }),
				),
			),
		onMutate: async (rating) => {
			await queryClient.cancelQueries({ queryKey: detailQueryKey });

			const previous = queryClient.getQueryData<BotDetail | null>(
				detailQueryKey,
			);
			if (!sessionUserId) return { previous };

			queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
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
						id: `temp-${sessionUserId}-${botId}`,
						createdAt: new Date().toISOString(),
						botId,
						rating,
						vote: 0,
						comment: null,
						userId: sessionUserId,
						serverId: null,
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
		onSuccess: (result) => {
			queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
				if (!old) return old;
				return {
					...old,
					currentRating: Number(result.averageRating.toFixed(2)),
					totalReviews: result.totalReviews,
					userRating: result.rating,
				};
			});
			setFeedbackMessage("評分已更新");
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: detailQueryKey });
		},
	});

	const handleTabChange = useCallback(
		(value: string) => {
			if (
				value !== "about" &&
				value !== "commands" &&
				value !== "screenshots"
			) {
				return;
			}

			navigate({
				search: (previous) => ({
					...previous,
					tab: value,
				}),
				replace: true,
			});
		},
		[navigate],
	);

	const handleSignIn = useCallback(() => {
		void signIn(window.location.href);
	}, []);

	const handleFavoriteClick = useCallback(() => {
		if (!isSignedIn) {
			handleSignIn();
			return;
		}
		favoriteMutation.mutate();
	}, [isSignedIn, handleSignIn, favoriteMutation]);

	const handleVoteClick = useCallback(() => {
		if (!isSignedIn) {
			handleSignIn();
			return;
		}
		voteMutation.mutate();
	}, [isSignedIn, handleSignIn, voteMutation]);

	const handleRateClick = useCallback(
		(rating: number) => {
			if (!isSignedIn) {
				handleSignIn();
				return;
			}
			rateMutation.mutate(rating);
		},
		[isSignedIn, handleSignIn, rateMutation],
	);

	return (
		<div className="min-h-screen bg-[#1e1f22] pb-16 text-white">
			<div className="relative h-52 overflow-hidden bg-[#36393f] md:h-64 lg:h-80">
				{detail.banner ? (
					<>
						<img
							src={detail.banner}
							alt={`${detail.name} banner`}
							className="h-full w-full object-cover"
							fetchPriority="high"
							decoding="async"
						/>
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
								<img
									src={detail.icon}
									alt={detail.name}
									className="h-full w-full object-cover"
									fetchPriority="high"
									decoding="async"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center bg-[#5865f2] text-3xl font-bold">
									{detail.name.charAt(0).toUpperCase()}
								</div>
							)}
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold md:text-3xl">
									{detail.name}
								</h1>
								{detail.verified && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge className="inline-flex cursor-default items-center gap-1 rounded-full bg-[#5865F2] px-3 text-sm text-white hover:bg-[#6571f1] hover:text-white">
													<FaCheck className="h-3.5 w-3.5" />
													驗證
												</Badge>
											</TooltipTrigger>
											<TooltipContent>已驗證的 Discord 機器人</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}

								{detail.isAdmin && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="cursor-pointer text-yellow-600 hover:text-yellow-500">
													<AlertTriangle className="h-5 w-5" />
												</div>
											</TooltipTrigger>
											<TooltipContent className="max-w-sm rounded-md border border-yellow-400 bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
												此機器人需要管理者權限，邀請前請先確認你信任此開發者。
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}
							</div>

							<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-300">
								<div className="flex items-center">
									<Users size={16} className="mr-1" />
									<span>{detail.servers.toLocaleString()} 伺服器</span>
								</div>
								<div className="flex items-center">
									<ArrowUp size={16} className="mr-1" />
									<span>{detail.upvotes.toLocaleString()} 投票</span>
								</div>
								{detail.prefix && (
									<div className="flex items-center">
										<Terminal size={16} className="mr-1" />
										<span className="rounded bg-[#36393f] px-1.5 py-0.5 font-mono text-xs">
											{detail.prefix}
										</span>
									</div>
								)}
								<div className="flex items-center">
									<Clock size={16} className="mr-1" />
									<span>{formatRelativeTime(detail.approvedAt)}</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6 flex flex-wrap gap-2">
					{detail.nsfw && (
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
					{detail.tags.slice(0, 5).map((tag) => (
						<Badge
							key={tag}
							variant="secondary"
							className="relative z-20 bg-[#36393f] hover:bg-[#4f545c] text-gray-300 cursor-default"
						>
							{tag}
						</Badge>
					))}
				</div>

				<div className="mb-4 mt-6 flex flex-wrap gap-3">
					<Button
						size="lg"
						onClick={() => {
							if (!detail.inviteUrl) return;
							window.open(detail.inviteUrl, "_blank", "noopener,noreferrer");
						}}
						disabled={!detail.inviteUrl}
						className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
					>
						邀請機器人
					</Button>

					<Button
						onClick={handleFavoriteClick}
						disabled={favoriteMutation.isPending}
						className={`flex items-center gap-2 px-6 py-5 rounded-md text-sm font-medium transition-all duration-150 transform hover:scale-105 cursor-pointer
                        ${
													detail.isFavorite
														? "bg-rose-500 hover:bg-rose-600"
														: "bg-indigo-500 hover:bg-indigo-600"
												}
                        text-white disabled:cursor-not-allowed `}
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
						className="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 transition-all duration-150 transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
					>
						<Flag className="h-4 w-4" />
						檢舉
					</Button>
				</div>

				{isReportOpen ? (
					<ReportBotForm
						botId={botId}
						itemName={detail.name}
						isSignedIn={isSignedIn}
						onSignIn={handleSignIn}
						onCancel={() => setIsReportOpen(false)}
					/>
				) : null}

				<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
					<div className="lg:col-span-1">
						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 text-lg font-semibold">機器人資訊</h3>
							<div className="space-y-4">
								{detail.developers.length > 0 ? (
									<div>
										<h4 className="mb-2 text-gray-400">開發者</h4>
										<div className="grid gap-2">
											{detail.developers.map((dev) => (
												<Link
													to="/users/$userId"
													params={{ userId: dev.id }}
													preload="intent"
													key={dev.id}
													className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/5 hover:cursor-pointer transition-colors"
												>
													{dev.avatar ? (
														<img
															src={dev.avatar}
															alt={`${dev.username} avatar`}
															loading="lazy"
															decoding="async"
															className="h-8 w-8 rounded-full object-cover"
														/>
													) : (
														<div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-sm font-semibold">
															{dev.username.charAt(0).toUpperCase()}
														</div>
													)}
													<p className="text-sm font-medium text-gray-100">
														{dev.username}
													</p>
												</Link>
											))}
										</div>
									</div>
								) : null}

								<div className="flex items-center">
									<span className="w-24 text-gray-400">上架於:</span>
									<span className="text-gray-300">
										{detail.approvedAt
											? new Date(detail.approvedAt).toLocaleDateString("zh-TW")
											: "未知"}
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

								{detail.supportServer ? (
									<div className="flex items-center">
										<span className="w-24 text-gray-400">支援伺服器:</span>
										<a
											href={detail.supportServer}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center text-[#5865f2] hover:underline"
										>
											<FaDiscord size={14} className="mr-1" />
											<span>加入支援伺服器</span>
										</a>
									</div>
								) : null}
							</div>
						</div>

						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-3 text-lg font-semibold">評分此機器人</h3>
							<p className="mb-4 text-sm text-gray-300">
								給它一個分數，幫助其他人快速判斷這台機器人是否適合使用。
							</p>
							<div className="mb-4 rounded-lg bg-[#36393f] p-4">
								<div className="flex items-center justify-between">
									<span className="text-gray-300">平均評分</span>
									<div className="flex items-center text-[#ffd700]">
										<Star size={16} className="mr-1 fill-current" />
										<span className="font-bold">
											{detail.currentRating.toFixed(1)}
										</span>
										<span className="ml-2 text-xs text-gray-400">
											({detail.totalReviews} 人評分)
										</span>
									</div>
								</div>
							</div>
							<div className="flex justify-center gap-1">
								{STAR_RATINGS.map((value) => (
									<button
										key={value}
										type="button"
										onClick={() => handleRateClick(value)}
										disabled={rateMutation.isPending}
										className="rounded p-1 text-[#ffd700] transition hover:scale-110"
									>
										<Star
											className={`h-8 w-8 ${detail.userRating >= value ? "fill-current" : ""}`}
										/>
									</button>
								))}
							</div>
							<p className="mt-2 text-center text-xs text-gray-400">
								{isSignedIn ? "點擊星星即可更新你的評分" : "登入後可評分"}
							</p>
						</div>

						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-3 text-lg font-semibold">支持此機器人</h3>
							<p className="mb-4 text-sm text-gray-300">
								每 12 小時可投一次票，幫助這台機器人獲得更多曝光。
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
								onClick={handleVoteClick}
								disabled={voteMutation.isPending || detail.hasVotedRecently}
								className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
							>
								{detail.hasVotedRecently ? "稍後可再投票" : "投票"}
							</Button>
							<p className="mt-2 text-center text-xs text-gray-400">
								{detail.nextVoteAt
									? `下次可投票時間：${new Date(detail.nextVoteAt).toLocaleString("zh-TW")}`
									: "每 12 小時可投一次票"}
							</p>
						</div>

						<div className="rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 text-lg font-semibold">相關機器人</h3>
							<div className="space-y-3">
								{detail.relatedBots.length ? (
									detail.relatedBots.map((relatedBot) => (
										<Link
											key={relatedBot.id}
											to="/bots/$botId"
											params={{ botId: relatedBot.id }}
											preload="intent"
											className="flex items-center rounded p-2 transition-colors hover:bg-[#36393f]"
										>
											<div className="mr-3 h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
												<img
													src={
														relatedBot.icon ??
														"https://cdn.discordapp.com/embed/avatars/0.png"
													}
													alt={relatedBot.name}
													loading="lazy"
													decoding="async"
													className="h-full w-full object-cover"
												/>
											</div>
											<div>
												<div className="font-medium">{relatedBot.name}</div>
												<div className="flex items-center text-xs text-gray-400">
													<Users size={12} className="mr-1" />
													<span>
														{relatedBot.servers.toLocaleString()} 伺服器
													</span>
												</div>
											</div>
										</Link>
									))
								) : (
									<p className="text-sm text-gray-400">暫無相關機器人</p>
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
							<TabsList className="h-full w-full overflow-hidden border-b border-[#1e1f22] bg-[#2b2d31]">
								<TabsTrigger
									value="about"
									className="data-[state=active]:bg-[#36393f]"
								>
									關於機器人
								</TabsTrigger>
								<TabsTrigger
									value="commands"
									className="data-[state=active]:bg-[#36393f]"
								>
									指令列表
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
									<h2 className="mb-4 text-xl font-bold">機器人介紹</h2>
									<div className="prose prose-invert max-w-none wrap-break-word text-gray-300">
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
											<h3 className="mb-3 text-lg font-semibold">機器人特色</h3>
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

							<TabsContent value="commands" className="mt-6">
								<div className="rounded-lg bg-[#2b2d31] p-6">
									<h2 className="mb-4 text-xl font-bold">指令列表</h2>
									{detail.commands.length > 0 ? (
										<div className="overflow-hidden">
											<table className="w-full text-left">
												<thead>
													<tr className="border-b border-[#1e1f22]">
														<th className="px-4 py-3 text-gray-300">指令</th>
														<th className="px-4 py-3 text-gray-300">描述</th>
														<th className="px-4 py-3 text-gray-300">用法</th>
														{detail.commands.some((cmd) => cmd.category) ? (
															<th className="px-4 py-3 text-gray-300">分類</th>
														) : null}
													</tr>
												</thead>
												<tbody>
													{detail.commands.map((command) => (
														<tr
															key={command.id}
															className="border-b border-[#1e1f22] hover:bg-[#36393f]"
														>
															<td className="px-4 py-3 font-mono text-[#5865f2]">
																{command.name}
															</td>
															<td className="px-4 py-3 text-gray-300">
																{command.description}
															</td>
															<td className="px-4 py-3 font-mono text-xs text-gray-400">
																{command.usage}
															</td>
															{detail.commands.some((cmd) => cmd.category) ? (
																<td className="px-4 py-3 text-gray-300">
																	{command.category ? (
																		<Badge
																			variant="outline"
																			className="rounded-2xl border-[#5865f2] bg-[#36393f]/50 px-2 py-1 text-xs text-gray-300"
																		>
																			{command.category}
																		</Badge>
																	) : null}
																</td>
															) : null}
														</tr>
													))}
												</tbody>
											</table>
										</div>
									) : (
										<p className="text-gray-400">此機器人尚未提供指令列表。</p>
									)}
								</div>
							</TabsContent>

							<TabsContent value="screenshots" className="mt-6">
								<div className="rounded-lg bg-[#2b2d31] p-6">
									<h2 className="mb-4 text-xl font-bold">機器人截圖</h2>
									{detail.screenshots.length > 0 ? (
										<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
											{detail.screenshots.map((screenshot, index) => (
												<div
													key={screenshot}
													className="overflow-hidden rounded-lg bg-[#36393f]"
												>
													<img
														src={screenshot}
														alt={`${detail.name} screenshot ${index + 1}`}
														loading="lazy"
														decoding="async"
														className="h-auto w-full"
													/>
												</div>
											))}
										</div>
									) : (
										<p className="text-gray-400">此機器人尚未提供截圖。</p>
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
