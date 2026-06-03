import { Separator } from "@radix-ui/react-separator";
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
import { type LegacySessionData, useSession } from "@/lib/auth-client";
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

const adminEnv = process.env.VITE_ADMIN_IDS || "";
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
					url: "#",
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
			url: "/admin",
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
	const { data: session, status } = useSession();
	const isMobile = useIsMobile();
	const { setOpenMobile } = useSidebar();

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
			url: "/help",
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

	const user =
		session?.user && !session?.error
			? {
					display_name:
						session.user.name ??
						session.discordProfile?.global_name ??
						session.discordProfile?.username ??
						"未登入",
					username: session.discordProfile?.username ?? "未登入",
					avatar:
						session.user.image ??
						(session.discordProfile?.id && session.discordProfile?.avatar
							? `https://cdn.discordapp.com/avatars/${session.discordProfile.id}/${session.discordProfile.avatar}.png`
							: "https://cdn.discordapp.com/embed/avatars/0.png"),
					id: session.user.id ?? session.discordProfile?.id,
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

	// 💡 核心邏輯：過濾 NavSecondary
	const filterednavSecondary = data.navSecondary.filter((item) => {
		// 如果沒有設定 onlyFor，代表所有人皆可見
		if (!item.onlyFor) return true;
		// 如果有設定 onlyFor，需確認使用者「已登入」且「ID 在名單內」
		return (
			status === "authenticated" &&
			!!currentDiscordId &&
			item.onlyFor.includes(currentDiscordId)
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
