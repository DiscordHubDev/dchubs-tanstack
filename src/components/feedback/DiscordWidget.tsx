import { useQuery } from "@tanstack/react-query";
import { getDiscordWidget } from "#/features/servers/servers.functions";

interface DiscordWidgetProps {
	serverId?: string;
}

// 定義一個固定的長度陣列，用來渲染骨架屏，避免直接在 map 裡依賴 index
const SKELETON_ITEMS = Array.from({ length: 6 });

export default function DiscordWidget({
	serverId = "1297055626014490695",
}: DiscordWidgetProps) {
	// 使用 useQuery 呼叫 Server Function
	const { data, isLoading, isError } = useQuery({
		queryKey: ["discord-widget", serverId],
		// 確保這裡的參數結構與 createServerFn 內解構的 { data: { guildId } } 一致
		queryFn: () => getDiscordWidget({ data: { guildId: serverId } }),
		staleTime: 1000 * 60 * 5, // 快取 5 分鐘
	});

	if (isLoading) {
		return (
			<div className="mt-4 mb-6 flex h-[400px] w-full animate-pulse flex-col rounded-lg bg-[#2b2d31] p-4">
				<div className="mb-4 h-6 w-1/2 rounded bg-[#36393f]" />
				<div className="flex-1 space-y-3">
					{SKELETON_ITEMS.map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: yeah
						<div key={`skeleton-${i}`} className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-full bg-[#36393f]" />
							<div className="h-4 w-24 rounded bg-[#36393f]" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className="mt-4 mb-6 rounded-lg bg-[#2b2d31] p-4 text-sm text-gray-400">
				無法載入 Discord 伺服器狀態。
			</div>
		);
	}

	return (
		<div className="mt-4 mb-6 flex h-[500px] w-full max-w-[290px] flex-col overflow-hidden rounded-lg bg-[#2b2d31] font-sans text-white shadow-md border border-[#1e1f22]">
			{/* Header */}
			<div className="flex items-center justify-between bg-[#1e1f22] p-4">
				<h3 className="font-bold truncate text-sm">{data.name}</h3>
				<div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
					<strong className="text-white">{data.presence_count}</strong> 在線
				</div>
			</div>

			{/* Member List (Scrollable) */}
			<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
				<div className="space-y-3">
					{data.members.map((member) => (
						<div key={member.id} className="flex items-center gap-3">
							<div className="relative">
								<img
									src={member.avatar_url}
									alt={member.username}
									loading="lazy"
									className="h-8 w-8 rounded-full bg-[#1e1f22]"
								/>
								{/* 修正：加上 role="img"，讓 aria-label 屬性完全合法 */}
								<span
									role="img"
									className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#2b2d31] ${getStatusColor(
										member.status,
									)}`}
									aria-label={`狀態: ${member.status}`}
								/>
							</div>
							<span className="truncate text-sm font-medium text-gray-300">
								{member.username}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Footer / CTA */}
			{data.instant_invite && (
				<div className="bg-[#1e1f22] p-3">
					<a
						href={data.instant_invite}
						target="_blank"
						rel="noopener noreferrer"
						className="block w-full rounded bg-[#5865f2] py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
					>
						加入伺服器
					</a>
				</div>
			)}
		</div>
	);
}

// 輔助函式：根據狀態回傳 Tailwind 顏色 class
function getStatusColor(status: "online" | "idle" | "dnd") {
	switch (status) {
		case "online":
			return "bg-green-500";
		case "idle":
			return "bg-yellow-500";
		case "dnd":
			return "bg-red-500";
		default:
			return "bg-gray-500";
	}
}
