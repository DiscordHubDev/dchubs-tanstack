import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Image } from "@unpic/react";
// 引入 LazyMotion 以延遲加載 Framer Motion 核心，避免阻斷 FCP
import { domAnimation, LazyMotion, m } from "framer-motion";
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

import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { botFilterBundleQueryOptions, botsListQueryOptions } from "#/features/bots/bots.query";
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
import { cn } from "#/lib/utils";

const Pagination = lazy(() => import("#/components/feedback/Pagination"));
const BotList = lazy(() => import("#/features/bots/components/bot-list"));
const LazyCategorySearch = lazy(() => import("#/features/servers/components/category-search"));
const LazyMobileCategoryFilter = lazy(
  () => import("#/features/servers/components/mobile-category-filter"),
);
const LazyBotsAddCta = lazy(() => import("#/features/bots/components/bots-add-cta"));

// ─── 分類設定 ────────────
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
  return BOT_CATEGORIES.includes(value as BotCategory) ? (value as BotCategory) : undefined;
}

function parsePositiveIntLike(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

const siteUrl = import.meta.env.VITE_SITE_URL || "https://dchubs.org";

function validateSearch(search: Record<string, unknown>): BotHomeSearch {
  const tab = parseBotCategory(search.tab);
  const page = parsePositiveIntLike(search.page);

  return {
    ...(tab ? { tab } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(typeof search.search === "string" ? { search: search.search } : {}),
    ...(typeof search.categories === "string" ? { categories: search.categories } : {}),
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/bots/")({
  validateSearch,

  loaderDeps: ({ search }) => ({
    category: (search.tab ?? DEFAULT_CATEGORY) as BotCategory,
    page: search.page ?? 1,
    rawTab: search.tab,
  }),

  loader: async ({ context, deps }) => {
    // 效能優化：不要使用 Promise.all 阻塞非關鍵資料。
    // 確保 LCP 的主要 Bot 列表完成 (SSR 需要)，但 filterBundle 丟給背景處理，讓 HTML 盡快開始 Stream
    await context.queryClient.ensureQueryData(
      botsListQueryOptions({
        category: deps.category,
        page: deps.page,
        limit: ITEMS_PER_PAGE,
      }),
    );

    // Fire and forget: 不 await，讓 Suspens 邊界接手處理
    void context.queryClient.prefetchQuery(botFilterBundleQueryOptions());

    return { searchData: deps };
  },
  head: ({ loaderData }) => {
    const baseLinks = [
      // 效能優化：加入 Preconnect 提早解析 DNS/TLS
      { rel: "preconnect", href: "https://gallery.dawngs.top" },
      { rel: "preconnect", href: "https://cdn.discordapp.com" },
    ];

    if (!loaderData) {
      return {
        meta: [
          { title: "熱門機器人 | DiscordHubs" },
          {
            name: "description",
            content: "在 DiscordHubs 探索數百個功能豐富的機器人...",
          },
        ],
        links: [...baseLinks, { rel: "canonical", href: `${siteUrl}/bots` }],
      };
    }
    const { category, page, rawTab } = loaderData.searchData;

    const categoryLabel =
      BOT_CATEGORY_CONFIG.find((c) => c.id === category)?.label ?? "Discord 機器人";
    const title = `發現最棒的${categoryLabel} | DiscordHubs`;
    const description = `在 DiscordHubs 探索數百個功能豐富的${categoryLabel}機器人，為您的伺服器增添更多功能和樂趣。尋找最適合您的社群工具。`;

    const canonicalUrl = `${siteUrl}/bots${rawTab ? `?tab=${rawTab}` : ""}`;
    const hasQueryString = canonicalUrl.includes("?");
    const currentUrl = `${canonicalUrl}${page > 1 ? `${hasQueryString ? "&" : "?"}page=${page}` : ""}`;
    const ogImage = "/nuo_dchub_2.webp";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:site_name", content: "DiscordHubs" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: ogImage },
        { property: "og:type", content: "website" },
        { property: "og:url", content: currentUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [...baseLinks, { rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description: description,
            url: currentUrl,
            isPartOf: { "@type": "WebSite", name: "DiscordHubs", url: siteUrl },
          }),
        },
      ],
      staticData: { breadcrumb: title },
    };
  },
  component: BotsPage,
});

