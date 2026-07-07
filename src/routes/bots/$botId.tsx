import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useRouteContext,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Calendar,
  Clock,
  FileText,
  Flag,
  Globe,
  Heart,
  ShieldCheck,
  Star,
  Terminal,
  Users,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { FaCheck, FaDiscord } from "react-icons/fa6";
import { toast } from "react-toastify";
import LoadingPage from "#/components/loading";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import NotFound from "#/components/notFound";
import { OptimizedImage } from "#/components/OptimizedImage";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { rateBotFn, reportBotFn, voteBotFn } from "#/features/bots/bot-detail.functions.ts";
import { botDetailQueryOptions } from "#/features/bots/bot-detail.query";
import type { BotDetailSearch } from "#/features/bots/bot-detail.schemas";
import type { BotDetail, BotDetailTab, BotReview } from "#/features/bots/bot-detail.types";
import { toggleFavoriteFn } from "#/features/users/users.functions";
import type { NormalizedSession } from "#/lib/auth.functions";
import { signIn } from "#/lib/auth-client";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import { cn } from "#/lib/utils";

const DEFAULT_BOT_ICON_URL = "https://cdn.discordapp.com/embed/avatars/0.png";
const BOT_DETAIL_TABS: readonly BotDetailTab[] = ["about", "commands", "screenshots"];
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
        { name: "twitter:url", content: fallbackCanonical },
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
    url: canonicalUrl,
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
      { property: "og:site_name", content: "DiscordHubs" }, // Fixed typo: Hubs -> Hub
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
    typeof search.tab === "string" && BOT_DETAIL_TABS.includes(search.tab as BotDetailTab)
      ? (search.tab as BotDetailTab)
      : undefined;

  return tab ? { tab } : {};
}

