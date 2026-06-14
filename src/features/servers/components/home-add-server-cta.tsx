import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "#/components/ui/button";
import { signIn, useSession } from "#/lib/auth-client";
import { cn } from "#/lib/utils";

type HomeAddServerCtaProps = {
	mobile?: boolean;
};

export default function HomeAddServerCta({
	mobile = false,
}: HomeAddServerCtaProps) {
	const { data: session } = useSession();
	const isSignedIn = Boolean(session?.discordProfile?.id ?? session?.user?.id);

	return (
		<div className="rounded-lg bg-[#2b2d31] p-5">
			<h3 className="mb-4 font-semibold text-lg">新增你的伺服器</h3>
			<p className="mb-4 text-gray-300 text-sm">
				想要推廣你的 Discord 伺服器嗎？立即加入平台，讓更多人看見你的社群。
			</p>

			{isSignedIn || mobile ? (
				<Link
					to="/protected/add-server"
					className={cn(
						buttonVariants({ variant: "default" }),
						"w-full bg-[#5865f2] text-white hover:bg-[#4752c4]", // 疊加 w-full 樣式
					)}
				>
					新增伺服器
				</Link>
			) : (
				<Button
					onClick={() => {
						signIn("/protected/add-server");
					}}
					className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
				>
					登入後新增
				</Button>
			)}
		</div>
	);
}
