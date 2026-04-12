// hooks/queries/use-inbox.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Effect } from "effect";
import { fetchJsonEffect, runEffect } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import type { Mail } from "#/lib/types";
import { useSession } from "@/lib/auth-client";

const fetchInbox = (): Promise<Mail[]> =>
	runEffect(
		fetchJsonEffect("/api/inbox").pipe(Effect.map((json) => json as Mail[])),
	);

/**
 * 收件匣 Hook - 使用 Tanstack Query 管理郵件資料
 * 包含自動重新獲取、樂觀更新等功能
 */
export function useInbox() {
	const { data: session } = useSession();
	const userId = session?.discordProfile?.id ?? "";
	const queryClient = useQueryClient();

	// 🚀 使用 Tanstack Query 獲取收件匣
	const {
		data: mails = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.inbox.list(userId),
		queryFn: fetchInbox,
		enabled: !!userId,
		staleTime: 30 * 1000, // 30 秒
		refetchInterval: 60 * 1000, // 每分鐘自動重新獲取
	});

	// 標記已讀 mutation
	const markAsReadMutation = useMutation({
		mutationFn: (mailId: string) =>
			runEffect(
				fetchJsonEffect("/api/inbox", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: mailId }),
				}),
			),
		onMutate: async (mailId) => {
			// 樂觀更新
			await queryClient.cancelQueries({
				queryKey: queryKeys.inbox.list(userId),
			});
			const previousMails = queryClient.getQueryData<Mail[]>(
				queryKeys.inbox.list(userId),
			);

			queryClient.setQueryData<Mail[]>(
				queryKeys.inbox.list(userId),
				(old) =>
					old?.map((mail) =>
						mail.id === mailId ? { ...mail, read: true } : mail,
					) ?? [],
			);

			return { previousMails };
		},
		onError: (_err, _mailId, context) => {
			// 回滾
			if (context?.previousMails) {
				queryClient.setQueryData(
					queryKeys.inbox.list(userId),
					context.previousMails,
				);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.inbox.list(userId) });
		},
	});

	// 刪除郵件 mutation
	const deleteMailMutation = useMutation({
		mutationFn: (mailId: string) =>
			runEffect(
				fetchJsonEffect(`/api/inbox?id=${encodeURIComponent(mailId)}`, {
					method: "DELETE",
				}),
			),
		onMutate: async (mailId) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.inbox.list(userId),
			});
			const previousMails = queryClient.getQueryData<Mail[]>(
				queryKeys.inbox.list(userId),
			);

			queryClient.setQueryData<Mail[]>(
				queryKeys.inbox.list(userId),
				(old) => old?.filter((mail) => mail.id !== mailId) ?? [],
			);

			return { previousMails };
		},
		onError: (_err, _mailId, context) => {
			if (context?.previousMails) {
				queryClient.setQueryData(
					queryKeys.inbox.list(userId),
					context.previousMails,
				);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.inbox.list(userId) });
		},
	});

	// 未讀郵件數量
	const unreadCount = mails.filter((mail) => !mail.read).length;

	return {
		mails,
		isLoading,
		error,
		unreadCount,
		refresh: refetch,
		addMail: (m: Mail) => {
			// 樂觀添加新郵件
			queryClient.setQueryData<Mail[]>(queryKeys.inbox.list(userId), (old) => [
				m,
				...(old ?? []),
			]);
		},
		markAsRead: (mailId: string) => markAsReadMutation.mutate(mailId),
		deleteMail: (mailId: string) => deleteMailMutation.mutate(mailId),
		isMarkingAsRead: markAsReadMutation.isPending,
		isDeleting: deleteMailMutation.isPending,
	};
}
