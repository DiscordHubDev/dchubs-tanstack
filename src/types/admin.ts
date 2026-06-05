// ============================================================
// types/admin.ts
// 統一型別定義 — 由 Drizzle ORM 自動推導
// ============================================================

import type {
	BuildQueryResult,
	DBQueryConfig,
	ExtractTablesWithRelations,
	InferSelectModel,
} from "drizzle-orm";
import type { LucideIcon } from "lucide-react";
import type * as schema from "@/drizzle/schema";

// ── 1. Domain primitives (直接從 Drizzle Enum 推導) ─────────
// 透過 .enumValues[number] 自動將 Enum 轉為 Union Type
export type BotStatus = (typeof schema.status.enumValues)[number]; // "pending" | "approved" | "rejected"
export type ReportStatus = (typeof schema.reportStatus.enumValues)[number]; // "pending" | "resolved" | "rejected"
export type ReportSeverity = (typeof schema.reportSeverity.enumValues)[number]; // "severe" | "moderate" | "low" | "untagged"
export type ReportTargetType = (typeof schema.reportType.enumValues)[number]; // "bot" | "server"
export type ItemKind = "bot" | "server";

// ── 2. 基礎單表 Entities ──────────────────────────────────
type BaseUser = InferSelectModel<typeof schema.user>;

// 抽取 UI 需要的使用者基礎欄位 (將 Drizzle 的關聯與真實需求橋接)
export interface Developer
	extends Pick<
		BaseUser,
		"id" | "username" | "avatar" | "banner" | "bannerColor" | "bio" | "name"
	> {
	readonly joinedAt: string; // schema 設定為 mode: "string"
}

export interface ServerOwner
	extends Pick<BaseUser, "id" | "username" | "name"> {}

// ── 3. 複雜關聯 Entities (精準推導 db.query 的回傳結果) ──────

type SchemaTables = ExtractTablesWithRelations<typeof schema>;

// 🤖 Bot 型別推導
type BotQueryConfig = DBQueryConfig<
	"one",
	true,
	SchemaTables,
	SchemaTables["bot"]
> & {
	// 對應 botRelations 中的 developers 關聯，並進一步抓出 user
	with: { developers: { with: { user: true } } };
};

type DrizzleBotResult = BuildQueryResult<
	SchemaTables,
	SchemaTables["bot"],
	BotQueryConfig
>;

// 展平多對多中介表：將 { developers: { user: ... }[] } 轉為單純的 Developer[]
export type Bot = Omit<DrizzleBotResult, "developers"> & {
	readonly developers: readonly Developer[];
};

// 🌐 DiscordServer 型別推導
type ServerQueryConfig = DBQueryConfig<
	"one",
	true,
	SchemaTables,
	SchemaTables["server"]
> & {
	// 對應 serverRelations 中的 owner 與 admins 關聯
	with: { owner: true; admins: { with: { user: true } } };
};

type DrizzleServerResult = BuildQueryResult<
	SchemaTables,
	SchemaTables["server"],
	ServerQueryConfig
>;

// 展平多對多中介表與過濾 owner 欄位
export type DiscordServer = Omit<DrizzleServerResult, "admins" | "owner"> & {
	readonly owner: ServerOwner | null;
	readonly admins: readonly ServerOwner[];
};

// 📋 Report 型別推導
export interface ReportAttachment {
	readonly public_id: string;
	readonly url: string;
	readonly type: "image" | "video" | "file";
}

type ReportQueryConfig = DBQueryConfig<
	"one",
	true,
	SchemaTables,
	SchemaTables["report"]
> & {
	// 對應 reportRelations 中的 reportedBy 與 handledBy 關聯
	with: { reportedBy: true; handledBy: true };
};

type DrizzleReportResult = BuildQueryResult<
	SchemaTables,
	SchemaTables["report"],
	ReportQueryConfig
>;

// 覆寫 JSONB 型別，並將關聯的 User 簡化為 UI 需要的結構
export type Report = Omit<
	DrizzleReportResult,
	"attachments" | "reportedBy" | "handledBy"
> & {
	readonly attachments: readonly ReportAttachment[]; // 強制覆蓋 JSONB 的 unknown 型別
	readonly reportedBy: { readonly id: string; readonly username: string };
	readonly handledBy: { readonly username: string } | null;
};

// ── 4. Discriminated union for managed items (保持不變) ──
export type ManagedBot = Bot & { readonly kind: "bot" };
export type ManagedServer = DiscordServer & { readonly kind: "server" };
export type ManagedItem = ManagedBot | ManagedServer;

// ── 5. UI config types (保持不變，因為這跟資料庫無關) ──────
export interface StatusConfig {
	readonly label: string;
	readonly className: string;
}

export interface SeverityLevel {
	readonly value: ReportSeverity;
	readonly label: string;
	readonly color: string;
	readonly icon: LucideIcon;
}

// ── 6. Server action return types (保持不變) ─────────────
export interface ActionResult<T = void> {
	readonly success: boolean;
	readonly data?: T;
	readonly error?: string;
}
