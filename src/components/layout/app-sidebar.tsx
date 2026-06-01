import { Separator } from "@radix-ui/react-separator";
import {
	BookCheckIcon,
	BookOpen,
	BookText,
	BotIcon,
	Home,
	Inbox,
	LifeBuoy,
	Send,
	ShieldPlus,
	Sparkles,
	SquareTerminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInbox } from "#/hooks/use-inbox";
import { useIsMobile } from "#/hooks/use-mobile";
import type { Mail } from "#/lib/types";
import { InboxSidebar } from "#/mail/inbox-sidebar";
import { EmailDialog } from "#/mail/mail-dialog";
import { type LegacySessionData, useSession } from "@/lib/auth-client";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarInput,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "../ui/sidebar";
import { Switch } from "../ui/switch";
import { NavItem } from "./nav-item";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";

const ADMIN_ID = ["857502876108193812", "549056425943629825"];

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
				// {
				//   title: '等待更新1',
				//   url: '#',
				// },
				// {
				//   title: '等待更新2',
				//   url: '#',
				// },
				// {
				//   title: '等待更新3',
				//   url: '#',
				// },
			],
		},
		// {
		//   title: 'Settings',
		//   url: '#',
		//   icon: Settings2,
		//   items: [
		//     {
		//       title: 'General',
		//       url: '#',
		//     },
		//     {
		//       title: 'Team',
		//       url: '#',
		//     },
		//     {
		//       title: 'Billing',
		//       url: '#',
		//     },
		//     {
		//       title: 'Limits',
		//       url: '#',
		//     },
		//   ],
		// },
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
			onlyFor: ADMIN_ID,
		},
	],
};

