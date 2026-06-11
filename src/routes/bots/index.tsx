import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Search } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";

const Pagination = lazy(() => import("#/components/feedback/Pagination"));
const BotList = lazy(() => import("#/features/bots/components/bot-list"));
const LazyCategorySearch = lazy(
	() => import("#/features/servers/components/category-search"),
);
const LazyMobileCategoryFilter = lazy(
	() => import("#/features/servers/components/mobile-category-filter"),
);
const LazyBotsAddCta = lazy(
	() => import("#/features/bots/components/bots-add-cta"),
);

import { motion } from "framer-motion";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	botFilterBundleQueryOptions,
	botsListQueryOptions,
} from "#/features/bots/bots.query";
import type { BotHomeSearch } from "#/features/bots/bots.schemas";
import type { BotCategory } from "#/features/bots/bots.types";
import {
	filterBotsBySearch,
	ITEMS_PER_PAGE,
	paginateBots,
	sortBotsByCategory,
} from "#/features/bots/bots.utils";
import { botCategories } from "#/lib/categories";
import type { CategoryType } from "#/lib/types";

// ─── 分類設定：單一來源，TabsTrigger / label / prefetch 全部從這裡取 ────────────
const DEFAULT_CATEGORY: BotCategory = "popular";

const BOT_CATEGORY_CONFIG = [
	{ id: "popular" as BotCategory, label: "熱門機器人" },
	{ id: "featured" as BotCategory, label: "精選機器人" },
	{ id: "new" as BotCategory, label: "最新機器人" },
	{ id: "verified" as BotCategory, label: "已驗證機器人" },
	{ id: "voted" as BotCategory, label: "票選機器人" },
] as const;

const BOT_CATEGORIES = BOT_CATEGORY_CONFIG.map((c) => c.id) as BotCategory[];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseBotCategory(value: unknown): BotCategory | undefined {
	if (typeof value !== "string") return undefined;
	return BOT_CATEGORIES.includes(value as BotCategory)
		? (value as BotCategory)
		: undefined;
}

function parsePositiveIntLike(value: unknown): number | undefined {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;

	if (!Number.isInteger(parsed) || parsed < 1) return undefined;
	return parsed;
}

const siteUrl =
	(typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
	"https://dchubs.org";

function validateSearch(search: Record<string, unknown>): BotHomeSearch {
	const tab = parseBotCategory(search.tab);
	const page = parsePositiveIntLike(search.page);

	return {
		...(tab ? { tab } : {}),
		...(page !== undefined ? { page } : {}),
		...(typeof search.search === "string" ? { search: search.search } : {}),
		...(typeof search.categories === "string"
			? { categories: search.categories }
			: {}),
		...(typeof search.redirect === "string"
			? { redirect: search.redirect }
			: {}),
	};
}

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/bots/")({
	validateSearch,

	loaderDeps: ({ search }) => ({
		category: (search.tab ?? DEFAULT_CATEGORY) as BotCategory,
		page: search.page ?? 1,
		// 把原始的 tab 也傳進去，方便後續組裝 URL
		rawTab: search.tab,
	}),

	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(
			botsListQueryOptions({
				category: deps.category,
				page: deps.page,
				limit: ITEMS_PER_PAGE,
			}),
		);
		void context.queryClient.prefetchQuery(botFilterBundleQueryOptions());

		// ⭐ 在這裡回傳 deps，讓 head 可以透過 loaderData 取得
		return {
			searchData: deps,
		};
	},
	head: ({ loaderData }) => {
		if (!loaderData) {
			return {
				meta: [
					{ title: "熱門機器人 | DiscordHub" },
					{
						name: "description",
						content:
							"在 DiscordHub 探索數百個功能豐富的機器人，為您的伺服器增添更多功能和樂趣。",
					},
				],
			};
		}
		const { category, page, rawTab } = loaderData.searchData;

		const categoryLabel =
			BOT_CATEGORY_CONFIG.find((c) => c.id === category)?.label ??
			"Discord 機器人";

		const title = `發現最棒的${categoryLabel} | DiscordHub`;
		const description = `在 DiscordHub 探索數百個功能豐富的${categoryLabel}機器人，為您的伺服器增添更多功能和樂趣。尋找最適合您的社群工具。`;

		// 使用 rawTab 與 page 組裝網址
		const currentUrl = `${siteUrl}/bots${rawTab ? `?tab=${rawTab}` : ""}${page > 1 ? `&page=${page}` : ""}`;
		const canonicalUrl = `${siteUrl}/bots${rawTab ? `?tab=${rawTab}` : ""}`;
		const ogImage =
			"https://gallery.dawngs.top/api/v1/buckets/image/objects/download?preview=true&prefix=nuo_dchub_2.png";

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				// Open Graph
				{ property: "og:site_name", content: "DiscordHub" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:image", content: ogImage },
				{ property: "og:type", content: "website" },
				{ property: "og:url", content: currentUrl },
				// Twitter Card
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: ogImage },
			],
			links: [{ rel: "canonical", href: canonicalUrl }],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify({
						"@context": "https://schema.org",
						"@type": "CollectionPage",
						name: title,
						description: description,
						url: currentUrl,
						isPartOf: {
							"@type": "WebSite",
							name: "DiscordHub",
							url: siteUrl,
						},
					}),
				},
			],
			staticData: { breadcrumb: title },
		};
	},
	component: BotsPage,
});

