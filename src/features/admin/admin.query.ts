// src/features/admin/admin.query.ts
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import {
	adminGetAllBotsFn,
	adminGetAllServersFn,
	adminGetDashboardCountsFn,
	getReportsFn,
	getUsersFn,
} from "./admin.functions";

// 這裡只放 GET 請求的 queryOptions
export const adminBotsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.bots(), // 👈 使用全域 queryKeys
		queryFn: () => adminGetAllBotsFn(),
	});

export const adminServersQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.servers(), // 👈 使用全域 queryKeys
		queryFn: () => adminGetAllServersFn(),
	});

export const adminReportsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.reports(), // 👈 使用全域 queryKeys
		queryFn: () => getReportsFn(),
	});

export const adminDashboardCountsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.admin.dashboardCounts(), // 👈 使用全域 queryKeys
		queryFn: () => adminGetDashboardCountsFn(),
	});

export const adminUsersInfiniteQueryOptions = (search: string = "") =>
	infiniteQueryOptions({
		// 將 search 加入 queryKey，這樣搜尋字串改變時，React Query 才會自動重新拉取並分開快取
		queryKey: [...queryKeys.admin.users(), { search }],

		// React Query 會自動傳入 pageParam
		queryFn: async ({ pageParam = 1 }) => {
			// 呼叫你的 Server Function 並帶入參數
			return getUsersFn({
				data: { search, page: pageParam, limit: 20 },
			});
		},

		initialPageParam: 1,

		// 這裡會接收 getUsersFn 回傳的 { users, nextCursor }
		// 若 nextCursor 為 null，回傳 undefined 告訴 React Query 已經沒有下一頁了
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});
