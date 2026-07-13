import {
  dehydrate,
  HydrationBoundary,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
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
import { signIn } from "#/lib/auth-client";
import { ServerCategories } from "#/lib/categories";
import type { CategoryType } from "#/lib/types";
import { cn } from "#/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORY: ServerCategory = "popular";

const SERVER_CATEGORIES: readonly ServerCategory[] = ["popular", "featured", "new", "voted"];

/** Display labels for each tab — defined once, used in both trigger & heading. */
const TAB_LABELS: Record<ServerCategory, string> = {
  popular: "熱門伺服器",
  featured: "精選伺服器",
  new: "最新伺服器",
  voted: "票選伺服器",
};

/**
 * Safe fallback used while the filter bundle hasn't been fetched yet.
 */
const EMPTY_FILTER_BUNDLE = {
  categories: [] as CategoryType[],
  allServers: [] as any[],
  stats: { totalServers: 0, featuredServers: 0, totalTags: 0 },
} as const;

// ─── Lazy-loaded sidebar / UI chunks ─────────────────────────────────────────

const LazyDiscordWidget = lazy(() => import("#/components/feedback/DiscordWidget"));
const LazyCategorySearch = lazy(() => import("#/features/servers/components/category-search"));
const LazyMobileCategoryFilter = lazy(
  () => import("#/features/servers/components/mobile-category-filter"),
);
const LazyHomeAddServerCta = lazy(
  () => import("#/features/servers/components/home-add-server-cta"),
);

// ─── Search-param helpers ───────────────────────────────────────────────────

function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return debounced;
}

function parseServerCategory(value: unknown): ServerCategory | undefined {
  if (typeof value !== "string") return undefined;
  return SERVER_CATEGORIES.includes(value as ServerCategory)
    ? (value as ServerCategory)
    : undefined;
}

function parsePositiveIntLike(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

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
    ...(typeof search.categories === "string" ? { categories: search.categories } : {}),
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
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

function HomePageRoute() {
  const { dehydratedState } = Route.useLoaderData();

  return (
    <HydrationBoundary state={dehydratedState}>
      <HomePage />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/")({
  ssr: true,
  validateSearch,
  loaderDeps: ({ search }) => ({
    category: (search.tab ?? DEFAULT_CATEGORY) as ServerCategory,
    page: search.page ?? 1,
  }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      serversListQueryOptions({
        category: deps.category,
        page: deps.page,
        limit: ITEMS_PER_PAGE,
      }),
    );
    void context.queryClient.prefetchQuery(serverFilterBundleQueryOptions());

    return {
      dehydratedState: dehydrate(context.queryClient),
    };
  },
  component: HomePageRoute,
});

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PrefetchTabTriggerProps {
  value: ServerCategory;
  activeTab: ServerCategory;
  isPending: boolean;
  onPrefetch: (category: ServerCategory) => void;
}

