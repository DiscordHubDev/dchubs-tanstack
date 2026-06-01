// ============================================================
// routes/admin/dashboard.tsx  (TanStack Start file-based route)
// SSR loader  +  lazy tab hydration  +  Suspense boundaries
// ============================================================
import { Await, createFileRoute, defer } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	adminGetAllBots,
	adminGetAllServers,
	adminGetDashboardCounts,
	getReports,
} from "#/features/admin/admin.functions";
import type { Bot, DiscordServer, Report } from "#/types/admin";

// ── Lazy-loaded panels (code-split) ───────────────────────
const BotApplications = lazy(
	() => import("../../features/admin/components/bot-applications"),
);
const BotServerManagement = lazy(
	() => import("../../features/admin/components/bot-server-management"),
);
const ReportInbox = lazy(
	() => import("../../features/admin/components/report-inbox"),
);

type BotResult = Awaited<ReturnType<typeof adminGetAllBots>>;
type ServerResult = Awaited<ReturnType<typeof adminGetAllServers>>;
type ReportResult = Awaited<ReturnType<typeof getReports>>;

export const Route = createFileRoute("/protected/admin")({
	loader: async () => {
		// Eagerly await: small query, needed for badge SSR hydration
		const counts = await adminGetDashboardCounts();

		// Deferred: full list queries — streamed after shell paint
		return {
			counts: counts.success
				? counts.data
				: { pendingBots: 0, pendingReports: 0 },
			botsPromise: defer(adminGetAllBots()),
			serversPromise: defer(adminGetAllServers()),
			reportsPromise: defer(getReports()),
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
		// 🌟 已修正：將 bg-[#2F3136] 改為 bg-[#2b2d31]
		<div className="animate-pulse space-y-3 rounded-md border border-[#202225] bg-[#2b2d31] p-6">
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

// ── Data Normalization Helpers ───────────────────────

function normalizeBots(botsData: any[]): Bot[] {
	return botsData.map((bot) => ({
		...bot,
		developers: bot.developers?.map((d: any) => d.user ?? d) ?? [],
	})) as Bot[];
}

// 🌟 新增：輔助函式，用來修復 DiscordServer 的關聯資料結構錯誤
function normalizeServers(serversData: any[]): DiscordServer[] {
	return serversData.map((server) => ({
		...server,
		// 處理 owner 的層級結構
		owner: server.owner?.user ?? server.owner ?? null,
		// 提取 user 物件，解決 admins 型別不相容（缺少 id, username）的問題
		admins: server.admins?.map((a: any) => a.user ?? a) ?? [],
	})) as DiscordServer[];
}

function normalizeReports(reportsData: any[]): Report[] {
	return reportsData.map((report) => ({
		...report,
		attachments:
			report.attachments?.map((attachment: string | any) => {
				return typeof attachment === "string"
					? { url: attachment }
					: attachment;
			}) ?? [],
		handledBy: report.handledBy || null,
	})) as unknown as Report[];
}

// ── AdminDashboard (page component) ───────────────────────

function AdminDashboard() {
	const { counts, botsPromise, serversPromise, reportsPromise } =
		Route.useLoaderData() as {
			counts: { pendingBots: number; pendingReports: number };
			botsPromise: Promise<BotResult>;
			serversPromise: Promise<ServerResult>;
			reportsPromise: Promise<ReportResult>;
		};

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
			if (b.success && b.data) setBots(normalizeBots(b.data));
			// 🌟 已修正：套用 normalizeServers 修正巢狀資料結構與斷言錯誤
			if (s.success && s.data) setServers(normalizeServers(s.data));
		});
	}, [activeTab, bots, botsPromise, serversPromise]);

	// Resolve reports when tab is activated
	useEffect(() => {
		if (activeTab !== "reports" || reports) return;
		void reportsPromise.then((r: ReportResult) => {
			if (r.success && r.data) setReports(normalizeReports(r.data));
		});
	}, [activeTab, reports, reportsPromise]);

	// Pending bot count derived from live bot state (SSR seed → live)
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
			className="space-y-4 bg-[#2b2d31]"
		>
			<TabsList className="flex h-auto w-full flex-wrap gap-1 bg-[#2b2d31] p-1 text-white">
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

			{/* Applications tab */}
			<TabsContent value="applications" className="mt-4 space-y-4">
				<Suspense fallback={<PanelSkeleton />}>
					<Await promise={botsPromise}>
						{(result) => {
							const r = result as BotResult;
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

			{/* Management tab */}
			<TabsContent value="management" className="mt-4 space-y-4">
				{bots && servers ? (
					<Suspense fallback={<PanelSkeleton />}>
						<BotServerManagement bots={bots} servers={servers} />
					</Suspense>
				) : (
					<PanelSkeleton />
				)}
			</TabsContent>

			{/* Reports tab */}
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
