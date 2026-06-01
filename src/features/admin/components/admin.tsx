// ============================================================
// routes/admin/dashboard.tsx  (TanStack Start file-based route)
// SSR loader  +  lazy tab hydration  +  Suspense boundaries
// ============================================================
import { Await, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	adminGetAllBots,
	adminGetAllServers,
	adminGetDashboardCounts,
	getReports,
} from "#/features/admin/admin.server";
import type { Bot, DiscordServer, Report } from "#/types/admin";

// ── Lazy-loaded panels (code-split) ───────────────────────
const BotApplications = lazy(() => import("../components/bot-applications"));
const BotServerManagement = lazy(() => import("./bot-server-management"));
const ReportInbox = lazy(() => import("../../../components/report-inbox"));

type BotResult = Awaited<ReturnType<typeof adminGetAllBots>>;
type ServerResult = Awaited<ReturnType<typeof adminGetAllServers>>;
type ReportResult = Awaited<ReturnType<typeof getReports>>;

export const Route = createFileRoute("/protected/admin")({
	loader: async () => {
		// Eagerly await: small query, needed for badge SSR hydration
		const counts = await adminGetDashboardCounts();

		// Deferred: full list queries — streamed after shell paint
		const botsPromise = adminGetAllBots();
		const serversPromise = adminGetAllServers();
		const reportsPromise = getReports();

		return {
			// 修正：從 counts.success 改為 counts.data
			counts: counts.success
				? counts.data
				: { pendingBots: 0, pendingReports: 0 },
			botsPromise,
			serversPromise,
			reportsPromise,
		};
	},
	component: AdminDashboard,
});

function PanelSkeleton() {
	// Generate a fixed array of unique IDs once per render
	const skeletonRows = Array.from({ length: 3 }, () => ({
		id: crypto.randomUUID(),
	}));

	return (
		<div className="animate-pulse space-y-3 rounded-md border border-[#202225] bg-[#2F3136] p-6">
			{skeletonRows.map((row, i) => (
				<div
					key={row.id}
					className="h-4 rounded bg-[#36393F]"
					style={{ width: `${80 - i * 15}%` }}
				/>
			))}
		</div>
	);
}

// ── AdminDashboard (page component) ───────────────────────

// 輔助函式：將後端 ORM 結構 (關聯表) 轉換為前端預期的 Bot 型別
function normalizeBots(botsData: any[]): Bot[] {
	return botsData.map((bot) => ({
		...bot,
		// 提取 user 物件，解決 developers 型別不相容的問題
		developers: bot.developers?.map((d: any) => d.user ?? d) ?? [],
	})) as Bot[];
}

function AdminDashboard() {
	const { counts, botsPromise, serversPromise, reportsPromise } =
		Route.useLoaderData();

	// Tabs
	const [activeTab, setActiveTab] = useState<
		"applications" | "management" | "reports"
	>("applications");

	// Resolved data — populated when each tab is first visited
	const [bots, setBots] = useState<Bot[] | null>(null);
	const [servers, setServers] = useState<DiscordServer[] | null>(null);
	const [reports, setReports] = useState<Report[] | null>(null);

	// Resolve management data when tab is activated
	useEffect(() => {
		if (activeTab !== "management" || bots) return;
		void Promise.all([botsPromise, serversPromise]).then(([b, s]) => {
			// 套用 normalizeBots 修復型別與資料結構錯誤
			if (b.success && b.data) setBots(normalizeBots(b.data));
			if (s.success && s.data) setServers(s.data as DiscordServer[]);
		});
	}, [activeTab, bots, botsPromise, serversPromise]);

	// Resolve reports when tab is activated
	useEffect(() => {
		if (activeTab !== "reports" || reports) return;
		void reportsPromise.then((r: ReportResult) => {
			if (r.success && r.data) setReports(r.data as Report[]);
		});
	}, [activeTab, reports, reportsPromise]);

	// Pending bot count derived from live bot state (SSR seed → live)
	// "applications" tab shows pending bots — we resolve its promise eagerly
	const [initialBots, setInitialBots] = useState<Bot[] | null>(null);
	useEffect(() => {
		void botsPromise.then((r: BotResult) => {
			if (r.success && r.data) setInitialBots(normalizeBots(r.data));
		});
	}, [botsPromise]);

	const pendingBotCount = useMemo(
		() =>
			initialBots?.filter((b) => b.status === "pending").length ??
			counts.pendingBots,
		[initialBots, counts.pendingBots],
	);

	const pendingReportCount = useMemo(
		() =>
			reports?.filter((r) => r.status === "pending").length ??
			counts.pendingReports,
		[reports, counts.pendingReports],
	);

	return (
		<Tabs
			defaultValue="applications"
			value={activeTab}
			onValueChange={(v) => setActiveTab(v as typeof activeTab)}
			className="space-y-4"
		>
			<TabsList className="flex h-auto w-full flex-wrap gap-1 bg-[#2F3136] p-1 text-white">
				<TabsTrigger
					value="applications"
					className="min-w-fit flex-1 py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
				>
					待審核機器人
					{pendingBotCount > 0 && (
						<span className="ml-2 rounded-full bg-[#ED4245] px-2 py-0.5 text-xs">
							{pendingBotCount}
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
					{pendingReportCount > 0 && (
						<span className="ml-2 rounded-full bg-[#ED4245] px-2 py-0.5 text-xs">
							{pendingReportCount}
						</span>
					)}
				</TabsTrigger>
			</TabsList>

			{/* Applications tab — uses Await to stream pending bots */}
			<TabsContent value="applications" className="mt-4 space-y-4">
				<Suspense fallback={<PanelSkeleton />}>
					<Await promise={botsPromise}>
						{(result) => {
							const r = result as BotResult; // <-- narrow from unknown
							return r.success && r.data ? (
								<BotApplications
									applications={normalizeBots(r.data).filter(
										(b) => b.status === "pending",
									)}
								/>
							) : (
								<p className="text-red-400 text-sm">
									載入失敗：
									{"error" in r ? String(r.error) : "未知錯誤"}
								</p>
							);
						}}
					</Await>
				</Suspense>
			</TabsContent>

			{/* Management tab — lazy fetch on first visit */}
			<TabsContent value="management" className="mt-4 space-y-4">
				{bots && servers ? (
					<Suspense fallback={<PanelSkeleton />}>
						<BotServerManagement bots={bots} servers={servers} />
					</Suspense>
				) : (
					<PanelSkeleton />
				)}
			</TabsContent>

			{/* Reports tab — lazy fetch on first visit */}
			<TabsContent value="reports" className="mt-4 space-y-4">
				{reports ? (
					<Suspense fallback={<PanelSkeleton />}>
						<ReportInbox reports={reports} />
					</Suspense>
				) : (
					<PanelSkeleton />
				)}
			</TabsContent>
		</Tabs>
	);
}
