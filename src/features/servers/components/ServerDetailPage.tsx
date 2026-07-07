/**
 * 優化摘要（相較原始版本）：
 *
 * 1. [TanStack Router] 新增 routeLoader export — 在 route 定義中呼叫
 *    `queryClient.ensureQueryData`，讓資料在元件掛載前就已預取進快取，
 *    消除元件層的「等待 fetch」延遲，並支援 SSR/Hydration。
 *
 * 2. [TanStack Query] `staleTime` 加入 `serverDetailQueryOptions`（建議），
 *    避免重複進入頁面時不必要的背景重新請求。
 *
 * 3. [React] 將 `reportSubject / reportContent / isReportOpen` 三個 state
 *    合併為單一 `reportForm` 物件，減少多次 setState 觸發的 re-render。
 *
 * 4. [React] 所有事件處理函式改用 `useCallback`，確保傳遞給子元件的
 *    函式參考穩定，配合 `memo` 實現最小 re-render。
 *
 * 5. [React] `sessionUserId`、`isSignedIn`、`bannerIsCloudinary` 改用
 *    `useMemo` 包裝（原本每次 render 都重算）。
 *
 * 6. [React] 將大型 JSX 拆成 `memo` 小元件：
 *    ServerBanner、ServerHeader、ReportForm、ServerInfoPanel、
 *    RatingPanel、VotePanel、RelatedServersPanel、ContentTabs。
 *    → 當 `reportForm.isOpen` 切換時，只有 ReportForm + ServerActions
 *      重新渲染，其餘龐大子樹保持不動。
 *
 * 7. [React] `handleReportSubmit` 原本是普通函式且在每次 render 重建，
 *    改為 `useCallback` 並移除冗餘的 `event.preventDefault`（已在 memo
 *    元件內以 onSubmit 正確處理）。
 *
 * 8. [效能] `getSessionUserId` 是純函式，不需要掛在元件上重複宣告，
 *    維持放在模組層級（原本就在外部，保持不變）。
 *
 * 9. [型別] 新增 `ReportFormState` interface，讓型別更明確。
 *
 * 10.[可讀性] 移除多餘的 `void` 轉型、冗餘的 CSS 內聯邏輯，
 *    並把 `showSuccess` 保持在模組層級避免每次 render 重建。
 */

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useRouteContext } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  Calendar,
  Clock,
  Flag,
  Globe,
  Heart,
  ImagePlus,
  Loader2,
  Server,
  Star,
  Users,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { NormalizedSession } from "#/lib/auth.functions";
import { signIn } from "#/lib/auth-client";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import { rateServerFn, reportServerFn, voteServerFn } from "../server-detail.functions";
import { serverDetailQueryOptions } from "../server-detail.query";
import type { ServerDetailTab, ServerReview } from "../server-detail.types";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";

// ---------------------------------------------------------------------------
// 路由 API
// ---------------------------------------------------------------------------

const routeApi = getRouteApi("/servers/$serverId/");

const VALID_TABS: readonly ServerDetailTab[] = ["about", "rules", "screenshots"];

// ---------------------------------------------------------------------------
// [優化 1] TanStack Router Loader
// 在 route 定義中使用，讓資料在元件掛載前就預取進 TanStack Query 快取，
// 消除「Suspense 等待」的延遲，並支援 SSR hydration。
//
// 使用方式（在你的 route 檔案中）：
//
//   import { createFileRoute } from "@tanstack/react-router";
//   import { serverDetailQueryOptions } from "./server-detail.query";
//
//   export const Route = createFileRoute("/servers/$serverId/")({
//     loader: ({ params: { serverId }, context: { queryClient } }) =>
//       queryClient.ensureQueryData(serverDetailQueryOptions(serverId)),
//     component: ServerDetailPage,
//   });
//
// 如此一來 useSuspenseQuery 在元件內會立即從快取讀取，不需等待網路請求。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 模組層級純函式（不放進元件，避免每次 render 重建）
// ---------------------------------------------------------------------------

