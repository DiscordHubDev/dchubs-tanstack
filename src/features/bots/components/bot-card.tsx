import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUp, Clock, Heart, Pin, Users } from "lucide-react";
import { memo } from "react";
import { FaCheck } from "react-icons/fa6";
import { OptimizedImage } from "#/components/OptimizedImage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { formatTime } from "#/utils/time";
import type { PublicBot } from "../bots.types";

type BotCardProps = {
  item: PublicBot;
  /** 是否為首屏可見項目（前幾筆優先載入圖片） */
  priority?: boolean;
};

function BotCard({ item, priority = false }: BotCardProps) {
  return (
    <article className="relative rounded-xl border border-white/10 bg-[#2b2d31] p-4 transition hover:border-white/20">
      {/* 整張卡片可點擊，用絕對定位的 Link 覆蓋，避免巢狀互動元素衝突 */}
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
        {/* 效能優化：首屏前幾張核心圖片直接強制加載，其餘卡片使用延遲載入 */}
        <OptimizedImage
          src={item.icon ?? "https://cdn.discordapp.com/embed/avatars/0.png"}
          alt={`${item.name} icon`}
          width={64}
          height={64}
          className="h-16 w-16 rounded-xl object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />

        <div className="min-w-0 flex-1">
          <BotCardHeader item={item} />

          <p className="line-clamp-2 text-gray-300 text-sm">{item.description}</p>

          <BotCardMeta item={item} />

          <div className="mt-3 flex flex-wrap gap-2">
            {item.nsfw && (
              <Badge
                variant="destructive"
                className="relative z-20 cursor-default bg-red-600 font-bold text-white hover:bg-red-700"
              >
                <span className="mr-1">🔞</span> NSFW
              </Badge>
            )}

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

        <BotCardAction item={item} />
      </div>
    </article>
  );
}

// ─── 子區塊拆分 ─────────────────────────────────

function BotCardHeader({ item }: { item: PublicBot }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h3 className="inline-flex items-center gap-2 font-semibold text-lg text-white">
        <span>{item.name}</span>
        {item.pin && <Pin className="h-4 w-4 text-gray-400" />}
      </h3>

      {item.verified && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="relative z-20 inline-flex cursor-default items-center gap-1 rounded-full bg-[#5865F2] px-3 text-sm text-white hover:bg-[#4752c4] hover:text-white">
                <FaCheck className="h-3.5 w-3.5" />
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
              <div className="relative z-20 text-yellow-600 hover:text-yellow-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm rounded-md border border-yellow-400 bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
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
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-1 font-semibold text-rose-600 text-xs">
          <Heart className="h-3.5 w-3.5 fill-rose-500 stroke-rose-500" />
          已收藏
        </span>
      )}
    </div>
  );
}

function BotCardMeta({ item }: { item: PublicBot }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    if (item.approvedAt) {
      setTime(formatTime(item.approvedAt));
    } else {
      setTime(formatTime(new Date().toISOString()));
    }
  }, [item.approvedAt]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-gray-400 text-sm">
      <span className="inline-flex items-center gap-1">
        <Users className="h-4 w-4" />
        {item.servers.toLocaleString()} 伺服器
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowUp className="h-4 w-4" />
        {item.upvotes.toLocaleString()} 票
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-4 w-4" />
        {time}
      </span>
    </div>
  );
}

function BotCardAction({ item }: { item: PublicBot }) {
  if (item.inviteUrl) {
    return (
      <div className="relative z-20 flex items-center sm:items-start">
        <a href={item.inviteUrl} target="_blank" rel="noopener noreferrer">
          <Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">立即邀請</Button>
        </a>
      </div>
    );
  }

  if (item.website) {
    return (
      <div className="relative z-20 flex items-center sm:items-start">
        <a href={item.website} target="_blank" rel="noopener noreferrer">
          <Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">前往網站</Button>
        </a>
      </div>
    );
  }
}

function areBotsEqual(prev: BotCardProps, next: BotCardProps) {
  return (
    prev.item.id === next.item.id &&
    prev.item.isFavorite === next.item.isFavorite &&
    prev.item.upvotes === next.item.upvotes &&
    prev.item.servers === next.item.servers &&
    prev.priority === next.priority // 當 priority 改變時，必須重繪以確保圖片屬性更新
  );
}

export default memo(BotCard, areBotsEqual);