export const Route = createFileRoute("/bots/$botId")({
  validateSearch,
  loader: async ({ context, params }): Promise<{ detail: BotDetail }> => {
    const detail = await context.queryClient.ensureQueryData(botDetailQueryOptions(params.botId));
    if (!detail) throw notFound(); // 直接 404
    return { detail };
  },
  head: ({ loaderData, params }) => {
    // 這裡可以安全地直接用了，不用 as 斷言
    const detail = loaderData?.detail ?? null;
    return createBotHead(detail, params.botId);
  },

  // 🚨 關鍵修改：明確標示 loader 的回傳型別

  component: BotDetailPage, // 這裡可以安心放回原本的組件了

  pendingComponent: () => (
    <LoadingPage
      loadingText="正在從茫茫大海中撈取機器人的資訊..."
      subText="請稍候"
      loaderType="dots"
    />
  ),
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

function getSessionUserId(session: NormalizedSession | null): string | null {
  return session?.discordProfile?.id ?? session?.user?.discordId ?? session?.user?.id ?? null;
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
        <div className="mb-3 text-gray-300 text-sm">提交機器人檢舉</div>
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

const routeApi = getRouteApi("/bots/$botId");

function BotDetailPage() {
  const { botId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // 3. 這裡的 detail 型別將會被完美推導，不再會是 undefined 囉！
  const { detail: initialDetail } = Route.useLoaderData();

  const queryClient = useQueryClient();
  const { session } = useRouteContext({ from: "__root__" });

  const [isReportOpen, setIsReportOpen] = useState(false);

  const activeTab = (search.tab ?? "about") as BotDetailTab;
  const sessionUserId = getSessionUserId(session);
  const isSignedIn = Boolean(sessionUserId);

  const detailQueryKey = queryKeys.bots.detail(botId);

  const { data } = useQuery({
    ...botDetailQueryOptions(botId),
    initialData: initialDetail,
  });

  const detail = data ?? initialDetail;
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

      const previous = queryClient.getQueryData<BotDetail | null>(detailQueryKey);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.bots.all }),
      ]);
    },
  });

  const voteMutation = useMutation({
    meta: { suppressErrorAlert: true },
    mutationFn: () =>
      runEffect(tryEffectPromise("Failed to vote bot", () => voteBotFn({ data: { botId } }))),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });

      const previous = queryClient.getQueryData<BotDetail | null>(detailQueryKey);
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
        tryEffectPromise("Failed to rate bot", () => rateBotFn({ data: { botId, rating } })),
      ),
    onMutate: async (rating) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });

      const previous = queryClient.getQueryData<BotDetail | null>(detailQueryKey);
      if (!sessionUserId) return { previous };

      queryClient.setQueryData<BotDetail | null>(detailQueryKey, (old) => {
        if (!old) return old;

        const nextReviews = [...old.reviews];
        const existingIndex = nextReviews.findIndex((item) => item.userId === sessionUserId);

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
      if (value !== "about" && value !== "commands" && value !== "screenshots") {
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

  const { mutate: mutateFavorite } = favoriteMutation;
  const handleFavoriteClick = useCallback(() => {
    if (!isSignedIn) {
      handleSignIn();
      return;
    }
    mutateFavorite();
  }, [isSignedIn, handleSignIn, mutateFavorite]);

  const { mutate: mutateRate } = rateMutation;
  const handleRateClick = useCallback(
    (rating: number) => {
      if (!isSignedIn) {
        handleSignIn();
        return;
      }
      mutateRate(rating);
    },
    [isSignedIn, handleSignIn, mutateRate],
  );

  const { mutate: mutateVote } = voteMutation;
  const handleVoteClick = useCallback(() => {
    if (!isSignedIn) {
      handleSignIn();
      return;
    }
    mutateVote();
  }, [isSignedIn, handleSignIn, mutateVote]);

  const handleCloseReport = useCallback(() => setIsReportOpen(false), []);

  const handleInviteClick = useCallback(() => {
    if (!detail.inviteUrl) return;
    window.open(detail.inviteUrl, "_blank", "noopener,noreferrer");
  }, [detail.inviteUrl]);

  const hasCategories = useMemo(
    () => detail.commands.some((cmd) => cmd.category),
    [detail.commands],
  );

  return (
    <div className="min-h-screen bg-[#1e1f22] pb-16 text-white">
      <div className="relative h-52 overflow-hidden bg-[#36393f] md:h-64 lg:h-80">
        {detail.banner ? (
          <>
            <OptimizedImage
              src={detail.banner}
              alt={`${detail.name} banner`}
              width={1024}
              height={400}
              fetchPriority="high" // 🟢 穿透屬性：通知瀏覽器這是首屏最重要的圖片
              className="h-full w-full object-cover"
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
            <Avatar className="h-24 w-24 shrink-0 border-4 border-[#1e1f22] bg-[#36393f] shadow-md md:h-32 md:w-32">
              <OptimizedImage
                src={detail.icon}
                fallbackSrc="/placeholder.png"
                alt={detail.name}
                width={128} // 配合 md:w-32 (128px) 設定基準尺寸
                height={128}
                fetchPriority="high" // 🟢 穿透屬性：核心 Icon 頁面加載時優先抓取
                className="h-full w-full object-cover"
              />
              <AvatarFallback className="select-none bg-[#5865f2] font-bold text-3xl text-white uppercase">
                {detail.name?.charAt(0) || "D"}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-2xl md:text-3xl">{detail.name}</h1>
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

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300 text-sm">
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
              className="relative z-20 cursor-default bg-red-600 font-bold text-white hover:bg-red-700"
            >
              <span className="mr-1">🔞</span> {/* 你可以使用 Emoji 或是你的 Icon 組件 */}
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
            onClick={handleInviteClick}
            disabled={!detail.inviteUrl}
            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
          >
            邀請機器人
          </Button>

          <Button
            onClick={handleFavoriteClick}
            disabled={favoriteMutation.isPending}
            className={cn(
              "flex transform cursor-pointer items-center gap-2 rounded-md px-6 py-5 font-medium text-sm",
              "transition-all duration-150 hover:scale-105 text-white disabled:cursor-not-allowed",
              detail.isFavorite
                ? "bg-rose-500 hover:bg-rose-600"
                : "bg-indigo-500 hover:bg-indigo-600",
            )}
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
          <ReportBotForm
            botId={botId}
            itemName={detail.name}
            isSignedIn={isSignedIn}
            onSignIn={handleSignIn}
            onCancel={handleCloseReport}
          />
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="mb-6 rounded-2xl border border-white/[0.04] bg-[#2b2d31] p-5">
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#5865f2]/15">
                  <Bot size={17} className="text-[#8b93f8]" />
                </div>
                <h3 className="flex-1 font-semibold text-[#f2f3f5] text-base">機器人資訊</h3>
              </div>

              {/* 開發者 */}
              {detail.developers.length > 0 ? (
                <>
                  <div className="mb-4">
                    <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8a8d93]">
                      開發者
                    </h4>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {detail.developers.map((dev) => (
                        <Link
                          to="/users/$userId"
                          params={{ userId: dev.id }}
                          preload="intent"
                          key={dev.id}
                          className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:cursor-pointer hover:bg-white/5 min-w-0 sm:flex-1"
                        >
                          <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-white/[0.08]">
                            <OptimizedImage
                              src={dev.avatar}
                              alt={`${dev.username} avatar`}
                              width={36}
                              height={36}
                              className="h-full w-full object-cover"
                            />
                            <AvatarFallback className="select-none bg-[#5865f2] font-semibold text-xs text-white uppercase">
                              {dev.username?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#f2f3f5] text-sm">
                              {dev.name || dev.username}
                            </p>
                            <p className="truncate text-[11px] text-[#8a8d93]">@{dev.username}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="my-4 h-px bg-white/5" />
                </>
              ) : null}

              {/* 上架日期 */}
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <Calendar size={15} className="text-[#8a8d93]" />
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-[#8a8d93]">上架於</p>
                  <p className="text-sm font-medium text-[#dbdee1]" suppressHydrationWarning>
                    {detail.approvedAt
                      ? new Date(detail.approvedAt).toLocaleDateString("zh-TW")
                      : "未知"}
                  </p>
                </div>
              </div>

              {/* 操作按鈕 */}
              {(detail.website ||
                detail.supportServer ||
                detail.termsOfServiceUrl ||
                detail.privacyPolicyUrl) && (
                <div className="flex flex-wrap gap-2">
                  {detail.website ? (
                    <a
                      href={detail.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-[160px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] px-3.5 py-2.5 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/[0.05]"
                    >
                      <Globe size={15} className="text-[#5b9dff]" />
                      訪問網站
                    </a>
                  ) : null}

                  {detail.supportServer ? (
                    <a
                      href={detail.supportServer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-[160px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#5865f2]/35 bg-discord px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-discord-hover"
                    >
                      <FaDiscord size={15} />
                      加入支援伺服器
                    </a>
                  ) : null}

                  {detail.termsOfServiceUrl ? (
                    <a
                      href={detail.termsOfServiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-[160px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] px-3.5 py-2.5 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/[0.05]"
                    >
                      <FileText size={15} className="text-[#5b9dff]" />
                      服務條款
                    </a>
                  ) : null}

                  {detail.privacyPolicyUrl ? (
                    <a
                      href={detail.privacyPolicyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-[160px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] px-3.5 py-2.5 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/[0.05]"
                    >
                      <ShieldCheck size={15} className="text-[#5b9dff]" />
                      隱私政策
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
              <h3 className="mb-3 font-semibold text-lg">評分此機器人</h3>
              <p className="mb-4 text-gray-300 text-sm">
                給它一個分數，幫助其他人快速判斷這台機器人是否適合使用。
              </p>
              <div className="mb-4 rounded-lg bg-[#36393f] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">平均評分</span>
                  <div className="flex items-center text-[#ffd700]">
                    <Star size={16} className="mr-1 fill-current" />
                    <span className="font-bold">{detail.currentRating.toFixed(1)}</span>
                    <span className="ml-2 text-gray-400 text-xs">
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
              <p className="mt-2 text-center text-gray-400 text-xs" suppressHydrationWarning>
                {isSignedIn ? "點擊星星即可更新你的評分" : "登入後可評分"}
              </p>
            </div>

            <div className="mb-6 rounded-lg bg-[#2b2d31] p-5">
              <h3 className="mb-3 font-semibold text-lg">支持此機器人</h3>
              <p className="mb-4 text-gray-300 text-sm">
                每 12 小時可投一次票，幫助這台機器人獲得更多曝光。
              </p>
              <div className="mb-4 rounded-lg bg-[#36393f] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">當前票數</span>
                  <div className="flex items-center text-[#5865f2]">
                    <ArrowUp size={16} className="mr-1" />
                    <span className="font-bold">{detail.upvotes.toLocaleString()}</span>
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
              <p className="mt-2 text-center text-gray-400 text-xs" suppressHydrationWarning>
                {detail.nextVoteAt
                  ? `下次可投票時間：${new Date(detail.nextVoteAt).toLocaleString("zh-TW")}`
                  : "每 12 小時可投一次票"}
              </p>
            </div>

            <div className="rounded-lg bg-[#2b2d31] p-5">
              <h3 className="mb-4 font-semibold text-lg">相關機器人</h3>
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
                        <OptimizedImage
                          src={relatedBot.icon}
                          fallbackSrc="https://cdn.discordapp.com/embed/avatars/0.png"
                          alt={relatedBot.name}
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-medium">{relatedBot.name}</div>
                        <div className="flex items-center text-gray-400 text-xs">
                          <Users size={12} className="mr-1" />
                          <span>{relatedBot.servers.toLocaleString()} 伺服器</span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm">暫無相關機器人</p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-8">
              <TabsList className="h-full w-full overflow-hidden border-[#1e1f22] border-b bg-[#2b2d31]">
                <TabsTrigger value="about" className="data-[state=active]:bg-[#36393f]">
                  關於機器人
                </TabsTrigger>
                <TabsTrigger value="commands" className="data-[state=active]:bg-[#36393f]">
                  指令列表
                </TabsTrigger>
                <TabsTrigger value="screenshots" className="data-[state=active]:bg-[#36393f]">
                  截圖
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-6">
                <div className="rounded-lg bg-[#2b2d31] p-6">
                  <h2 className="mb-4 font-bold text-xl">機器人介紹</h2>
                  <div className="prose prose-invert wrap-break-word max-w-none text-gray-300">
                    <MarkdownRenderer
                      content={detail.longDescription?.trim() || detail.description || "暫無介紹"}
                    />
                  </div>

                  {detail.features.length > 0 ? (
                    <div className="mt-8">
                      <h3 className="mb-3 font-semibold text-lg">機器人特色</h3>
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
                  <h2 className="mb-4 font-bold text-xl">指令列表</h2>
                  {detail.commands.length > 0 ? (
                    <div className="overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-[#1e1f22] border-b">
                            <th className="px-4 py-3 text-gray-300">指令</th>
                            <th className="px-4 py-3 text-gray-300">描述</th>
                            <th className="px-4 py-3 text-gray-300">用法</th>
                            {hasCategories ? (
                              <th className="px-4 py-3 text-gray-300">分類</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.commands.map((command) => (
                            <tr
                              key={command.id}
                              className="border-[#1e1f22] border-b hover:bg-[#36393f]"
                            >
                              <td className="px-4 py-3 font-mono text-[#5865f2]">{command.name}</td>
                              <td className="px-4 py-3 text-gray-300">{command.description}</td>
                              <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                                {command.usage}
                              </td>
                              {hasCategories ? (
                                <td className="px-4 py-3 text-gray-300">
                                  {command.category ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-2xl border-[#5865f2] bg-[#36393f]/50 px-2 py-1 text-gray-300 text-xs"
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
                  <h2 className="mb-4 font-bold text-xl">機器人截圖</h2>
                  {detail.screenshots.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {detail.screenshots.map((screenshot, index) => (
                        <div key={screenshot} className="overflow-hidden rounded-lg bg-[#36393f]">
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
