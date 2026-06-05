import { Separator } from "@radix-ui/react-separator";
import { useRouteContext } from "@tanstack/react-router";
import {
	BookCheckIcon,
	BookOpen,
	BookText,
	BotIcon,
	Home,
	LifeBuoy,
	Send,
	ShieldPlus,
	Sparkles,
	SquareTerminal,
} from "lucide-react";
import { useEffect } from "react";
import { useIsMobile } from "#/hooks/use-mobile";
import type { LegacySessionData } from "@/lib/auth-client";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "../ui/sidebar";
import { NavItem } from "./nav-item";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";

const adminEnv = import.meta.env.VITE_ADMIN_IDS || "";
const ADMIN_ID = adminEnv ? adminEnv.split(",").map((id) => id.trim()) : [];

const data = {
	navMain: [
		{
			title: "支持作者們",
			url: "#",
			icon: SquareTerminal,
			isActive: false,
			items: [
				{
					title: "弦樂（DawnGS）",
					url: "https://dawngs.com/",
				},
				{
					title: "鰻頭(´・ω・)（mantouisyummy）",
					url: "https://mantou.dev",
				},
			],
		},
		{
			title: "政策及條款",
			url: "#",
			icon: BookText,
			items: [
				{
					title: "服務條款",
					url: "/terms",
				},
				{
					title: "隱私權政策",
					url: "/privacy",
				},
			],
		},
		{
			title: "不同的文檔",
			url: "#",
			icon: BookCheckIcon,
			items: [
				{
					title: "開發者文檔",
					url: "https://docs.dchubs.org",
				},
			],
		},
	],
	navSecondary: [
		{
			title: "獲得支援",
			url: "https://discord.gg/puQ9DPdG3M",
			icon: LifeBuoy,
		},
		{
			title: "回報問題",
			url: "https://discord.gg/puQ9DPdG3M",
			icon: Send,
		},
		{
			title: "管理員頁面",
			url: "/protected/admin",
			icon: ShieldPlus,
			onlyFor: ADMIN_ID, // 💡 綁定管理員 ID 陣列
		},
	],
};

export function DiscordUser(session?: LegacySessionData) {
	if (!session) {
		return {
			display_name: "Loading...",
			username: "Loading...",
			avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
		};
	}

	return {
		display_name: "未登入",
		username: "未登入",
		avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
	};
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { session } = useRouteContext({ from: "__root__" });
	const isMobile = useIsMobile();
	const { setOpenMobile } = useSidebar();

	const status = session ? "authenticated" : "unauthenticated";

	useEffect(() => {
		if (isMobile) setOpenMobile(true);
	}, [isMobile, setOpenMobile]);

	const navItem = [
		{
			title: "返回首頁",
			url: "/",
			icon: Home,
			isActive: true,
		},
		{
			title: "教學頁面",
			url: "/tutorial",
			icon: BookOpen,
		},
		{
			title: "加入官方群",
			url: "https://discord.com/invite/puQ9DPdG3M",
			icon: Sparkles,
		},
		{
			title: "邀請官方機器人",
			url: "https://discord.com/oauth2/authorize?client_id=1324996138251583580&permissions=1126965059046400&integration_type=0&scope=bot",
			icon: BotIcon,
		},
	];

	const user = session
		? {
				display_name: session.user.name ?? "未知使用者", // 假設你的 NormalizedSession 已經處理好這層映射
				username: session.user.username ?? "未知使用者",
				avatar:
					session.user.avatar ??
					"https://cdn.discordapp.com/embed/avatars/0.png",
				id: session.user.id, // 或者 discordId，看你 NormalizedSession 怎麼定義
			}
		: {
				display_name: "未登入",
				username: "未登入",
				avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
				id: undefined,
			};

	// 💡 取得精確的 Discord ID，避免與資料庫 UUID 混淆
	const currentDiscordId =
		session?.user?.discordId ?? session?.discordProfile?.id;

	// 💡 核心邏輯修改
	const filterednavSecondary = data.navSecondary.filter((item) => {
		if (!item.onlyFor) return true;

		return (
			status === "authenticated" &&
			!!currentDiscordId &&
			// 確保雙方都轉成字串再進行比對
			item.onlyFor.map(String).includes(String(currentDiscordId))
		);
	});

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarTrigger className="ml-0.5" />
			</SidebarHeader>
			<SidebarContent>
				<NavItem items={navItem} />
				<Separator className="h-0.5 bg-muted-foreground/30" />
				<NavMain items={data.navMain} />
				<NavSecondary items={filterednavSecondary} className="mt-auto" />
			</SidebarContent>
			<SidebarFooter>
				<NavUser
					key={
						status === "authenticated"
							? session?.user?.discordId
							: "unauthenticated"
					}
					user={user}
				/>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
