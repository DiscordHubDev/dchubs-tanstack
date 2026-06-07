import {
	dehydrate,
	HydrationBoundary,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import Pagination from "#/components/feedback/Pagination";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import ServerList from "#/features/servers/components/server-list";
import {
	serverFilterBundleQueryOptions,
	serversListQueryOptions,
} from "#/features/servers/servers.query";
import type { HomeSearch } from "#/features/servers/servers.schemas";
import type { ServerCategory } from "#/features/servers/servers.types";
import {
	filterServersBySearch,
	ITEMS_PER_PAGE,
	paginateServers,
	sortServersByCategory,
} from "#/features/servers/servers.utils";
import { signIn, useSession } from "#/lib/auth-client";
import type { CategoryType } from "#/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORY: ServerCategory = "popular";

const SERVER_CATEGORIES: readonly ServerCategory[] = [
	"popular",
	"featured",
	"new",
	"voted",
];

/** Display labels for each tab — defined once, used in both trigger & heading. */
const TAB_LABELS: Record<ServerCategory, string> = {
	popular: "熱門伺服器",
	featured: "精選伺服器",
	new: "最新伺服器",
	voted: "票選伺服器",
};

/**
 * Safe fallback used while the filter bundle hasn't been fetched yet.
 * Keeps downstream `useMemo`s stable without guarding every property access.
 */
const EMPTY_FILTER_BUNDLE = {
	categories: [] as CategoryType[],
	allServers: [] as ReturnType<typeof serverFilterBundleQueryOptions> extends {
		select: (d: infer D) => unknown;
	}
		? never
		: never[],
	stats: { totalServers: 0, featuredServers: 0, totalTags: 0 },
} as const;

// ─── Lazy-loaded sidebar / UI chunks ─────────────────────────────────────────

const LazyDiscordWidget = lazy(
	() => import("#/components/feedback/DiscordWidget"),
);
const LazyCategorySearch = lazy(
	() => import("#/features/servers/components/category-search"),
);
const LazyMobileCategoryFilter = lazy(
	() => import("#/features/servers/components/mobile-category-filter"),
);
const LazyHomeAddServerCta = lazy(
	() => import("#/features/servers/components/home-add-server-cta"),
);

// ─── Search-param helpers (unchanged from original) ──────────────────────────

function parseServerCategory(value: unknown): ServerCategory | undefined {
	if (typeof value !== "string") return undefined;
	return SERVER_CATEGORIES.includes(value as ServerCategory)
		? (value as ServerCategory)
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

function validateSearch(search: Record<string, unknown>): HomeSearch {
	const tab = parseServerCategory(search.tab);
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
	} satisfies HomeSearch;
}

function normalizeRedirectTarget(value: string): string {
	if (value.startsWith("/")) return value;
	if (typeof window === "undefined") return "/";

	try {
		const parsed = new URL(value, window.location.origin);
		if (parsed.origin !== window.location.origin) return "/";
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return "/";
	}
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/")({
	validateSearch,
	loaderDeps: ({ search }) => ({
		category: (search.tab ?? DEFAULT_CATEGORY) as ServerCategory,
		page: search.page ?? 1,
	}),
	loader: async ({ context, deps }) => {
		/**
		 * OPTIMISATION 1 — Split blocking vs. background fetches.
		 * 保持你的優化邏輯不變，確保首屏渲染不會被 filterBundle 卡住。
		 */

		// 1. 阻塞型獲取：等待伺服器列表載入完成
		await context.queryClient.ensureQueryData(
			serversListQueryOptions({
				category: deps.category,
				page: deps.page,
				limit: ITEMS_PER_PAGE,
			}),
		);

		// 2. 背景預先獲取：不加 await，讓它在背景執行
		void context.queryClient.prefetchQuery(serverFilterBundleQueryOptions());

		// 3. 【新增】將當前 queryClient 的狀態脫水 (dehydrate) 並回傳
		return {
			dehydratedState: dehydrate(context.queryClient),
		};
	},

	// 4. 【修改】用 HydrationBoundary 包裝你的 HomePage
	component: () => {
		// 從 loader 中取出剛才脫水的狀態
		const { dehydratedState } = Route.useLoaderData();

		return (
			<HydrationBoundary state={dehydratedState}>
				<HomePage />
			</HydrationBoundary>
		);
	},
});

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PrefetchTabTriggerProps {
	value: ServerCategory;
	activeTab: ServerCategory;
	isPending: boolean;
	/** Called on pointer-enter AND keyboard focus — triggers a background prefetch. */
	onPrefetch: (category: ServerCategory) => void;
}

