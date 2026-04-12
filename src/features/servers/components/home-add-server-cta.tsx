import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { useSession } from "#/lib/auth-client";

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
			<h3 className="mb-4 text-lg font-semibold">新增你的伺服器</h3>
			<p className="mb-4 text-sm text-gray-300">
				想要推廣你的 Discord 伺服器嗎？立即加入平台，讓更多人看見你的社群。
			</p>

			{isSignedIn || mobile ? (
				<Link to="/add-server">
					<Button className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]">
						新增伺服器
					</Button>
				</Link>
			) : (
				<a
					href="https://discord.gg/puQ9DPdG3M"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Button className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]">
						加入官方群後提交
					</Button>
				</a>
			)}
		</div>
	);
}
