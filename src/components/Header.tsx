import { Link, useLocation } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FaUser } from "react-icons/fa";
import { FaDiscord } from "react-icons/fa6";
import { Button } from "#/components/ui/button";
import { signIn, signOut, useSession } from "#/lib/auth-client";
import { SidebarTrigger } from "./ui/sidebar";

type LinkItem = {
	to: "/" | "/bots" | "/protected/add-server" | "/protected/add-bot";
	label: string;
};

const links: LinkItem[] = [
	{ to: "/", label: "伺服器列表" },
	{ to: "/bots", label: "機器人列表" },
	{ to: "/protected/add-server", label: "新增伺服器" },
	{ to: "/protected/add-bot", label: "新增機器人" },
];

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const { pathname } = useLocation();
	const { data: session, error } = useSession();

	useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > 8);
		};

		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });

		return () => {
			window.removeEventListener("scroll", handleScroll);
		};
	}, []);

	const isSignedIn = Boolean(session?.user) && !error;

	const handleDiscordSignIn = () => {
		void signIn("/");
	};

	const handleSignOut = () => {
		void signOut();
	};

	// 抽離登入/登出按鈕群，方便在桌面版與行動版重複使用，保持程式碼簡潔
	const AuthButtons = ({ isMobile = false }: { isMobile?: boolean }) => {
		if (isSignedIn) {
			return (
				<div
					className={`flex ${isMobile ? "mt-2 w-full flex-col gap-2" : "items-center gap-3"}`}
				>
					<Link
						to="/protected/profile"
						preload="intent"
						onClick={() => isMobile && setIsOpen(false)}
						className={isMobile ? "w-full" : ""}
					>
						<Button
							className={`flex cursor-pointer items-center justify-start gap-2 bg-discord text-white transition-colors hover:bg-discord-hover ${
								isMobile ? "h-10 w-full px-3 py-2 text-sm" : ""
							} ${pathname === "/protected/profile" ? "bg-discord-hover" : ""}`}
						>
							<FaUser className="size-4 shrink-0" />
							<span>個人資料</span>
						</Button>
					</Link>
					<Button
						onClick={handleSignOut}
						variant="destructive"
						className={`flex cursor-pointer items-center justify-start gap-2 bg-red-700 text-white transition-colors hover:bg-red-600 ${
							isMobile ? "h-10 w-full px-3 py-2 text-sm" : "px-3"
						}`}
					>
						<LogOut className="size-4 shrink-0" />
						<span>登出</span>
					</Button>
				</div>
			);
		}

		return (
			<Button
				onClick={handleDiscordSignIn}
				className={`flex cursor-pointer items-center justify-center gap-2 bg-discord text-white transition-colors hover:bg-discord-hover ${
					isMobile ? "mt-2 w-full" : ""
				}`}
			>
				<FaDiscord className="size-5" />
				<span>登入 Discord</span>
			</Button>
		);
	};

	return (
		<nav
			className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
				isScrolled
					? "border-white/10 bg-[#2b2d31]/80 backdrop-blur-xl"
					: "border-[#1e1f22] bg-[#2b2d31]"
			}`}
		>
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="flex h-16 items-center justify-between gap-4">
					{/* 左側：Logo 與 導覽連結 */}
					<div className="flex min-w-0 items-center gap-2 md:gap-6">
						{/* 行動端側邊欄觸發按鈕 */}
						<SidebarTrigger className="cursor-pointer text-white md:hidden" />

						{/* Logo */}
						<Link
							to="/"
							className="flex shrink-0 items-center font-bold text-white text-xl transition-opacity hover:opacity-90"
						>
							<Image
								src="/favicon.ico"
								alt="DiscordHubs Logo"
								width={26}
								height={26}
								className="mr-2 shrink-0 rounded-full"
							/>
							<span className="truncate">DiscordHubs</span>
						</Link>

						{/* 桌面版導覽連結 (md 以上顯示) */}
						<div className="hidden items-center gap-1 md:flex">
							{links.map(({ to, label }) => (
								<Link key={to} to={to}>
									<Button
										variant="ghost"
										className={`cursor-pointer text-white hover:bg-[#36393f] ${
											pathname === to
												? "bg-white/10 font-semibold"
												: "font-normal"
										}`}
									>
										{label}
									</Button>
								</Link>
							))}
						</div>
					</div>

					{/* 右側：桌面版使用者功能 (md 以上顯示) */}
					<div className="hidden items-center md:flex">
						<AuthButtons />
					</div>

					{/* 右側：行動版主選單漢堡按鈕 (md 以下顯示) */}
					<div className="flex items-center md:hidden">
						<button
							type="button"
							onClick={() => setIsOpen((prev) => !prev)}
							className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-[#36393f] hover:text-white focus:outline-none"
							aria-label="切換選單"
						>
							{isOpen ? <X className="size-6" /> : <Menu className="size-6" />}
						</button>
					</div>
				</div>
			</div>

			{/* 行動端下拉選單選單 (md 以下顯示) */}
			{isOpen && (
				<div className="border-white/5 border-t bg-[#2b2d31] px-4 pt-2 pb-4 shadow-xl md:hidden">
					<div className="space-y-1">
						{links.map(({ to, label }) => (
							<Link
								key={to}
								to={to}
								onClick={() => setIsOpen(false)}
								className={`block w-full rounded-md px-3 py-2 font-medium text-base text-white transition-colors hover:bg-[#36393f] ${
									pathname === to ? "bg-white/10 font-semibold" : ""
								}`}
							>
								{label}
							</Link>
						))}
					</div>

					{/* 行動端認證按鈕 */}
					<div className="mt-4 border-white/5 border-t pt-4">
						<AuthButtons isMobile />
					</div>
				</div>
			)}
		</nav>
	);
}