/**
 * OPTIMISATION 2 — Hover/focus prefetch per tab.
 *
 * Before: switching tabs always caused a loading state because the data wasn't
 *         in the cache until the user clicked.
 * After : data is prefetched the moment the pointer enters (or focus lands on)
 *         the trigger, so the tab switch is usually instant.
 *
 * Also eliminates the 4-times-repeated `{activeTab === value && <motion.div …>}`
 * block — single source of truth for the animated indicator.
 */
function PrefetchTabTrigger({
	value,
	activeTab,
	isPending,
	onPrefetch,
}: PrefetchTabTriggerProps) {
	return (
		<TabsTrigger
			value={value}
			disabled={isPending}
			onMouseEnter={() => onPrefetch(value)}
			onFocus={() => onPrefetch(value)}
			className="relative z-10 bg-transparent data-[state=active]:bg-transparent"
		>
			<span className="relative z-20">{TAB_LABELS[value]}</span>

			{activeTab === value && (
				<motion.div
					layoutId="active-indicator"
					className="absolute inset-0 z-10 rounded-sm bg-[#36393f]"
					transition={{ type: "spring", stiffness: 380, damping: 30 }}
				/>
			)}
		</TabsTrigger>
	);
}

// ─── Page component ───────────────────────────────────────────────────────────

