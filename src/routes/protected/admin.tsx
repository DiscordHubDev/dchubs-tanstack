// ============================================================
// routes/admin/dashboard.tsx  (TanStack Start file-based route)
// ============================================================
import { Await, createFileRoute, defer } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
  adminGetAllBotsFn,
  adminGetAllServersFn,
  adminGetDashboardCountsFn,
  getReportsFn,
} from "#/features/admin/admin.functions";
import type { Bot, DiscordServer, Report } from "#/types/admin";

// ── Lazy-loaded panels (code-split) ───────────────────────
const BotApplications = lazy(() => import("../../features/admin/components/bot-applications"));
const BotServerManagement = lazy(
  () => import("../../features/admin/components/bot-server-management"),
);
const ReportInbox = lazy(() => import("../../features/admin/components/report-inbox"));
// 🌟 匯入 UserManagement
const UserManagement = lazy(() => import("../../features/admin/components/user-management"));

type BotResult = Awaited<ReturnType<typeof adminGetAllBotsFn>>;
type ServerResult = Awaited<ReturnType<typeof adminGetAllServersFn>>;
type ReportResult = Awaited<ReturnType<typeof getReportsFn>>;

export const Route = createFileRoute("/protected/admin")({
  loader: async () => {
    // Eagerly await: 小資料，SSR 階段阻擋以確保 Badge 數量有正確的初始 HTML
    const counts = await adminGetDashboardCountsFn();

    // Deferred: 大量列表資料，不阻塞頁面首次繪製
    return {
      counts: counts.success ? counts.data : { pendingBots: 0, pendingReports: 0 },
      botsPromise: defer(adminGetAllBotsFn()),
      serversPromise: defer(adminGetAllServersFn()),
      reportsPromise: defer(getReportsFn()),
    };
  },
  component: AdminDashboard,
});

function PanelSkeleton() {
  // 💡 改用穩定的靜態陣列，不再呼叫隨機函式
  const skeletonRows = [1, 2, 3];

  return (
    <div className="animate-pulse space-y-3 rounded-md border border-[#202225] bg-[#2b2d31] p-6">
      {skeletonRows.map((_row, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: safe
          key={i}
          className="h-4 rounded bg-[#36393F]"
          style={{ width: `${80 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

// ── Data Normalization Helpers ───────────────────────

function normalizeBots(botsData: any[]): Bot[] {
  return botsData.map((bot) => ({
    ...bot,
    developers: bot.developers?.map((d: any) => d.user ?? d) ?? [],
  })) as Bot[];
}

function normalizeServers(serversData: any[]): DiscordServer[] {
  return serversData.map((server) => ({
    ...server,
    owner: server.owner?.user ?? server.owner ?? null,
    admins: server.admins?.map((a: any) => a.user ?? a) ?? [],
  })) as DiscordServer[];
}

function normalizeReports(reportsData: any[]): Report[] {
  return reportsData.map((report) => ({
    ...report,
    attachments:
      report.attachments?.map((attachment: string | any) => {
        return typeof attachment === "string" ? { url: attachment } : attachment;
      }) ?? [],
    handledBy: report.handledBy || null,
  })) as unknown as Report[];
}

// ── AdminDashboard (page component) ───────────────────────

function AdminDashboard() {
  const { counts, botsPromise, serversPromise, reportsPromise } = Route.useLoaderData() as {
    counts: { pendingBots: number; pendingReports: number };
    botsPromise: Promise<BotResult>;
    serversPromise: Promise<ServerResult>;
    reportsPromise: Promise<ReportResult>;
  };

  // 🌟 新增了 "users" tab 狀態
  const [activeTab, setActiveTab] = useState<"applications" | "management" | "reports" | "users">(
    "applications",
  );

  return (
    <Tabs
      defaultValue="applications"
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      className="space-y-4 bg-[#2b2d31]"
    >
      <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-[#2b2d31] p-1 text-white">
        <TabsTrigger
          value="applications"
          className="min-w-fit flex-1 py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
        >
          待審核機器人
          {counts.pendingBots > 0 && (
            <span className="ml-2 rounded-full bg-[#ED4245] px-2 py-0.5 text-xs">
              {counts.pendingBots}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger
          value="management"
          className="min-w-fit flex-1 py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
        >
          管理機器人和伺服器
        </TabsTrigger>

        <TabsTrigger
          value="reports"
          className="min-w-fit flex-1 py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
        >
          檢舉收件匣
          {counts.pendingReports > 0 && (
            <span className="ml-2 rounded-full bg-[#ED4245] px-2 py-0.5 text-xs">
              {counts.pendingReports}
            </span>
          )}
        </TabsTrigger>

        {/* 🌟 增加系統用戶管理 Tab */}
        <TabsTrigger
          value="users"
          className="min-w-fit flex-1 py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
        >
          系統用戶管理
        </TabsTrigger>
      </TabsList>

      {/* Applications tab */}
      <TabsContent value="applications" className="mt-4 space-y-4">
        <Suspense fallback={<PanelSkeleton />}>
          <Await promise={botsPromise}>
            {(result) => {
              const r = result as BotResult;
              if (!r.success || !r.data) {
                return (
                  <p className="text-red-400 text-sm">
                    載入失敗：{"error" in r ? String(r.error) : "未知錯誤"}
                  </p>
                );
              }
              const pendingBots = normalizeBots(r.data).filter((b) => b.status === "pending");
              return <BotApplications applications={pendingBots} />;
            }}
          </Await>
        </Suspense>
      </TabsContent>

      {/* Management tab - 🚀 效能優化：不再使用 useState/useEffect 等待 Promise */}
      <TabsContent value="management" className="mt-4 space-y-4">
        <Suspense fallback={<PanelSkeleton />}>
          <Await promise={Promise.all([botsPromise, serversPromise])}>
            {([bResult, sResult]) => {
              const bots = bResult.success && bResult.data ? normalizeBots(bResult.data) : [];
              const servers = sResult.success && sResult.data ? normalizeServers(sResult.data) : [];
              return <BotServerManagement bots={bots} servers={servers} />;
            }}
          </Await>
        </Suspense>
      </TabsContent>

      {/* Reports tab - 🚀 同樣完全依賴 Suspense + Await */}
      <TabsContent value="reports" className="mt-4 space-y-4">
        <Suspense fallback={<PanelSkeleton />}>
          <Await promise={reportsPromise}>
            {(r) => {
              if (!r.success || !r.data) return <p className="text-red-400">載入失敗</p>;
              return <ReportInbox reports={normalizeReports(r.data)} />;
            }}
          </Await>
        </Suspense>
      </TabsContent>

      {/* 🌟 Users Tab - 內部已有 TanStack Query 負責取資料，直接掛載 */}
      <TabsContent value="users" className="mt-4 space-y-4">
        <Suspense fallback={<PanelSkeleton />}>
          <UserManagement />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