// ─── BotTabTrigger ────────────────────────────────────────────────────────────
type BotTabTriggerProps = {
  category: BotCategory;
  label: string;
  activeTab: BotCategory;
  isPending: boolean;
  onHover: (category: BotCategory) => void;
};

function BotTabTrigger({ category, label, activeTab, isPending, onHover }: BotTabTriggerProps) {
  return (
    <TabsTrigger
      value={category}
      disabled={isPending}
      onMouseEnter={() => onHover(category)}
      className={cn(
        "relative z-10 bg-transparent transition-none",
        "data-[state=active]:bg-transparent data-[state=active]:text-white",
        "whitespace-nowrap",
        "px-2 py-1.5 text-sm",
        "sm:px-4 sm:py-2 sm:text-base",
      )}
    >
      <span className="relative z-20">{label}</span>
      {activeTab === category && (
        <m.div
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
    return search.categories.split(",").flatMap((item) => {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    });
  }, [search.categories]);

  const isComposingRef = useRef(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const [customCategories, setCustomCategories] = useState<CategoryType[]>([]);

  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    if (searchQueryRef.current !== searchQuery) {
      searchQueryRef.current = searchQuery;
      setInputValue(searchQuery);
    }
  }, [searchQuery]);

  const { data: botListData } = useSuspenseQuery(
    botsListQueryOptions({
      category: activeTab,
      page: currentPage,
      limit: ITEMS_PER_PAGE,
    }),
  );
  const { data: filterBundleData } = useSuspenseQuery(botFilterBundleQueryOptions());

  const mergedCategories = useMemo(() => {
    const map = new Map<string, CategoryType>();
    const nameSet = new Set<string>();

    const formattedBotCategories = botCategories.map((c) => ({
      ...c,
      id: `bot-${c.id}`,
    }));
    for (const item of formattedBotCategories) {
      map.set(item.id, item);
      nameSet.add(item.name.toLowerCase());
    }
    for (const item of filterBundleData?.categories ?? []) {
      const nameKey = item.name.toLowerCase();
      if (!nameSet.has(nameKey)) {
        map.set(item.id, item);
        nameSet.add(nameKey);
      }
    }
    for (const item of customCategories) {
      const nameKey = item.name.toLowerCase();
      if (!nameSet.has(nameKey)) {
        map.set(item.id, item);
        nameSet.add(nameKey);
      }
    }
    return [...map.values()];
  }, [filterBundleData, customCategories]);

  const useClientSideFiltering = Boolean(searchQuery.trim() || selectedCategoryIds.length);

  const clientFiltered = useMemo(() => {
    if (!useClientSideFiltering) return [];
    let filtered = filterBundleData?.allBots ?? [];
    if (selectedCategoryIds.length > 0) {
      const selectedNames = mergedCategories
        .filter((item) => selectedCategoryIds.includes(item.id))
        .map((item) => item.name.toLowerCase());

      filtered = filtered.filter((item) =>
        item.tags.some((tag) => selectedNames.some((name) => tag.toLowerCase().includes(name))),
      );
    }
    return filterBotsBySearch(sortBotsByCategory(filtered, activeTab), searchQuery);
  }, [
    filterBundleData,
    useClientSideFiltering,
    selectedCategoryIds,
    mergedCategories,
    activeTab,
    searchQuery,
  ]);

  const displayData = useMemo(() => {
    if (useClientSideFiltering) return paginateBots(clientFiltered, currentPage, ITEMS_PER_PAGE);
    return {
      bots: botListData.bots,
      total: botListData.total,
      totalPages: botListData.totalPages,
      page: botListData.page,
    };
  }, [botListData, useClientSideFiltering, clientFiltered, currentPage]);

  const updateSearch = useCallback(
    (patch: Partial<BotHomeSearch>, options?: { resetScroll?: boolean }) => {
      startTransition(() => {
        navigate({
          to: "/bots",
          replace: true,
          resetScroll: options?.resetScroll,
          search: (previous) => ({
            ...previous,
            ...patch,
            tab: patch.tab ?? previous.tab,
          }),
        });
      });
    },
    [navigate],
  );

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
      const parsed = parseBotCategory(value);
      if (!parsed) return;
      updateSearch({ tab: parsed, page: 1 });
    },
    [updateSearch],
  );

  const commitSearch = useCallback(
    (value: string) => {
      updateSearch({ search: value.trim() || undefined, page: 1 });
    },
    [updateSearch],
  );

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInputValue(value);
      if (!isComposingRef.current) commitSearch(value);
    },
    [commitSearch],
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
      if (mergedCategories.some((item) => item.name.toLowerCase() === categoryName.toLowerCase()))
        return;
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

  const activeCategoryLabel = BOT_CATEGORY_CONFIG.find((c) => c.id === activeTab)?.label ?? "";

  return (
    // 使用 LazyMotion 包裹畫面，確保動畫組件非同步載入，不阻礙畫面首次繪製
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-[#1e1f22] text-white">
        <div className="relative overflow-hidden bg-linear-to-br from-[#5865f2] to-[#8c54ff] py-16">
          <div className="absolute inset-0 opacity-10">
            <svg className="h-full w-full" viewBox="0 0 800 800" aria-hidden="true">
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
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  isComposingRef.current = false;
                  commitSearch(event.currentTarget.value);
                }}
              />
              {/* 效能優化：使用 Inline SVG 取代 lucide-react 套件 */}
              {/** biome-ignore lint/a11y/noSvgWithoutTitle: I dont want to add a title. */}
              <svg
                className="absolute top-1/2 left-3 -translate-y-1/2 text-white/60"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
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
              <a href="https://nuorpg.com/" target="_blank" rel="noopener noreferrer">
                <Image
                  src="/nuo_dchub_2.webp"
                  alt="機器人活動宣傳"
                  width={1280}
                  height={427}
                  className="h-full w-full object-cover"
                  loading="eager"
                  fetchPriority="high" /* 效能優化：提示瀏覽器優先載入 LCP 圖片 */
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, 1280px"
                  breakpoints={[640, 768, 1024, 1280]}
                />
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 lg:hidden">
            <Suspense
              fallback={<div className="h-14 rounded-lg border border-white/10 bg-[#2b2d31]" />}
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
                      {searchQuery && " · "}已選擇 {selectedCategoryIds.length} 個分類
                    </span>
                  )}
                  <span className="ml-2">找到 {displayData.total} 個結果</span>
                </div>
              )}

              <Tabs className="mb-8" value={activeTab} onValueChange={handleTabChange}>
                <TabsList
                  className={cn(
                    "relative h-full w-full p-1",
                    "border-b border-[#1e1f22] bg-[#2b2d31]",
                    "overflow-x-auto",
                    "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                  )}
                >
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

                <TabsContent value={activeTab} className="mt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-y-1">
                    <h2 className="font-bold text-xl sm:text-2xl">{activeCategoryLabel}</h2>
                    {displayData.total > 0 && (
                      <div className="text-gray-400 text-sm">
                        第 {displayData.page} 頁，共 {displayData.totalPages} 頁
                      </div>
                    )}
                  </div>

                  <Suspense
                    fallback={<BotList bots={[]} isLoading={true} skeletonCount={ITEMS_PER_PAGE} />}
                  >
                    <BotList
                      bots={displayData.bots}
                      isLoading={false}
                      skeletonCount={ITEMS_PER_PAGE}
                    />
                  </Suspense>

                  {displayData.totalPages > 1 && (
                    <div className="mt-6">
                      <Suspense fallback={<div className="h-10 rounded-md bg-[#1f2125]" />}>
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
                <h3 className="mb-4 font-semibold text-lg">機器人統計</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">總機器人數</span>
                    <span className="font-medium">{filterBundleData?.stats.totalBots ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">已驗證機器人</span>
                    <span className="font-medium">{filterBundleData?.stats.verifiedBots ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">目前已使用分類數</span>
                    <span className="font-medium">{filterBundleData?.stats.totalTags ?? 0}</span>
                  </div>
                </div>
              </div>

              <Suspense fallback={<div className="h-44 rounded-lg bg-[#2b2d31]" />}>
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
    </LazyMotion>
  );
}
