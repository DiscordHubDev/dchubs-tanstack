import { Link, useLocation } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FaUser } from "react-icons/fa";
import { FaDiscord } from "react-icons/fa6";
import { Button } from "#/components/ui/button";
import { signIn, signOut, useSession } from "#/lib/auth-client";
import { SidebarTrigger } from "./ui/sidebar";

type LinkItem = {
	to: "/" | "/bots" | "/add-server" | "/add-bot";
	label: string;
};

const links: LinkItem[] = [
	{ to: "/", label: "伺服器列表" },
	{ to: "/bots", label: "機器人列表" },
	{ to: "/add-server", label: "新增伺服器" },
	{ to: "/add-bot", label: "新增機器人" },
];

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const { pathname } = useLocation();
	const { data: session, isPending, error } = useSession();

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
		void signIn(pathname);
	};

	const handleSignOut = () => {
		void signOut();
	};

	return (
		<nav
			className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
				isScrolled
					? "border-white/10 bg-[#2b2d31]/70 backdrop-blur-xl"
					: "border-[#1e1f22] bg-[#2b2d31]"
			}`}
		>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="h-16 flex items-center justify-between gap-3">
					<div className="flex items-center gap-2 md:gap-4 min-w-0">
						<SidebarTrigger className="-mt-1 cursor-pointer md:hidden" />
						<Link
							to="/"
							className="text-xl font-bold text-white flex items-center shrink-0"
						>
							<span className="mr-2">
								<Image
									src="/favicon.ico"
									alt="DiscordHubs Logo"
									width={24}
									height={24}
									className="rounded-full"
								/>
							</span>
							DiscordHubs
						</Link>

						<div className="hidden md:flex items-center gap-2">
							{links.map(({ to, label }) => (
								<Link key={to} to={to}>
									<Button
										variant="ghost"
										className={`text-white cursor-pointer hover:bg-[#36393f] ${pathname === to ? "bg-white/10" : ""}`}
									>
										{label}
									</Button>
								</Link>
							))}
						</div>
					</div>

					<div className="hidden md:flex items-center gap-2">
						{isPending ? (
							<Button disabled className="bg-[#5865f2] text-white">
								讀取中...
							</Button>
						) : isSignedIn ? (
							<>
								<Link to="/profile" preload="intent" className="discord">
									<FaUser />
									個人資料
								</Link>
								<Button
									onClick={handleSignOut}
									className="px-2 cursor-pointer bg-red-700 hover:bg-red-600 text-white"
								>
									<X />
									登出
								</Button>
							</>
						) : (
							<Button
								onClick={handleDiscordSignIn}
								className="cursor-pointer bg-[#5865f2] hover:bg-[#4752c4] text-white"
							>
								<FaDiscord />
								登入 Discord
							</Button>
						)}
					</div>

					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className="md:hidden text-white"
						aria-label="切換選單"
					>
						{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
					</button>
				</div>

				{isOpen && (
					<div className="md:hidden pb-4 flex flex-col gap-2">
						{links.map(({ to, label }) => (
							<Link
								key={to}
								to={to}
								onClick={() => setIsOpen(false)}
								className={`text-white w-full px-3 py-2 rounded-md text-sm hover:bg-[#36393f] ${pathname === to ? "bg-white/10" : ""}`}
							>
								{label}
							</Link>
						))}

						{isPending ? (
							<Button disabled className="bg-[#5865f2] text-white mt-1">
								讀取中...
							</Button>
						) : isSignedIn ? (
							<Button
								onClick={handleSignOut}
								className="cursor-pointer bg-[#4f545c] hover:bg-[#3f434a] text-white mt-1"
							>
								登出
							</Button>
						) : (
							<Button
								onClick={handleDiscordSignIn}
								className="cursor-pointer bg-[#5865f2] hover:bg-[#4752c4] text-white mt-1"
							>
								<FaDiscord />
								登入 Discord
							</Button>
						)}
					</div>
				)}
			</div>
		</nav>
	);
}