export function DiscordUser(session?: LegacySessionData): DiscordUser {
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

	const [activeItem, setActiveItem] = useState<string | null>(null);

	const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const { mails, markAsRead, deleteMail } = useInbox();

	const [search, setSearch] = useState("");

	const [onlyUnread, setOnlyUnread] = useState(false);

	const [unreadCount, setUnreadCount] = useState(0);
	const [showInbox, setShowInbox] = useState(false);

	const isMobile = useIsMobile();

	const { setOpenMobile } = useSidebar();

	useEffect(() => {
		if (isMobile) setOpenMobile(true);
	}, [isMobile, setOpenMobile]);

	const handleDeleteEmail = async (id: string) => {
		try {
			await deleteMail(id);
		} catch (error) {
			console.error("❌ 刪除郵件失敗：", error);
		}
	};

	const refreshUnreadCount = useCallback(() => {
		const count = mails.filter((mail) => !mail.read).length;

		setUnreadCount(count);
	}, [mails]);

	useEffect(() => {
		refreshUnreadCount();
	}, [refreshUnreadCount]);

	const filteredMails = useMemo(() => {
		const keyword = search.toLowerCase().trim();

		return mails.filter((mail) => {
			const isUnread = !mail.read; // 如果 mail.read 為 false、null、undefined 都算未讀
			const matchesUnread = !onlyUnread || isUnread;

			const matchesSearch =
				!keyword ||
				[mail.subject, mail.teaser, mail.name]
					.filter(Boolean)
					.some((field) => field.toLowerCase().includes(keyword));

			return matchesSearch && matchesUnread;
		});
	}, [mails, search, onlyUnread]);

	const navItem = [
		{
			title: "返回首頁",
			url: "/",
			icon: Home,
			isActive: true,
		},
		{
			title: "教學頁面",
			url: "help",
			icon: BookOpen,
		},
		{
			title: "加入官方群",
			url: "https://discord.com/invite/puQ9DPdG3M",
			icon: Sparkles,
		},
		{
			title: "個人收件匣",
			url: "#",
			icon: Inbox,
			badge: unreadCount > 0 ? String(unreadCount) : undefined,
			isActive: !showInbox,
		},
		{
			title: "邀請官方機器人",
			url: "https://discord.com/oauth2/authorize?client_id=1324996138251583580&permissions=1126965059046400&integration_type=0&scope=bot",
			icon: BotIcon,
		},
	];

	const handleCloseDialog = () => {
		setDialogOpen(false);
	};

	const openMail = (mail: Mail) => {
		setSelectedMail({ ...mail, read: true });
		setDialogOpen(true);
		if (!mail.read && mail.id) {
			markAsRead(mail.id);
			refreshUnreadCount();
		}
	};

	const user =
		session?.user && !session?.error // 建議改用 session.user 來判斷是否登入
			? {
					display_name:
						session.user.name ?? // 通常套件會整理在 session.user.name
						session.discordProfile?.global_name ??
						session.discordProfile?.username ??
						"未登入",

					username: session.discordProfile?.username ?? "未登入",

					// 💡 修改這裡：先找套件處理好的 image，沒有的話再手動組裝 Discord 網址
					avatar:
						session.user.image ??
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

	const filterednavSecondary = data.navSecondary.filter((item) => {
		if (!item.onlyFor) return true;

		return !!user?.id && item.onlyFor.includes(user.id);
	});

	return (
		<div className="flex h-svh">
			<Sidebar collapsible="icon" {...props}>
				<SidebarHeader>
					<SidebarTrigger className="ml-0.5" />

					<NavItem
						items={navItem.map((item) => ({
							...item,
							isActive: activeItem === item.title,
						}))}
						onSelect={(title) => {
							if (title === "個人收件匣") {
								setShowInbox((prev) => {
									const next = !prev;

									if (isMobile && next) {
										setOpenMobile(false);
									}

									return next;
								}); // 切換 inbox 開關
							} else {
								setShowInbox(false); // 點其他項目時強制關閉 inbox

								if (isMobile) {
									setOpenMobile(false);
								}
							}
							setActiveItem((prev) => (prev === title ? null : title));
						}}
					/>
				</SidebarHeader>
				<Separator className="h-0.5 bg-muted-foreground/30" />
				<SidebarContent>
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
			<div className="flex flex-1 flex-col">
				{showInbox && !isMobile && (
					<Sidebar
						collapsible="none"
						className="fixed inset-y-0 left-(--sidebar-width) z-30 flex h-svh w-(--sidebar-width) flex-col border-r"
					>
						<SidebarHeader className="flex flex-row items-center justify-between px-4 py-2">
							<span className="font-medium text-sm">個人收件匣</span>
							<div className="flex items-center space-x-2">
								<span className="text-muted-foreground text-sm">未讀</span>
								<Switch checked={onlyUnread} onCheckedChange={setOnlyUnread} />
							</div>
						</SidebarHeader>
						<div className="border-border border-t p-4">
							<SidebarInput
								placeholder="搜尋郵件..."
								value={search}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setSearch(e.target.value)
								}
							/>
						</div>
						<InboxSidebar
							mails={filteredMails}
							onSelectEmail={(mail) => openMail(mail)}
							onDeleteEmail={handleDeleteEmail}
						/>
					</Sidebar>
				)}

				{showInbox && isMobile && (
					<div className="fixed inset-0 z-50 flex max-h-screen flex-col overflow-hidden bg-background shadow-xl">
						<SidebarHeader className="flex shrink-0 flex-col space-y-2 border-b p-4">
							<div className="flex items-center justify-between">
								<div className="font-semibold text-base">個人收件匣</div>
								<div className="flex items-center space-x-2">
									<span className="text-muted-foreground text-sm">未讀</span>
									<Switch
										checked={onlyUnread}
										onCheckedChange={setOnlyUnread}
									/>
								</div>
							</div>

							<button
								type="button"
								className="mx-auto text-muted-foreground text-sm"
								onClick={() => setShowInbox(false)}
							>
								關閉
							</button>
						</SidebarHeader>
						<div className="p-4">
							<SidebarInput
								placeholder="搜尋郵件..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<div className="flex-1 overflow-y-auto">
							<InboxSidebar
								mails={filteredMails}
								onSelectEmail={(mail) => openMail(mail)}
								onDeleteEmail={handleDeleteEmail}
							/>
						</div>
					</div>
				)}
			</div>
			<EmailDialog
				email={selectedMail}
				open={dialogOpen}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}
