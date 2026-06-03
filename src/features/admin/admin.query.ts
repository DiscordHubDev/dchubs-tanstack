// src/features/admin/admin.query.ts
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import {
	getAllBotsFn,
	getAllServersFn,
	getDashboardCountsFn,
	getReportsFn,
} from "./admin.server";

// 這裡只放 GET 請求的 queryOptions
export const adminBotsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.bots(), // 👈 使用全域 queryKeys
		queryFn: () => getAllBotsFn(),
	});

export const adminServersQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.servers(), // 👈 使用全域 queryKeys
		queryFn: () => getAllServersFn(),
	});

export const adminReportsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.reports(), // 👈 使用全域 queryKeys
		queryFn: () => getReportsFn(),
	});

export const adminDashboardCountsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.dashboardCounts(), // 👈 使用全域 queryKeys
		queryFn: () => getDashboardCountsFn(),
	});
