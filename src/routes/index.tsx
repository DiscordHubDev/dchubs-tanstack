import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Image } from "@unpic/react";
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

const DEFAULT_CATEGORY: ServerCategory = "popular";
const SERVER_CATEGORIES: readonly ServerCategory[] = [
	"popular",
	"featured",
	"new",
	"voted",
];
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

	if (!Number.isInteger(parsed) || parsed < 1) {
		return undefined;
	}

	return parsed;
}

function validateSearch(search: Record<string, unknown>): HomeSearch {
	const tab = parseServerCategory(search.tab);
	const page = parsePositiveIntLike(search.page);

	const parsed = {
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

	return parsed;
}

function normalizeRedirectTarget(value: string): string {
	if (value.startsWith("/")) {
		return value;
	}

	if (typeof window === "undefined") {
		return "/";
	}

	try {
		const parsed = new URL(value, window.location.origin);

		if (parsed.origin !== window.location.origin) {
			return "/";
		}

		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return "/";
	}
}

export const Route = createFileRoute("/")({
	validateSearch,
	loaderDeps: ({ search }) => ({
		category: (search.tab ?? DEFAULT_CATEGORY) as ServerCategory,
		page: search.page ?? 1,
	}),
	loader: async ({ context, deps }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				serversListQueryOptions({
					category: deps.category,
					page: deps.page,
					limit: ITEMS_PER_PAGE,
				}),
			),
			context.queryClient.ensureQueryData(serverFilterBundleQueryOptions()),
		]);
	},
	component: HomePage,
});

function HomePage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { status } = useSession();
	const autoSignInTriggeredRef = useRef(false);
	const [isPending, startTransition] = useTransition();

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

	const [isComposing, setIsComposing] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const [customCategories, setCustomCategories] = useState<CategoryType[]>([]);

	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

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

	useEffect(() => {
		if (typeof search.redirect !== "string" || !search.redirect) return;
		if (status === "loading") return;

		if (status === "authenticated") {
			navigate({
				to: "/",
				replace: true,
				search: (previous) => ({
					...previous,
					redirect: undefined,
				}),
			});
			return;
		}

		if (autoSignInTriggeredRef.current) return;
		autoSignInTriggeredRef.current = true;
		void signIn(normalizeRedirectTarget(search.redirect));
	}, [navigate, search.redirect, status]);

	const serversList = useSuspenseQuery(
		serversListQueryOptions({
			category: activeTab,
			page: currentPage,
			limit: ITEMS_PER_PAGE,
		}),
	);

	const filterBundle = useSuspenseQuery(serverFilterBundleQueryOptions());

	const mergedCategories = useMemo(() => {
		const map = new Map<string, CategoryType>();

		for (const item of filterBundle.data.categories) {
			map.set(item.id, item);
		}

		for (const item of customCategories) {
			map.set(item.id, item);
		}

		return [...map.values()];
	}, [filterBundle.data.categories, customCategories]);

	const useClientSideFiltering = Boolean(
		searchQuery.trim() || selectedCategoryIds.length,
	);

	const clientFiltered = useMemo(() => {
		if (!useClientSideFiltering) return [];

		let filtered = filterBundle.data.allServers;

		if (selectedCategoryIds.length > 0) {
			const selectedNames = mergedCategories
				.filter((item) => selectedCategoryIds.includes(item.id))
				.map((item) => item.name.toLowerCase());

			filtered = filtered.filter((item) => {
				return item.tags.some((tag) =>
					selectedNames.includes(tag.toLowerCase()),
				);
			});
		}

		return filterServersBySearch(
			sortServersByCategory(filtered, activeTab),
			searchQuery,
		);
	}, [
		useClientSideFiltering,
		filterBundle.data.allServers,
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

	const updateSearch = useCallback(
		(
			patch: Partial<HomeSearch>,
			options?: {
				resetScroll?: boolean;
			},
		) => {
			startTransition(() => {
				navigate({
					to: "/",
					replace: true,
					resetScroll: options?.resetScroll,
					search: (previous) => {
						const next = {
							...previous,
							...patch,
						};

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

			updateSearch(
				{ page },
				{
					// Keep manual smooth scroll animation from being interrupted
					// by router-managed scroll restoration.
					resetScroll: false,
				},
			);
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

			setIsSearching(Boolean(trimmed));
			updateSearch({ search: trimmed || undefined, page: 1 });

			if (trimmed) {
				window.setTimeout(() => {
					setIsSearching(false);
				}, 300);
			}
		},
		[updateSearch],
	);

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const value = event.target.value;
			setInputValue(value);

			if (!isComposing) {
				commitSearch(value);
			}
		},
		[commitSearch, isComposing],
	);

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

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			<div className="relative overflow-hidden bg-[#5865f2] py-16">
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
							<TabsList className="h-full w-full overflow-hidden border-[#1e1f22] border-b bg-[#2b2d31]">
								<TabsTrigger
									value="popular"
									className="data-[state=active]:bg-[#36393f]"
									disabled={isPending}
								>
									熱門伺服器
								</TabsTrigger>
								<TabsTrigger
									value="featured"
									className="data-[state=active]:bg-[#36393f]"
									disabled={isPending}
								>
									精選伺服器
								</TabsTrigger>
								<TabsTrigger
									value="new"
									className="data-[state=active]:bg-[#36393f]"
									disabled={isPending}
								>
									最新伺服器
								</TabsTrigger>
								<TabsTrigger
									value="voted"
									className="data-[state=active]:bg-[#36393f]"
									disabled={isPending}
								>
									票選伺服器
								</TabsTrigger>
							</TabsList>

							{(["featured", "popular", "new", "voted"] as const).map((tab) => (
								<TabsContent key={tab} value={tab} className="mt-6">
									<div className="mb-4 flex items-center justify-between">
										<h2 className="font-bold text-2xl">
											{tab === "featured" && "精選伺服器"}
											{tab === "popular" && "熱門伺服器"}
											{tab === "new" && "最新伺服器"}
											{tab === "voted" && "票選伺服器"}
										</h2>
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
								<div className="flex items-center justify-between">
									<span className="text-gray-300">總伺服器數</span>
									<span className="font-medium">
										{filterBundle.data.stats.totalServers}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-gray-300">總精選伺服器數量</span>
									<span className="font-medium">
										{filterBundle.data.stats.featuredServers}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-gray-300">目前已使用分類數</span>
									<span className="font-medium">
										{filterBundle.data.stats.totalTags}
									</span>
								</div>
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

				<div className="mt-8 lg:hidden">
					<Suspense fallback={<div className="h-40 rounded-lg bg-[#2b2d31]" />}>
						<LazyHomeAddServerCta mobile />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