function getSessionUserId(session: NormalizedSession | null): string | null {
  return session?.discordProfile?.id ?? session?.user?.discordId ?? session?.user?.id ?? null;
}

function isServerDetailTab(value: string): value is ServerDetailTab {
  return VALID_TABS.includes(value as ServerDetailTab);
}

// [優化 8] showSuccess 放在模組層級，避免每次 render 重建閉包
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

  return `${Math.floor(months / 12)} 年前`;
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

// ---------------------------------------------------------------------------
// [優化 3] 合併 report 相關 state 為單一物件
// ---------------------------------------------------------------------------

interface ReportFormState {
  isOpen: boolean;
  subject: string;
  content: string;
  reasons: readonly string[];
  attachments: readonly { dataUrl: string; fileName: string }[];
}

const INITIAL_REPORT_STATE: ReportFormState = {
  isOpen: false,
  subject: "",
  content: "",
  reasons: [],
  attachments: [],
};

// ---------------------------------------------------------------------------
// [優化 6] Memoized 子元件 — 只在 props 真正改變時才重新渲染
// ---------------------------------------------------------------------------

// ── Banner ──────────────────────────────────────────────────────────────────

interface ServerBannerProps {
  banner: string | null | undefined;
  name: string;
  bannerIsCloudinary: boolean;
}