function PrefetchTabTrigger({ value, activeTab, isPending, onPrefetch }: PrefetchTabTriggerProps) {
  const isActive = activeTab === value;

  return (
    <TabsTrigger
      value={value}
      disabled={isPending}
      onMouseEnter={() => onPrefetch(value)}
      onFocus={() => onPrefetch(value)}
      className={cn(
        "relative z-10 bg-transparent transition-colors",
        "data-[state=active]:bg-transparent",
        // 手機端均分寬度 (flex-1) 且內容置中，平板以上恢復原本大小 (sm:flex-none)
        "flex flex-1 items-center justify-center sm:flex-none",
        "whitespace-nowrap",
        // 微調手機端 padding 增加點擊範圍
        "px-2 py-2 text-sm",
        "sm:px-4 sm:py-2.5 sm:text-base",
      )}
    >
      <span className="relative z-20">{TAB_LABELS[value]}</span>
      <div
        className={cn(
          "absolute inset-0 z-10 rounded-sm bg-[#36393f] transition-opacity duration-200 ease-in-out",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />
    </TabsTrigger>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

function HomePage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { status } = useRouteContext({ from: "__root__" });
  const autoSignInTriggeredRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  const activeTab = (search.tab ?? DEFAULT_CATEGORY) as ServerCategory;
  const currentPage = search.page ?? 1;
  const searchQuery = search.search ?? "";

  const selectedCategoryIds = useMemo(() => {
    if (!search.categories) return [];
    return search.categories.split(",").flatMap((item) => {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    });
  }, [search.categories]);

  // ── Local UI state ──────────────────────────────────────────────────────

  const isComposingRef = useRef(false);
  const [isSearching, setIsSearching] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const [customCategories, setCustomCategories] = useState<CategoryType[]>([]);

  // FIXED: Proper hydration-safe mounting flag
  const [isMounted, setIsMounted] = useState(false);

  /**
   * OPTIMISATION 3 — Lazy filter-bundle activation.
   */
  const [filterBundleEnabled, setFilterBundleEnabled] = useState(() =>
    Boolean(searchQuery.trim() || selectedCategoryIds.length),
  );

  // Hydration-safe mount effect
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync input with URL
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    if (searchQueryRef.current !== searchQuery) {
      searchQueryRef.current = searchQuery;
      setInputValue(searchQuery);
    }
  }, [searchQuery]);

  // Clean up Discord hash fragment
  useEffect(() => {
    if (!window.location.hash.startsWith("#sym:")) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
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

  const { data: serversListData } = useSuspenseQuery(
    serversListQueryOptions({
      category: activeTab,
      page: currentPage,
      limit: ITEMS_PER_PAGE,
    }),
  );

  const { data: filterBundleDataRaw } = useQuery({
    ...serverFilterBundleQueryOptions(),
    enabled: filterBundleEnabled,
  });

  const filterBundleData = filterBundleDataRaw ?? EMPTY_FILTER_BUNDLE;

  // ── Derived state ────────────────────────────────────────────────────────

  const mergedCategories = useMemo(() => {
    const map = new Map<string, CategoryType>();

    const formattedServerCategories = ServerCategories.map((c) => ({
      ...c,
      id: `server-${c.id}`,
    }));

    for (const item of formattedServerCategories) map.set(item.id, item);
    for (const item of filterBundleDataRaw?.categories ?? []) map.set(item.id, item);
    for (const item of customCategories) map.set(item.id, item);

    return [...map.values()];
  }, [filterBundleDataRaw, customCategories]);

  const useClientSideFiltering = Boolean(searchQuery.trim() || selectedCategoryIds.length);

  const clientFiltered = useMemo(() => {
    if (!useClientSideFiltering) return [];

    let filtered = filterBundleData.allServers;

    if (selectedCategoryIds.length > 0) {
      const selectedNames = new Set(
        mergedCategories
          .filter((item) => selectedCategoryIds.includes(item.id))
          .map((item) => item.name.toLowerCase()),
      );

      filtered = filtered.filter((item) =>
        item.tags.some((tag: string) => selectedNames.has(tag.toLowerCase())),
      );
    }

    return filterServersBySearch(sortServersByCategory(filtered, activeTab), searchQuery);
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
      servers: serversListData.servers,
      total: serversListData.total,
      totalPages: serversListData.totalPages,
      page: serversListData.page,
    };
  }, [serversListData, useClientSideFiltering, clientFiltered, currentPage]);

  const shouldShowSkeleton = isSearching;
  const isStatsLoading = !isMounted || !filterBundleDataRaw;

  // ── Callbacks ────────────────────────────────────────────────────────────

  const updateSearch = useCallback(
    (patch: Partial<HomeSearch>, options?: { resetScroll?: boolean }) => {
      startTransition(() => {
        navigate({
          to: "/",
          replace: true,
          resetScroll: options?.resetScroll,
          search: (previous) => ({
            tab: (patch.tab ?? previous.tab) as ServerCategory | undefined,
            page: patch.page ?? previous.page,
            search: patch.search,
            categories: patch.categories,
            redirect: patch.redirect,
          }),
        });
      });
    },
    [navigate],
  );

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
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      updateSearch({ tab: parsed, page: 1 });
    },
    [updateSearch],
  );

  const debouncedCommitSearch = useDebounce((value: string) => {
    const trimmed = value.trim();
    if (trimmed && !filterBundleEnabled) {
      setFilterBundleEnabled(true);
    }
    setIsSearching(Boolean(trimmed));
    updateSearch({ search: trimmed || undefined, page: 1 });

    if (trimmed) {
      setTimeout(() => setIsSearching(false), 280);
    }
  }, 220);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInputValue(value);
      if (!isComposingRef.current) {
        debouncedCommitSearch(value);
      }
    },
    [debouncedCommitSearch],
  );

  const commitSearch = useCallback(
    (value: string) => debouncedCommitSearch(value),
    [debouncedCommitSearch],
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
      if (mergedCategories.some((item) => item.name.toLowerCase() === categoryName.toLowerCase())) {
        return;
      }

      const nextCategory: CategoryType = {
        id: `custom-${Date.now()}`,
        name: categoryName,
        color: "bg-sky-500",
      };

      setCustomCategories((prev) => [...prev, nextCategory]);
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
          <svg className="h-full w-full" viewBox="0 0 800 800" role="img" aria-hidden="true">
            <title>背景</title>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
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
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                commitSearch(event.currentTarget.value);
              }}
            />
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-white/60" size={20} />
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
            <a href="https://nuorpg.com/" target="_blank" rel="noopener noreferrer">
              <Image
                src="/nuo_dchub_2.webp"
                alt="熱門伺服器活動"
                width={1280}
                height={427}
                className="h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, 1280px"
                breakpoints={[640, 768, 1024, 1280]}
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
            fallback={<div className="h-14 rounded-lg border border-white/10 bg-[#2b2d31]" />}
          >
            <LazyMobileCategoryFilter
              categories={mergedCategories}
              selectedCategoryIds={selectedCategoryIds}
              onCategoryChange={handleCategoryChange}
              onCustomCategoryAdd={handleAddCustomCategory}
              isPending={isPending}
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
                    {searchQuery && " · "}已選擇 {selectedCategoryIds.length} 個分類
                  </span>
                )}
                <span className="ml-2">找到 {displayData.total} 個結果</span>
              </div>
            )}

            <Tabs className="mb-8 w-full" value={activeTab} onValueChange={handleTabChange}>
              <TabsList
                className={cn(
                  "flex flex-wrap h-auto w-full items-center justify-center p-1 gap-1",
                  "border-b border-[#1e1f22] bg-[#2b2d31]",
                )}
              >
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

              {/* 下方的 TabsContent 保持原樣即可 */}
              {(SERVER_CATEGORIES as readonly ServerCategory[]).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-y-1">
                    <h2 className="font-bold text-xl sm:text-2xl">{TAB_LABELS[tab]}</h2>
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
              <Suspense fallback={<div className="h-10 rounded-md bg-[#1f2125]" />}>
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
                  loading={isStatsLoading}
                />
                <StatRow
                  label="總精選伺服器數量"
                  value={filterBundleData.stats.featuredServers}
                  loading={isStatsLoading}
                />
                <StatRow
                  label="目前已使用分類數"
                  value={filterBundleData.stats.totalTags}
                  loading={isStatsLoading}
                />
              </div>
            </div>

            <Suspense fallback={<div className="mb-6 h-80 rounded-lg bg-[#2b2d31]" />}>
              <LazyDiscordWidget />
            </Suspense>

            <Suspense fallback={<div className="h-44 rounded-lg bg-[#2b2d31]" />}>
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

function StatRow({ label, value, loading }: { label: string; value: number; loading: boolean }) {
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
