import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Settings, User } from "lucide-react";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "../ui/sidebar";

interface NavUserProps {
	user: DiscordUser;
}

export function NavUser({ user }: NavUserProps) {
	const { data: session } = useSession();
	const { isMobile } = useSidebar();

	const userFallback =
		user.display_name !== "未登入" ? (
			user.display_name.charAt(0).toUpperCase()
		) : (
			<User className="size-4" />
		);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{session ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage
										src={user.avatar}
										alt={user.display_name} // 💡 修正 alt
										className="h-full w-full object-cover"
									/>
									{/* 💡 補上 Fallback */}
									<AvatarFallback className="rounded-lg bg-muted text-muted-foreground">
										{userFallback}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">
										{user.display_name}
									</span>
									<span className="truncate text-xs">{user.username}</span>
								</div>
								<ChevronsUpDown className="ml-auto size-4" />
							</SidebarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							className="mx-5 min-w-50 rounded-lg"
							side={isMobile ? "bottom" : "right"}
							align="end"
							sideOffset={4}
						>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage
											src={user.avatar}
											alt={user.username}
											className="h-full w-full object-cover"
										/>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">
											{user.display_name}
										</span>
										<span className="truncate text-xs">{user.username}</span>
									</div>
								</div>
							</DropdownMenuLabel>
							<DropdownMenuGroup>
								<DropdownMenuItem>
									<Settings />
									帳號設定
								</DropdownMenuItem>
								<Link to={"/protected/profile"} preload="intent">
									<DropdownMenuItem>
										<User />
										個人頁面
									</DropdownMenuItem>
								</Link>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => signOut()}>
								<LogOut />
								登出
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<SidebarMenuButton
						size="lg"
						onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
							e.preventDefault();
							signIn("discord");
						}}
						className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarImage
								src={user.avatar}
								alt={user.display_name}
								className="h-full w-full object-cover"
							/>
							<AvatarFallback className="rounded-lg bg-muted text-muted-foreground">
								{userFallback}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{user.display_name}</span>
							<span className="truncate text-xs">{user.username}</span>
						</div>
					</SidebarMenuButton>
				)}
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