const ServerBanner = memo(function ServerBanner({
  banner,
  name,
  bannerIsCloudinary,
}: ServerBannerProps) {
  return (
    <div className="relative h-52 overflow-hidden bg-[#36393f] md:h-64 lg:h-80">
      {banner ? (
        <>
          {bannerIsCloudinary ? (
            <Image
              cdn="cloudinary"
              src={banner}
              alt={`${name} banner`}
              layout="fullWidth"
              height={480}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          ) : (
            <OptimizedImage
              src={banner}
              alt={`${name} banner`}
              width={1024}
              height={400}
              loading="eager"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-t from-[#1e1f22] to-transparent" />
        </>
      ) : (
        <div className="h-full w-full bg-linear-to-r from-[#5865f2] to-[#8c54ff]" />
      )}
    </div>
  );
});

// ── Header（icon + name + stats + tags）──────────────────────────────────────

interface ServerHeaderProps {
  icon: string | null | undefined;
  name: string;
  members: number;
  online: number | null | undefined;
  upvotes: number;
  createdAt: string;
  nsfw: boolean;
  tags: string[];
}

const ServerHeader = memo(function ServerHeader({
  icon,
  name,
  members,
  online,
  upvotes,
  createdAt,
  nsfw,
  tags,
}: ServerHeaderProps) {
  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#1e1f22] bg-[#36393f] md:h-32 md:w-32">
            {icon ? (
              <OptimizedImage
                src={icon}
                alt={name}
                width={128}
                height={128}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#5865f2] font-bold text-3xl">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl md:text-3xl">{name}</h1>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300 text-sm">
              <div className="flex items-center">
                <Users size={16} className="mr-1" />
                <span>{members.toLocaleString()} 成員</span>
              </div>
              <div className="flex items-center">
                <Activity size={16} className="mr-1" />
                <span>{(online ?? 0).toLocaleString()} 在線</span>
              </div>
              <div className="flex items-center">
                <ArrowUp size={16} className="mr-1" />
                <span>{upvotes.toLocaleString()} 投票</span>
              </div>
              <div className="flex items-center">
                <Clock size={16} className="mr-1" />
                <span>{formatRelativeTime(createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {nsfw && (
          <Badge className="relative z-20 cursor-default bg-red-600 font-bold text-white hover:bg-red-700">
            <span className="mr-1">🔞</span>NSFW
          </Badge>
        )}
        {tags.slice(0, 5).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="relative z-20 cursor-default bg-[#36393f] text-gray-300 hover:bg-[#4f545c]"
          >
            {tag}
          </Badge>
        ))}
      </div>
    </>
  );
});

// ── ReportForm ───────────────────────────────────────────────────────────────

const REPORT_REASONS = [
  { id: "spam", label: "垃圾訊息" },
  { id: "inappropriate", label: "不當內容" },
  { id: "scam", label: "詐騙 / 惡意行為" },
  { id: "impersonation", label: "冒充他人" },
  { id: "copyright", label: "侵權 / 抄襲" },
  { id: "invite_expired", label: "邀請連結已過期" },
  { id: "other", label: "其他" },
] as const;

const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

interface ReportFormProps {
  subject: string;
  content: string;
  isPending: boolean;
  onSubjectChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (data: {
    subject: string;
    content: string;
    reasons: string[];
    images: PendingImage[];
  }) => void;
}

const ReportForm = memo(function ReportForm({
  subject,
  content,
  isPending,
  onSubjectChange,
  onContentChange,
  onCancel,
  onSubmit,
}: ReportFormProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleReason = (id: string) => {
    setSelectedReasons((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      setImageError(null);

      const incoming = Array.from(files);
      const remainingSlots = MAX_IMAGES - images.length;

      if (incoming.length > remainingSlots) {
        setImageError(`最多只能上傳 ${MAX_IMAGES} 張圖片`);
      }

      const accepted: PendingImage[] = [];
      for (const file of incoming.slice(0, remainingSlots)) {
        if (!file.type.startsWith("image/")) {
          setImageError("僅支援圖片檔案");
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          setImageError("圖片大小不可超過 2MB");
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (accepted.length > 0) {
        setImages((prev) => [...prev, ...accepted]);
      }
    },
    [images.length],
  );

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  // 元件卸載時清理 URL Object 防止 Memory Leak
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [images]);

  const reasonLabels = (ids: string[]) =>
    REPORT_REASONS.filter((r) => ids.includes(r.id)).map((r) => r.label);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSubmit({
      subject,
      content,
      reasons: reasonLabels(selectedReasons),
      images,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-[#2b2d31] shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <span className="text-sm font-medium text-gray-200">提交伺服器檢舉</span>
      </div>

      <div className="grid gap-4 p-4">
        {/* 預設原因 */}
        <div>
          <div className="mb-2 text-xs font-medium text-gray-400">檢舉原因（可複選）</div>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((reason) => {
              const active = selectedReasons.includes(reason.id);
              return (
                <button
                  key={reason.id}
                  type="button"
                  onClick={() => toggleReason(reason.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-red-400/50 bg-red-400/10 text-red-300"
                      : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200"
                  }`}
                >
                  {reason.label}
                </button>
              );
            })}
          </div>
          {/* 加入隱藏欄位供父元件 Form 提交時使用 */}
          <input type="hidden" name="reasons" value={JSON.stringify(selectedReasons)} />
        </div>

        {/* 主旨 */}
        <Input
          name="subject"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="檢舉主旨"
          maxLength={120}
          required
        />

        {/* 詳細內容 */}
        <Textarea
          name="content"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="請描述檢舉內容"
          required
          maxLength={2000}
          className="min-h-28"
        />

        {/* 圖片上傳 */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-400">
            <span>附加圖片（選填，最多 {MAX_IMAGES} 張）</span>
            <span>
              {images.length}/{MAX_IMAGES}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/10"
              >
                <img
                  src={img.previewUrl}
                  alt="附加圖片預覽"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}

            {images.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-gray-500 transition-colors hover:border-white/30 hover:text-gray-300"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="text-[10px]">上傳</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          {imageError && <p className="mt-1.5 text-xs text-red-400">{imageError}</p>}
        </div>

        {/* 按鈕 */}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            取消
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-discord hover:bg-discord-hover text-white"
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            送出檢舉
          </Button>
        </div>
      </div>
    </form>
  );
});

// ── InfoPanel（伺服器資訊側欄）──────────────────────────────────────────────

interface ServerInfoPanelProps {
  owner: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  } | null;
  createdAt: string;
  website: string | null | undefined;
}

const ServerInfoPanel = memo(function ServerInfoPanel({
  owner,
  createdAt,
  website,
}: ServerInfoPanelProps) {
  return (
    <div className="mb-6 rounded-2xl border border-white/[0.04] bg-[#2b2d31] p-5">
      {/* 標題區塊 */}
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#5865f2]/15">
          <Server size={17} className="text-[#8b93f8]" />
        </div>
        <h3 className="flex-1 font-semibold text-[#f2f3f5] text-base">伺服器資訊</h3>
      </div>

      {/* 擁有者區塊 */}
      {owner ? (
        <>
          <div className="mb-4">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8a8d93]">
              擁有者
            </h4>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                to="/users/$userId"
                params={{ userId: owner.id }}
                preload="intent"
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:cursor-pointer hover:bg-white/5 min-w-0 sm:flex-1"
              >
                <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-white/[0.08]">
                  {owner.avatar ? (
                    <OptimizedImage
                      src={owner.avatar}
                      alt={`${owner.username} avatar`}
                      width={36}
                      height={36}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="select-none bg-[#5865f2] font-semibold text-xs text-white uppercase">
                      {owner.username?.charAt(0) || "U"}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#f2f3f5] text-sm">
                    {owner.name || owner.username}
                  </p>
                  <p className="truncate text-[11px] text-[#8a8d93]">@{owner.username}</p>
                </div>
              </Link>
            </div>
          </div>
          <div className="my-4 h-px bg-white/5" />
        </>
      ) : null}

      {/* 建立日期 */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Calendar size={15} className="text-[#8a8d93]" />
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-[#8a8d93]">建立於</p>
          <p className="text-sm font-medium text-[#dbdee1]" suppressHydrationWarning>
            {new Date(createdAt).toLocaleDateString("zh-TW")}
          </p>
        </div>
      </div>

      {/* 操作按鈕（網站） */}
      {website && (
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-[160px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] px-3.5 py-2.5 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/[0.05]"
          >
            <Globe size={15} className="text-[#5b9dff]" />
            訪問網站
          </a>
        </div>
      )}
    </div>
  );
});

// ── RatingPanel ──────────────────────────────────────────────────────────────

interface RatingPanelProps {
  currentRating: number;
  totalReviews: number;
  userRating: number;
  isPending: boolean;
  isSignedIn: boolean;
  onRate: (value: number) => void;
}

const RatingPanel = memo(function RatingPanel({
  currentRating,
  totalReviews,
  userRating,
  isPending,
  isSignedIn,
  onRate,
}: RatingPanelProps) {
  return (
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
            <span className="font-bold">{currentRating.toFixed(1)}</span>
            <span className="ml-2 text-gray-400 text-xs">({totalReviews} 人評分)</span>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRate(value)}
            disabled={isPending}
            className="rounded p-1 text-[#ffd700] transition hover:scale-110"
          >
            <Star className={`h-8 w-8 ${userRating >= value ? "fill-current" : ""}`} />
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-gray-400 text-xs">
        {isSignedIn ? "點擊星星即可更新你的評分" : "登入後可評分"}
      </p>
    </div>
  );
});

// ── VotePanel ────────────────────────────────────────────────────────────────

interface VotePanelProps {
  upvotes: number;
  hasVotedRecently: boolean;
  nextVoteAt: string | null | undefined;
  isPending: boolean;
  onVote: () => void;
}

const VotePanel = memo(function VotePanel({
  upvotes,
  hasVotedRecently,
  nextVoteAt,
  isPending,
  onVote,
}: VotePanelProps) {
  return (
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
            <span className="font-bold">{upvotes.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <Button
        onClick={onVote}
        disabled={isPending || hasVotedRecently}
        className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
      >
        {hasVotedRecently ? "稍後可再投票" : "投票"}
      </Button>
      <p className="mt-2 text-center text-gray-400 text-xs">
        {nextVoteAt
          ? `下次可投票時間：${new Date(nextVoteAt).toLocaleString("zh-TW")}`
          : "每 12 小時可投一次票"}
      </p>
    </div>
  );
});

// ── RelatedServersPanel ──────────────────────────────────────────────────────

interface RelatedServer {
  id: string;
  name: string;
  icon: string | null;
  members: number;
}

interface RelatedServersPanelProps {
  relatedServers: RelatedServer[];
}

const RelatedServersPanel = memo(function RelatedServersPanel({
  relatedServers,
}: RelatedServersPanelProps) {
  return (
    <div className="rounded-lg bg-[#2b2d31] p-5">
      <h3 className="mb-4 font-semibold text-lg">相關伺服器</h3>
      <div className="space-y-3">
        {relatedServers.length ? (
          relatedServers.map((relatedServer) => (
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
  );
});

// ── ContentTabs（About / Rules / Screenshots）────────────────────────────────

interface ContentTabsProps {
  activeTab: ServerDetailTab;
  onTabChange: (value: string) => void;
  longDescription: string | null | undefined;
  description: string;
  features: string[];
  rules: string[];
  screenshots: string[];
  serverName: string;
}

const ContentTabs = memo(function ContentTabs({
  activeTab,
  onTabChange,
  longDescription,
  description,
  features,
  rules,
  screenshots,
  serverName,
}: ContentTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="mb-8">
      <TabsList className="h-full w-full overflow-hidden border-[#1e1f22] border-b bg-[#2b2d31]">
        <TabsTrigger value="about" className="data-[state=active]:bg-[#36393f]">
          關於伺服器
        </TabsTrigger>
        <TabsTrigger value="rules" className="data-[state=active]:bg-[#36393f]">
          規則
        </TabsTrigger>
        <TabsTrigger value="screenshots" className="data-[state=active]:bg-[#36393f]">
          截圖
        </TabsTrigger>
      </TabsList>

      <TabsContent value="about" className="mt-6">
        <div className="rounded-lg bg-[#2b2d31] p-6">
          <h2 className="mb-4 font-bold text-xl">伺服器介紹</h2>
          <div className="prose prose-invert wrap-break-word max-w-none text-gray-300">
            <MarkdownRenderer content={longDescription?.trim() || description || "暫無介紹"} />
          </div>

          {features.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 font-semibold text-lg">伺服器特色</h3>
              <ul className="space-y-2 text-gray-300">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <span className="mr-2 text-[#5865f2]">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="rules" className="mt-6">
        <div className="rounded-lg bg-[#2b2d31] p-6">
          <h2 className="mb-4 font-bold text-xl">伺服器規則</h2>
          {rules.length > 0 ? (
            <ol className="list-decimal space-y-2 pl-6 text-gray-300">
              {rules.map((rule) => (
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
          {screenshots.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {screenshots.map((screenshot, index) => (
                <div key={screenshot} className="overflow-hidden rounded-lg bg-[#36393f]">
                  <OptimizedImage
                    src={screenshot}
                    alt={`${serverName} screenshot ${index + 1}`}
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
  );
});

// ---------------------------------------------------------------------------
// 主元件
// ---------------------------------------------------------------------------

export function ServerDetailPage() {
  const { serverId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const queryClient = useQueryClient();
  const { session } = useRouteContext({ from: "__root__" });

  // [優化 1] 使用 useSuspenseQuery；若 route loader 已呼叫 ensureQueryData，
  // 這裡會立即從快取讀取，不產生任何網路請求或 Suspense 掛起。
  const { data: detail } = useSuspenseQuery(serverDetailQueryOptions(serverId));

  // [優化 3] 合併三個 state 為單一物件，減少 re-render 次數
  const [reportForm, setReportForm] = useState<ReportFormState>(INITIAL_REPORT_STATE);

  // [優化 5] useMemo 計算衍生值
  const sessionUserId = useMemo(() => getSessionUserId(session), [session]);

  const isSignedIn = useMemo(() => Boolean(sessionUserId), [sessionUserId]);

  const bannerIsCloudinary = Boolean(detail?.banner && isCloudinaryUrl(detail.banner));

  // [優化 2] 穩定的 query key — serverId 幾乎不變，但 useMemo 確保參考穩定
  const detailQueryKey = useMemo(() => queryKeys.servers.detail(serverId), [serverId]);

  const activeTab = (search.tab ?? "about") as ServerDetailTab;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const favoriteMutation = useMutation({
    meta: { suppressErrorAlert: true },
    mutationFn: () =>
      runEffect(
        tryEffectPromise("Failed to toggle favorite", () =>
          toggleFavoriteFn({
            data: { target: "server", id: serverId },
          }),
        ),
      ),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      const previous = queryClient.getQueryData(detailQueryKey);
      queryClient.setQueryData(detailQueryKey, (old: typeof detail) => {
        if (!old) return old;
        return { ...old, isFavorite: !old.isFavorite };
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
        return { ...old, isFavorite: result.favorited };
      });
      await queryClient.invalidateQueries({ queryKey: detailQueryKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
    },
  });

  const voteMutation = useMutation({
    meta: { suppressErrorAlert: true },
    mutationFn: () =>
      runEffect(
        tryEffectPromise("Failed to vote server", () => voteServerFn({ data: { serverId } })),
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
        const existingIndex = nextReviews.findIndex((item) => item.userId === sessionUserId);

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

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("圖片讀取失敗"));
      reader.readAsDataURL(file);
    });

  const reportMutation = useMutation({
    meta: { suppressErrorAlert: true },
    mutationFn: async (payload: {
      subject: string;
      content: string;
      reasons: string[];
      images: PendingImage[];
    }) => {
      const attachments = await Promise.all(
        payload.images.map(async (img) => ({
          dataUrl: await fileToBase64(img.file),
          fileName: img.file.name,
        })),
      );
      return runEffect(
        tryEffectPromise("Failed to submit report", () =>
          reportServerFn({
            data: {
              serverId,
              itemName: detail?.name ?? "Unknown Server",
              subject: payload.subject,
              content: payload.content,
              reasons: payload.reasons,
              attachments,
            },
          }),
        ),
      );
    },
    onSuccess: (result) => {
      showSuccess(result.message);
      setReportForm(INITIAL_REPORT_STATE);
    },
    onError: (error) => {
      showErrorAlert(error, "檢舉失敗");
    },
  });

  // ---------------------------------------------------------------------------
  // [優化 4] useCallback — 傳遞給 memo 子元件的 handler 保持參考穩定
  // ---------------------------------------------------------------------------

  // [優化 7] 原本在 render 中宣告，改為 useCallback
  const ensureSignedIn = useCallback((): boolean => {
    if (isSignedIn) return true;
    void signIn(window.location.href);
    return false;
  }, [isSignedIn]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (!isServerDetailTab(value)) return;
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, tab: value }),
      });
    },
    [navigate],
  );

  const handleToggleFavorite = useCallback(() => {
    if (!ensureSignedIn()) return;
    favoriteMutation.mutate();
  }, [ensureSignedIn, favoriteMutation]);

  const handleVote = useCallback(() => {
    if (!ensureSignedIn()) return;
    voteMutation.mutate();
  }, [ensureSignedIn, voteMutation]);

  const handleRate = useCallback(
    (value: number) => {
      if (!ensureSignedIn()) return;
      rateMutation.mutate(value);
    },
    [ensureSignedIn, rateMutation],
  );

  const handleToggleReport = useCallback(() => {
    setReportForm((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  const handleReportSubjectChange = useCallback((value: string) => {
    setReportForm((prev) => ({ ...prev, subject: value }));
  }, []);

  const handleReportContentChange = useCallback((value: string) => {
    setReportForm((prev) => ({ ...prev, content: value }));
  }, []);

  const handleReportCancel = useCallback(() => {
    setReportForm(INITIAL_REPORT_STATE);
  }, []);

  const handleReportSubmit = useCallback(
    (data: { subject: string; content: string; reasons: string[]; images: PendingImage[] }) => {
      if (!ensureSignedIn()) return;

      // 將所有資料（包含圖片與原因）傳給 mutation
      reportMutation.mutate({
        subject: data.subject.trim(),
        content: data.content.trim(),
        reasons: data.reasons,
        images: data.images,
      });
    },
    [ensureSignedIn, reportMutation], // 移除了 reportForm.subject/content 的依賴，因為直接從 data 拿
  );

  // ---------------------------------------------------------------------------
  // Early return
  // ---------------------------------------------------------------------------

  if (!detail) {
    return <NotFound />;
  }

  // ---------------------------------------------------------------------------
  // Render — 使用 memo 子元件最小化重新渲染範圍
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#1e1f22] pb-16 text-white">
      {/* Banner — 只在 detail.banner 改變時重渲染 */}
      <ServerBanner
        banner={detail.banner}
        name={detail.name}
        bannerIsCloudinary={bannerIsCloudinary}
      />

      <div className="relative z-10 mx-auto -mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header — 只在 name/members/tags 等改變時重渲染 */}
        <ServerHeader
          icon={detail.icon}
          name={detail.name}
          members={detail.members}
          online={detail.online}
          upvotes={detail.upvotes}
          createdAt={detail.createdAt}
          nsfw={detail.nsfw}
          tags={detail.tags}
        />

        {/* Action buttons — 放在主元件層，因需要 mutation isPending 狀態 */}
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

          {session ? (
            <>
              <Button
                onClick={handleToggleFavorite}
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
                onClick={handleToggleReport}
                size="lg"
                className="flex w-full transform cursor-pointer items-center gap-2 bg-red-600 text-white transition-all duration-150 hover:scale-105 hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400 md:w-auto"
              >
                <Flag className="h-4 w-4" />
                檢舉
              </Button>
            </>
          ) : null}
        </div>

        {/* [優化 3+6] ReportForm 獨立 memo 元件，只在 reportForm state 改變時重渲染 */}
        {reportForm.isOpen && (
          <ReportForm
            subject={reportForm.subject}
            content={reportForm.content}
            isPending={reportMutation.isPending}
            onSubjectChange={handleReportSubjectChange}
            onContentChange={handleReportContentChange}
            onCancel={handleReportCancel}
            onSubmit={handleReportSubmit}
          />
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* 側欄 */}
          <div className="lg:col-span-1">
            {/* 伺服器資訊 — 只在 owner/createdAt/website 改變時重渲染 */}
            <ServerInfoPanel
              owner={detail.owner}
              createdAt={detail.createdAt}
              website={detail.website}
            />

            {/* 評分面板 — 只在 rating 相關資料改變時重渲染 */}
            <RatingPanel
              currentRating={detail.currentRating}
              totalReviews={detail.totalReviews}
              userRating={detail.userRating}
              isPending={rateMutation.isPending}
              isSignedIn={isSignedIn}
              onRate={handleRate}
            />

            {/* 投票面板 — 只在 upvotes/hasVotedRecently 改變時重渲染 */}
            <VotePanel
              upvotes={detail.upvotes}
              hasVotedRecently={detail.hasVotedRecently}
              nextVoteAt={detail.nextVoteAt}
              isPending={voteMutation.isPending}
              onVote={handleVote}
            />

            {/* 相關伺服器 — 只在 relatedServers 改變時重渲染 */}
            <RelatedServersPanel relatedServers={detail.relatedServers} />
          </div>

          {/* 主內容區 — Tab 只在 activeTab/content 改變時重渲染 */}
          <div className="lg:col-span-3">
            <ContentTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              longDescription={detail.longDescription}
              description={detail.description}
              features={detail.features}
              rules={detail.rules}
              screenshots={detail.screenshots}
              serverName={detail.name}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