// ─── BotTabTrigger ────────────────────────────────────────────────────────────
// 抽出獨立元件後，5 個 TabsTrigger 的重複結構消失，
// 並在 onMouseEnter 時統一觸發 prefetch
type BotTabTriggerProps = {
	category: BotCategory;
	label: string;
	activeTab: BotCategory;
	isPending: boolean;
	onHover: (category: BotCategory) => void;
};

function BotTabTrigger({
	category,
	label,
	activeTab,
	isPending,
	onHover,
}: BotTabTriggerProps) {
	return (
		<TabsTrigger
			value={category}
			disabled={isPending}
			onMouseEnter={() => onHover(category)}
			className="relative z-10 bg-transparent transition-none data-[state=active]:bg-transparent data-[state=active]:text-white"
		>
			<span className="relative z-20">{label}</span>
			{activeTab === category && (
				<motion.div
					layoutId="robot-tabs-indicator"
					className="absolute inset-0 z-10 rounded-md bg-[#36393f]"
					transition={{ type: "spring", stiffness: 380, damping: 30 }}
				/>
			)}
		</TabsTrigger>
	);
}

// ─── BotsPage ─────────────────────────────────────────────────────────────────
function BotsPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	const [isPending, startTransition] = useTransition();

	const activeTab = (search.tab ?? DEFAULT_CATEGORY) as BotCategory;
	const currentPage = search.page ?? 1;
	const searchQuery = search.search ?? "";

	const selectedCategoryIds = useMemo(() => {
		if (!search.categories) return [];
		return search.categories
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	}, [search.categories]);

	const [isComposing, setIsComposing] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const [customCategories, setCustomCategories] = useState<CategoryType[]>([]);

	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

	// botList：loader 保證 ensureQueryData，這裡不會真正 suspend
	const botList = useSuspenseQuery(
		botsListQueryOptions({
			category: activeTab,
			page: currentPage,
			limit: ITEMS_PER_PAGE,
		}),
	);

	// filterBundle：loader 改為 fire-and-forget，改用 useQuery 配合 optional chaining
	// 快取命中時立即同步取得，尚未載入時為 undefined（各消費端有安全 fallback）
	const filterBundle = useQuery(botFilterBundleQueryOptions());

	const mergedCategories = useMemo(() => {
		const map = new Map<string, CategoryType>();
		// 用來記錄已經載入的「標籤名稱」，避免 API 抓到重複名稱的標籤
		const nameSet = new Set<string>();

		// [區塊 A] 預設機器人標籤
		const formattedBotCategories = botCategories.map((c) => ({
			...c,
			id: `bot-${c.id}`,
		}));

		for (const item of formattedBotCategories) {
			map.set(item.id, item);
			nameSet.add(item.name.toLowerCase()); // 登記名稱
		}

		// [區塊 B] 載入來自 API 的其他機器人歷史標籤
		for (const item of filterBundle.data?.categories ?? []) {
			const nameKey = item.name.toLowerCase();
			// 只有當預設標籤裡「沒有」這個名字時，才把它加進來 (歸類到自訂)
			if (!nameSet.has(nameKey)) {
				map.set(item.id, item);
				nameSet.add(nameKey);
			}
		}

		// [區塊 C] 載入使用者剛剛手動新增的自訂標籤
		for (const item of customCategories) {
			const nameKey = item.name.toLowerCase();
			if (!nameSet.has(nameKey)) {
				map.set(item.id, item);
				nameSet.add(nameKey);
			}
		}

		return [...map.values()];
	}, [filterBundle.data?.categories, customCategories]);

	const useClientSideFiltering = Boolean(
		searchQuery.trim() || selectedCategoryIds.length,
	);

	const clientFiltered = useMemo(() => {
		if (!useClientSideFiltering) return [];

		let filtered = filterBundle.data?.allBots ?? [];

		if (selectedCategoryIds.length > 0) {
			const selectedNames = mergedCategories
				.filter((item) => selectedCategoryIds.includes(item.id))
				.map((item) => item.name.toLowerCase());

			filtered = filtered.filter((item) =>
				item.tags.some((tag) =>
					selectedNames.some((name) => tag.toLowerCase().includes(name)),
				),
			);
		}

		return filterBotsBySearch(
			sortBotsByCategory(filtered, activeTab),
			searchQuery,
		);
	}, [
		useClientSideFiltering,
		filterBundle.data?.allBots,
		selectedCategoryIds,
		mergedCategories,
		activeTab,
		searchQuery,
	]);

	const displayData = useMemo(() => {
		if (useClientSideFiltering) {
			return paginateBots(clientFiltered, currentPage, ITEMS_PER_PAGE);
		}
		return {
			bots: botList.data.bots,
			total: botList.data.total,
			totalPages: botList.data.totalPages,
			page: botList.data.page,
		};
	}, [useClientSideFiltering, clientFiltered, currentPage, botList.data]);

	const updateSearch = useCallback(
		(patch: Partial<BotHomeSearch>, options?: { resetScroll?: boolean }) => {
			startTransition(() => {
				navigate({
					to: "/bots",
					replace: true,
					resetScroll: options?.resetScroll,
					search: (previous) => {
						const next = { ...previous, ...patch };
						return {
							tab: next.tab,
							page: next.page,
							search: next.search,
							categories: next.categories,
							redirect: next.redirect,
						};
					},
				});
			});
		},
		[navigate],
	);

	// 游標移入非 active tab 時，預先 prefetch 該 tab 第 1 頁資料
	// 點擊時快取已就緒，切換體感近乎即時
	const handleTabMouseEnter = useCallback(
		(category: BotCategory) => {
			if (category === activeTab) return;
			void queryClient.prefetchQuery(
				botsListQueryOptions({ category, page: 1, limit: ITEMS_PER_PAGE }),
			);
		},
		[queryClient, activeTab],
	);

	const handlePageChange = useCallback(
		(page: number) => {
			const prefersReducedMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;

			window.requestAnimationFrame(() => {
				window.scrollTo({
					top: 0,
					behavior: prefersReducedMotion ? "auto" : "smooth",
				});
			});

			updateSearch({ page }, { resetScroll: false });
		},
		[updateSearch],
	);

	const handleTabChange = useCallback(
		(value: string) => {
			const parsed = parseBotCategory(value);
			if (!parsed) return;
			// useTransition 的 isPending 會立即為 true，無需額外的 isSearching state
			updateSearch({ tab: parsed, page: 1 });
		},
		[updateSearch],
	);

	const commitSearch = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			updateSearch({ search: trimmed || undefined, page: 1 });
		},
		[updateSearch],
	);

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const value = event.target.value;
			setInputValue(value);
			if (!isComposing) commitSearch(value);
		},
		[commitSearch, isComposing],
	);

	// 5. 處理標籤選擇變更 (更新網址)
	const handleCategoryChange = useCallback(
		(ids: string[]) => {
			updateSearch({
				categories: ids.length ? ids.join(",") : undefined,
				page: 1,
			});
		},
		[updateSearch],
	);

	const handleAddCustomCategory = useCallback(
		(categoryName: string) => {
			// 檢查是否已經有同名的標籤 (不分大小寫)
			if (
				mergedCategories.some(
					(item) => item.name.toLowerCase() === categoryName.toLowerCase(),
				)
			) {
				return;
			}

			// 建立新標籤
			const nextCategory: CategoryType = {
				id: `custom-${Date.now()}`,
				name: categoryName,
				color: "bg-sky-500",
			};

			// 更新狀態，並自動將新標籤設為選取狀態
			setCustomCategories((previous) => [...previous, nextCategory]);
			handleCategoryChange([...selectedCategoryIds, nextCategory.id]);
		},
		[mergedCategories, handleCategoryChange, selectedCategoryIds],
	);

	const activeCategoryLabel =
		BOT_CATEGORY_CONFIG.find((c) => c.id === activeTab)?.label ?? "";

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			<div className="relative overflow-hidden bg-linear-to-br from-[#5865f2] to-[#8c54ff] py-16">
				<div className="absolute inset-0 opacity-10">
					<svg
						className="h-full w-full"
						viewBox="0 0 800 800"
						aria-hidden="true"
					>
						<defs>
							<pattern
								id="grid"
								width="40"
								height="40"
								patternUnits="userSpaceOnUse"
							>
								<path
									d="M 40 0 L 0 0 0 40"
									fill="none"
									stroke="white"
									strokeWidth="1"
								/>
							</pattern>
						</defs>
						<rect width="800" height="800" fill="url(#grid)" />
					</svg>
				</div>

				<div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<h1 className="mb-4 font-bold text-4xl text-white md:text-5xl">
						發現最棒的 Discord 機器人
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-white/80 text-xl">
						探索數百個功能豐富的機器人，為您的伺服器增添更多功能和樂趣。
					</p>

					<div className="relative mx-auto max-w-2xl">
						<Input
							placeholder="搜尋機器人名稱、標籤或描述..."
							className="w-full border-white/20 bg-white/10 py-6 pl-10 text-white placeholder:text-white/60"
							value={inputValue}
							onChange={handleSearchChange}
							onCompositionStart={() => setIsComposing(true)}
							onCompositionEnd={(event) => {
								setIsComposing(false);
								commitSearch(event.currentTarget.value);
							}}
						/>
						<Search
							className="absolute top-1/2 left-3 -translate-y-1/2 text-white/60"
							size={20}
						/>
						{isPending && (
							<div className="absolute top-1/2 right-3 -translate-y-1/2">
								<div className="h-5 w-5 animate-spin rounded-full border-white border-b-2" />
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-312 space-y-6">
					<div className="relative mt-6 h-32 overflow-hidden rounded-xl border border-white/10 bg-[#1e1f22] sm:h-48 md:h-70">
						<a
							href="https://nuorpg.com/"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Image
								src="https://gallery.dawngs.top/api/v1/buckets/image/objects/download?preview=true&prefix=nuo_dchub_2.png"
								alt="機器人活動宣傳"
								width={1280}
								height={480}
								className="h-full w-full object-cover"
								loading="eager"
							/>
						</a>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-7xl px-4 py-8">
				<div className="mb-6 lg:hidden">
					<Suspense
						fallback={
							<div className="h-14 rounded-lg border border-white/10 bg-[#2b2d31]" />
						}
					>
						<LazyMobileCategoryFilter
							categories={mergedCategories}
							selectedCategoryIds={selectedCategoryIds}
							onCategoryChange={handleCategoryChange}
							onCustomCategoryAdd={handleAddCustomCategory}
						/>
					</Suspense>
				</div>

				<div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
					<div className="order-2 lg:order-1 lg:col-span-3">
						{useClientSideFiltering && (
							<div className="mb-4 rounded-lg bg-[#2b2d31] p-3 text-gray-300 text-sm">
								{searchQuery && <span>搜尋「{searchQuery}」</span>}
								{selectedCategoryIds.length > 0 && (
									<span>
										{searchQuery && " · "}已選擇 {selectedCategoryIds.length}{" "}
										個分類
									</span>
								)}
								<span className="ml-2">找到 {displayData.total} 個結果</span>
							</div>
						)}

						<Tabs
							className="mb-8"
							value={activeTab}
							onValueChange={handleTabChange}
						>
							<TabsList className="relative h-full w-full border-b border-[#1e1f22] bg-[#2b2d31] p-1">
								{BOT_CATEGORY_CONFIG.map(({ id, label }) => (
									<BotTabTrigger
										key={id}
										category={id}
										label={label}
										activeTab={activeTab}
										isPending={isPending}
										onHover={handleTabMouseEnter}
									/>
								))}
							</TabsList>

							{/*
							 * 單一動態 TabsContent：value 永遠 === activeTab，
							 * 所以 Radix 永遠顯示它，React 只 reconcile 一份結構。
							 * 切換 tab 時內容（label / bots）靠 prop 更新，不觸發 unmount。
							 */}
							<TabsContent value={activeTab} className="mt-6">
								<div className="mb-4 flex items-center justify-between">
									<h2 className="font-bold text-2xl">{activeCategoryLabel}</h2>
									{/* 直接顯示分頁資訊，如果資料尚未備妥，整個區塊會被外層 Suspense 替換，不用擔心出錯 */}
									{displayData.total > 0 && (
										<div className="text-gray-400 text-sm">
											第 {displayData.page} 頁，共 {displayData.totalPages} 頁
										</div>
									)}
								</div>

								{/* 將原本的 BotList 骨架屏放到 fallback 中 */}
								<Suspense
									fallback={
										<BotList
											bots={[]}
											isLoading={true}
											skeletonCount={ITEMS_PER_PAGE}
										/>
									}
								>
									{/* 這裡的 BotList 保證一定有資料才會渲染，所以不需要傳 isLoading 了 */}
									<BotList
										bots={displayData.bots}
										isLoading={false}
										skeletonCount={ITEMS_PER_PAGE}
									/>
								</Suspense>

								{displayData.totalPages > 1 && (
									<div className="mt-6">
										<Suspense
											fallback={
												<div className="h-10 rounded-md bg-[#1f2125]" />
											}
										>
											<Pagination
												currentPage={displayData.page}
												totalPages={displayData.totalPages}
												onPageChange={handlePageChange}
											/>
										</Suspense>
									</div>
								)}
							</TabsContent>
						</Tabs>
					</div>

					<div className="order-1 hidden lg:order-2 lg:col-span-1 lg:block">
						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 font-semibold text-lg">分類</h3>
							<Suspense
								fallback={<div className="h-10 rounded-md bg-[#1f2125]" />}
							>
								<LazyCategorySearch
									categories={mergedCategories}
									selectedCategoryIds={selectedCategoryIds}
									onCategoryChange={handleCategoryChange}
									onCustomCategoryAdd={handleAddCustomCategory}
								/>
							</Suspense>
						</div>

						<div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
							<h3 className="mb-4 font-semibold text-lg">機器人統計</h3>
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<span className="text-gray-300">總機器人數</span>
									<span className="font-medium">
										{filterBundle.data?.stats.totalBots ?? 0}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-gray-300">已驗證機器人</span>
									<span className="font-medium">
										{filterBundle.data?.stats.verifiedBots ?? 0}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-gray-300">目前已使用分類數</span>
									<span className="font-medium">
										{filterBundle.data?.stats.totalTags ?? 0}
									</span>
								</div>
							</div>
						</div>

						<Suspense
							fallback={<div className="h-44 rounded-lg bg-[#2b2d31]" />}
						>
							<LazyBotsAddCta />
						</Suspense>
					</div>
				</div>

				<div className="mt-8 lg:hidden">
					<Suspense fallback={<div className="h-40 rounded-lg bg-[#2b2d31]" />}>
						<LazyBotsAddCta mobile />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
