import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { signIn, useSession } from "#/lib/auth-client";

type BotsAddCtaProps = {
	mobile?: boolean;
};

export default function BotsAddCta({ mobile = false }: BotsAddCtaProps) {
	const { data: session } = useSession();
	const isSignedIn = Boolean(session?.discordProfile?.id ?? session?.user?.id);

	if (isSignedIn) {
		return (
			<div className="rounded-lg bg-[#2b2d31] p-5">
				<h3 className="mb-4 font-semibold text-lg">新增您的機器人</h3>
				<p className="mb-4 text-gray-300 text-sm">
					想要推廣您的 Discord
					機器人嗎？立即加入我們的平台，讓更多人發現您的創作。
				</p>
				<Link to="/protected/add-bot">
					<Button className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]">
						新增機器人
					</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="rounded-lg bg-[#2b2d31] p-5">
			<h3 className="mb-4 font-semibold text-lg">新增您的機器人</h3>
			<p className="mb-4 text-gray-300 text-sm">
				想要推廣您的 Discord
				機器人嗎？立即加入我們的平台，讓更多人發現您的創作。
			</p>
			<Button
				type="button"
				onClick={() => {
					signIn("/protected/add-bot");
				}}
				className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
			>
				{mobile ? "登入後新增機器人" : "登入後新增機器人"}
			</Button>
		</div>
	);
}
