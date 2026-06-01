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
		void signIn();
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
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="flex h-16 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2 md:gap-4">
						<SidebarTrigger className="-mt-1 cursor-pointer md:hidden" />
						<Link
							to="/"
							className="flex shrink-0 items-center font-bold text-white text-xl"
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

						<div className="hidden items-center gap-2 md:flex">
							{links.map(({ to, label }) => (
								<Link key={to} to={to}>
									<Button
										variant="ghost"
										className={`cursor-pointer text-white hover:bg-[#36393f] ${pathname === to ? "bg-white/10" : ""}`}
									>
										{label}
									</Button>
								</Link>
							))}
						</div>
					</div>

					<div className="hidden items-center gap-2 md:flex">
						{isSignedIn ? (
							<>
								<Link
									to="/protected/profile"
									preload="intent"
									className="discord"
								>
									<FaUser />
									個人資料
								</Link>
								<Button
									onClick={handleSignOut}
									className="cursor-pointer bg-red-700 px-2 text-white hover:bg-red-600"
								>
									<X />
									登出
								</Button>
							</>
						) : (
							<Button
								onClick={handleDiscordSignIn}
								className="cursor-pointer bg-[#5865f2] text-white hover:bg-[#4752c4]"
							>
								<FaDiscord />
								登入 Discord
							</Button>
						)}
					</div>

					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className="text-white md:hidden"
						aria-label="切換選單"
					>
						{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
					</button>
				</div>

				{isOpen && (
					<div className="flex flex-col gap-2 pb-4 md:hidden">
						{links.map(({ to, label }) => (
							<Link
								key={to}
								to={to}
								onClick={() => setIsOpen(false)}
								className={`w-full rounded-md px-3 py-2 text-sm text-white hover:bg-[#36393f] ${pathname === to ? "bg-white/10" : ""}`}
							>
								{label}
							</Link>
						))}

						{isSignedIn ? (
							<>
								<Link
									to="/protected/profile"
									preload="intent"
									onClick={() => setIsOpen(false)}
									className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white hover:bg-[#36393f]"
								>
									<FaUser />
									個人資料
								</Link>
								<Button
									onClick={handleSignOut}
									className="mt-1 cursor-pointer bg-[#4f545c] text-white hover:bg-[#3f434a]"
								>
									登出
								</Button>
							</>
						) : (
							<Button
								onClick={handleDiscordSignIn}
								className="mt-1 cursor-pointer bg-[#5865f2] text-white hover:bg-[#4752c4]"
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