function HomePage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	const { status } = useSession();
	const autoSignInTriggeredRef = useRef(false);
	const [isPending, startTransition] = useTransition();
	const loaderData = Route.useLoaderData();

	const activeTab = (search.tab ?? DEFAULT_CATEGORY) as ServerCategory;
	const currentPage = search.page ?? 1;
	const searchQuery = search.search ?? "";

	const selectedCategoryIds = useMemo(() => {
		if (!search.categories) return [];
		return search.categories
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	}, [search.categories]);

	// ── Local UI state ──────────────────────────────────────────────────────

	const [isComposing, setIsComposing] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const [customCategories, setCustomCategories] = useState<CategoryType[]>([]);

	/**
	 * OPTIMISATION 3 — Lazy filter-bundle activation.
	 *
	 * The filter bundle (all servers) is heavy. We only need it when the user
	 * actually types in the search box or selects a category filter.
	 *
	 * `filterBundleEnabled` starts as `true` only when the URL already contains
	 * search/category params (e.g. direct link or browser back-navigation).
	 * Otherwise it stays `false` until the user interacts with those controls.
	 */
	const [filterBundleEnabled, setFilterBundleEnabled] = useState(() =>
		Boolean(searchQuery.trim() || selectedCategoryIds.length),
	);

	// Sync input with URL (e.g. back/forward navigation)
	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

	// Clean up Discord hash fragment on mount
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!window.location.hash.startsWith("#sym:")) return;
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
		window.scrollTo({ top: 0, behavior: "auto" });
	}, []);

	// Auto sign-in redirect flow
	useEffect(() => {
		if (typeof search.redirect !== "string" || !search.redirect) return;
		if (status === "loading") return;

		if (status === "authenticated") {
			navigate({
				to: "/",
				replace: true,
				search: (previous) => ({ ...previous, redirect: undefined }),
			});
			return;
		}

		if (autoSignInTriggeredRef.current) return;
		autoSignInTriggeredRef.current = true;
		void signIn(normalizeRedirectTarget(search.redirect));
	}, [navigate, search.redirect, status]);

	// ── Data fetching ────────────────────────────────────────────────────────

	const serversList = useSuspenseQuery(
		serversListQueryOptions({
			category: activeTab,
			page: currentPage,
			limit: ITEMS_PER_PAGE,
		}),
	);

	/**
	 * Filter bundle uses plain `useQuery` (not Suspense) with `enabled` flag.
	 * This prevents the component from suspending while the bundle is loading —
	 * the server list renders immediately with whatever data it already has.
	 */
	const filterBundle = useQuery({
		...serverFilterBundleQueryOptions(),
		enabled: filterBundleEnabled,
	});

	// Safe accessor — falls back to empty arrays/zeros before bundle arrives
	const filterBundleData = filterBundle.data ?? EMPTY_FILTER_BUNDLE;

	// ── Derived state ────────────────────────────────────────────────────────

	const mergedCategories = useMemo(() => {
		const map = new Map<string, CategoryType>();
		for (const item of filterBundleData.categories) map.set(item.id, item);
		for (const item of customCategories) map.set(item.id, item);
		return [...map.values()];
	}, [filterBundleData.categories, customCategories]);

	const useClientSideFiltering = Boolean(
		searchQuery.trim() || selectedCategoryIds.length,
	);

	const clientFiltered = useMemo(() => {
		if (!useClientSideFiltering) return [];

		let filtered = filterBundleData.allServers;

		if (selectedCategoryIds.length > 0) {
			const selectedNames = mergedCategories
				.filter((item) => selectedCategoryIds.includes(item.id))
				.map((item) => item.name.toLowerCase());

			filtered = filtered.filter((item) =>
				item.tags.some((tag) => selectedNames.includes(tag.toLowerCase())),
			);
		}

		return filterServersBySearch(
			sortServersByCategory(filtered, activeTab),
			searchQuery,
		);
	}, [
		useClientSideFiltering,
		filterBundleData.allServers,
		selectedCategoryIds,
		mergedCategories,
		activeTab,
		searchQuery,
	]);

	const displayData = useMemo(() => {
		if (useClientSideFiltering) {
			return paginateServers(clientFiltered, currentPage, ITEMS_PER_PAGE);
		}
		return {
			servers: serversList.data.servers,
			total: serversList.data.total,
			totalPages: serversList.data.totalPages,
			page: serversList.data.page,
		};
	}, [useClientSideFiltering, clientFiltered, currentPage, serversList.data]);

	const shouldShowSkeleton = serversList.isFetching || isSearching || isPending;

	// ── Callbacks ────────────────────────────────────────────────────────────

	const updateSearch = useCallback(
		(patch: Partial<HomeSearch>, options?: { resetScroll?: boolean }) => {
			startTransition(() => {
				navigate({
					to: "/",
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

	/**
	 * OPTIMISATION 2 (impl) — prefetch the hovered tab's page-1 data.
	 * Skips the active tab (already loaded) and deduplicates automatically
	 * because TanStack Query won't re-fetch a fresh cache entry.
	 */
	const handleTabHoverPrefetch = useCallback(
		(category: ServerCategory) => {
			if (category === activeTab) return;
			void queryClient.prefetchQuery(
				serversListQueryOptions({ category, page: 1, limit: ITEMS_PER_PAGE }),
			);
		},
		[activeTab, queryClient],
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
			const parsed = parseServerCategory(value);
			if (!parsed) return;

			setIsSearching(true);
			updateSearch({ tab: parsed, page: 1 });

			window.setTimeout(() => {
				setIsSearching(false);
			}, 200);
		},
		[updateSearch],
	);

	const commitSearch = useCallback(
		(value: string) => {
			const trimmed = value.trim();

			// Activate filter bundle on first meaningful keystroke
			if (trimmed && !filterBundleEnabled) {
				setFilterBundleEnabled(true);
			}

			setIsSearching(Boolean(trimmed));
			updateSearch({ search: trimmed || undefined, page: 1 });

			if (trimmed) {
				window.setTimeout(() => {
					setIsSearching(false);
				}, 300);
			}
		},
		[updateSearch, filterBundleEnabled],
	);

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const value = event.target.value;
			setInputValue(value);
			if (!isComposing) commitSearch(value);
		},
		[commitSearch, isComposing],
	);

	const handleCategoryChange = useCallback(
		(ids: string[]) => {
			// Activate filter bundle when the user first picks a category
			if (ids.length && !filterBundleEnabled) {
				setFilterBundleEnabled(true);
			}
			updateSearch({
				categories: ids.length ? ids.join(",") : undefined,
				page: 1,
			});
		},
		[updateSearch, filterBundleEnabled],
	);

	const handleAddCustomCategory = useCallback(
		(categoryName: string) => {
			if (
				mergedCategories.some(
					(item) => item.name.toLowerCase() === categoryName.toLowerCase(),
				)
			) {
				return;
			}

			const nextCategory: CategoryType = {
				id: `custom-${Date.now()}`,
				name: categoryName,
				color: "bg-sky-500",
			};

			setCustomCategories((previous) => [...previous, nextCategory]);
			handleCategoryChange([...selectedCategoryIds, nextCategory.id]);
		},
		[mergedCategories, handleCategoryChange, selectedCategoryIds],
	);

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			{/* Hero */}
			<div className="relative overflow-hidden bg-[#5865f2] py-16">
				<div className="absolute inset-0 opacity-10" aria-hidden="true">
					<svg
						className="h-full w-full"
						viewBox="0 0 800 800"
						role="img"
						aria-hidden="true"
					>
						<title>背景</title>
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
						發現最棒的 Discord 社群
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-white/80 text-xl">
						加入數千個有趣的伺服器，找到你的興趣社群，與志同道合的朋友交流。
					</p>

					<div className="relative mx-auto max-w-2xl">
						<Input
							placeholder="搜尋伺服器名稱、標籤或描述..."
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
						{(isSearching || isPending) && (
							<div className="absolute top-1/2 right-3 -translate-y-1/2">
								<div className="h-5 w-5 animate-spin rounded-full border-white border-b-2" />
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Banner */}
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
								alt="熱門伺服器活動"
								width={1280}
								height={480}
								className="h-full w-full object-cover"
								loading="eager"
							/>
						</a>
					</div>
				</div>
			</div>

			{/* Main content */}
			<div className="mx-auto max-w-7xl px-4 py-8">
				{/* Mobile category filter */}
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
					{/* Server list column */}
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
							<TabsList className="h-full w-full overflow-hidden border-[#1e1f22] border-b bg-[#2b2d31] p-1">
								{SERVER_CATEGORIES.map((category) => (
									<PrefetchTabTrigger
										key={category}
										value={category}
										activeTab={activeTab}
										isPending={isPending}
										onPrefetch={handleTabHoverPrefetch}
									/>
								))}
							</TabsList>

							{(SERVER_CATEGORIES as readonly ServerCategory[]).map((tab) => (
								<TabsContent key={tab} value={tab} className="mt-6">
									<div className="mb-4 flex items-center justify-between">
										<h2 className="font-bold text-2xl">{TAB_LABELS[tab]}</h2>
										{!shouldShowSkeleton && displayData.total > 0 && (
											<div className="text-gray-400 text-sm">
												第 {displayData.page} 頁，共 {displayData.totalPages} 頁
											</div>
										)}
									</div>

									<ServerList
										servers={displayData.servers}
										isLoading={shouldShowSkeleton}
										skeletonCount={ITEMS_PER_PAGE}
									/>

									{!shouldShowSkeleton && displayData.totalPages > 1 && (
										<div className="mt-6">
											<Pagination
												currentPage={displayData.page}
												totalPages={displayData.totalPages}
												onPageChange={handlePageChange}
											/>
										</div>
									)}
								</TabsContent>
							))}
						</Tabs>
					</div>

					{/* Sidebar */}
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
							<h3 className="mb-4 font-semibold text-lg">伺服器統計</h3>
							<div className="space-y-3">
								<StatRow
									label="總伺服器數"
									value={filterBundleData.stats.totalServers}
									loading={filterBundle.isLoading}
								/>
								<StatRow
									label="總精選伺服器數量"
									value={filterBundleData.stats.featuredServers}
									loading={filterBundle.isLoading}
								/>
								<StatRow
									label="目前已使用分類數"
									value={filterBundleData.stats.totalTags}
									loading={filterBundle.isLoading}
								/>
							</div>
						</div>

						<Suspense
							fallback={<div className="mb-6 h-80 rounded-lg bg-[#2b2d31]" />}
						>
							<LazyDiscordWidget />
						</Suspense>

						<Suspense
							fallback={<div className="h-44 rounded-lg bg-[#2b2d31]" />}
						>
							<LazyHomeAddServerCta />
						</Suspense>
					</div>
				</div>

				{/* Mobile CTA */}
				<div className="mt-8 lg:hidden">
					<Suspense fallback={<div className="h-40 rounded-lg bg-[#2b2d31]" />}>
						<LazyHomeAddServerCta mobile />
					</Suspense>
				</div>
			</div>
		</div>
	);
}

// ─── Tiny helper ─────────────────────────────────────────────────────────────

/**
 * Shows a shimmer placeholder while the filter bundle is loading,
 * then renders the real value once available.
 */
function StatRow({
	label,
	value,
	loading,
}: {
	label: string;
	value: number;
	loading: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-gray-300">{label}</span>
			{loading ? (
				<span className="h-4 w-10 animate-pulse rounded bg-[#36393f]" />
			) : (
				<span className="font-medium">{value}</span>
			)}
		</div>
	);
}
