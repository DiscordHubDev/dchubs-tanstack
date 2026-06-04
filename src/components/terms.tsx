import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, ScrollText } from "lucide-react";
import { useMemo } from "react";

const TABLE_OF_CONTENTS = [
	{ id: "introduction", title: "簡介與同意條款" },
	{ id: "account-auth", title: "帳號與 Discord 授權" },
	{ id: "usage-rules", title: "平台使用與發布規範" },
	{ id: "content-rights", title: "內容與版權" },
	{ id: "disclaimer", title: "免責聲明" },
	{ id: "privacy", title: "隱私與資料蒐集" },
	{ id: "changes", title: "條款修改與終止" },
];

export default function TermsPage() {
	const baseUrl =
		process.env.BETTER_AUTH_URL ||
		process.env.SITE_URL ||
		process.env.VITE_SITE_URL ||
		"http://localhost:3000";

	const jsonLd = useMemo(
		() => ({
			"@context": "https://schema.org",
			"@type": "WebPage",
			name: "DiscordHubs 服務條款",
			description: "DiscordHubs 平台的服務使用條款說明與規範。",
			url: `${baseUrl}/terms`,
			breadcrumb: {
				"@type": "BreadcrumbList",
				itemListElement: [
					{
						"@type": "ListItem",
						position: 1,
						name: "首頁",
						item: baseUrl,
					},
					{
						"@type": "ListItem",
						position: 2,
						name: "服務條款",
						item: `${baseUrl}/terms`,
					},
				],
			},
			isPartOf: {
				"@type": "WebSite",
				name: "DiscordHubs",
				url: baseUrl,
			},
		}),
		[baseUrl],
	);

	const jsonLdString = useMemo(() => JSON.stringify(jsonLd), [jsonLd]);

	return (
		<>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLd
				dangerouslySetInnerHTML={{ __html: jsonLdString }}
			/>
			<div className="min-h-screen bg-[#1e1f22] text-gray-300 selection:bg-[#5865f2] selection:text-white pb-20">
				<div className="bg-[#2b2d31] py-12 border-b border-[#1e1f22]">
					<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
						<div className="flex justify-center mb-6">
							<ScrollText size={48} className="text-[#5865f2]" />
						</div>
						<h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
							服務條款 (Terms of Service)
						</h1>
						<p className="text-lg text-gray-400">
							最後更新日期：2026 年 6 月 4 日
						</p>
					</div>
				</div>

				<div className="max-w-4xl mx-auto px-4 py-12">
					<div className="bg-[#2b2d31] rounded-lg p-6 md:p-8 shadow-lg">
						{/* 溫馨提示卡片 */}
						<div className="mb-8 p-4 bg-[#2b2d31] border-l-4 border-[#5865f2] rounded-r-lg flex items-start gap-3">
							<AlertCircle className="text-[#5865f2] shrink-0 mt-1" size={20} />
							<p className="text-sm text-gray-300 leading-relaxed">
								歡迎來到
								DiscordHubs！在使用我們的伺服器與機器人列表服務之前，請務必詳細閱讀以下條款。登入或使用本平台即表示您完全同意本文件所述之所有規範。
							</p>
						</div>

						{/* 目錄 */}
						<div className="flex flex-col mb-12 p-5 bg-[#1e1f22] rounded-lg border border-[#36393f]">
							<h2 className="text-xl font-bold text-white mb-4">目錄</h2>
							<ul className="flex flex-col gap-3">
								{TABLE_OF_CONTENTS.map((item, index) => (
									<li key={item.id}>
										<Link
											to="."
											hash={item.id}
											className="flex items-center text-gray-400 hover:text-[#5865f2] transition-colors duration-200 group w-fit"
										>
											<ChevronRight
												size={16}
												className="mr-2 group-hover:translate-x-1 transition-transform"
											/>
											<span>
												{index + 1}. {item.title}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>

						{/* 條款具體內容 */}
						<div className="space-y-12">
							<section id="introduction" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									1. 簡介與同意條款
								</h3>
								<p className="leading-relaxed">
									DiscordHubs（以下簡稱「本平台」）提供 Discord
									伺服器與機器人的展示、搜索及列表服務。當您透過瀏覽器存取、使用本平台或透過
									Discord
									授權登入時，即表示您已閱讀、理解並同意接受本服務條款的約束。若您不同意本條款的任何部分，請立即停止使用本平台服務。
								</p>
							</section>

							<section id="account-auth" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									2. 帳號與 Discord 授權
								</h3>
								<ul className="list-disc pl-5 space-y-3">
									<li>
										<strong>API 授權：</strong> 本平台使用 Discord 官方 API
										提供登入及獲取資料功能。授權時，我們會取得您的基本公開資訊（如使用者
										ID、名稱、頭像）及伺服器列表資訊。
									</li>
									<li>
										<strong>帳號安全：</strong> 您有責任維護自身 Discord
										帳號的安全性。任何透過您帳號在本平台上進行的操作（如新增伺服器、發布機器人），皆視為您本人的行為。
									</li>
									<li>
										<strong>授權撤銷：</strong> 您隨時可以至 Discord
										的「使用者設定 {">"} 授權的應用程式」中撤銷 DiscordHubs
										的存取權限，但這可能導致您無法繼續使用本平台的部分或全部功能。
									</li>
								</ul>
							</section>

							<section id="usage-rules" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									3. 平台使用與發布規範
								</h3>
								<p className="mb-3">
									使用者在 DiscordHubs
									上提交、宣傳的伺服器或機器人，必須嚴格遵守以下規範以及 Discord
									官方的《服務條款》與《社群守則》：
								</p>
								<ul className="list-disc pl-5 space-y-2 text-gray-300">
									<li>
										<strong>禁止非法與惡意內容：</strong>{" "}
										嚴禁發布涉及詐騙、惡意軟體、散佈仇恨言論、未成年人不當內容或任何違反法律的社群與機器人。
									</li>
									<li>
										<strong>NSFW 規範：</strong>{" "}
										若您的伺服器包含成人（NSFW）內容，必須在 Discord
										伺服器設定中正確標記，且嚴禁在我們平台上的預覽圖或公開簡介中展示露骨內容。
									</li>
									<li>
										<strong>禁止濫發訊息（Spam）：</strong>{" "}
										禁止利用自動化腳本洗版、惡意推廣或濫用平台的投票與收藏系統。
									</li>
								</ul>
								<p className="mt-3 text-[#ed4245]">
									<AlertCircle size={16} className="inline-block mr-1" />
									本平台管理團隊保留在不事先通知的情況下，拒絕、隱藏或永久刪除任何違規伺服器/機器人清單的權利，並得封鎖違規使用者的存取權限。
								</p>
							</section>

							<section id="content-rights" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									4. 內容與版權
								</h3>
								<p className="leading-relaxed">
									您提交至本平台的文字敘述、標誌、橫幅等內容，其智慧財產權仍歸您或原創作者所有。但當您將其發布至
									DiscordHubs
									時，即代表您授予我們非專屬、全球性、免權利金的授權，允許我們在平台上展示、複製與推廣這些內容，以提供服務。您必須確保您有權發布這些內容，且未侵犯第三方的著作權或商標。
								</p>
							</section>

							<section id="disclaimer" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									5. 免責聲明
								</h3>
								<ul className="list-disc pl-5 space-y-3">
									<li>
										<strong>非官方附屬聲明：</strong> DiscordHubs
										是一個由社群開發者獨立營運的平台，與 Discord, Inc.{" "}
										<strong>沒有任何官方合作、贊助或附屬關係</strong>。"Discord"
										是 Discord, Inc. 的註冊商標。
									</li>
									<li>
										<strong>內容免責：</strong>{" "}
										本平台僅提供目錄列表服務。我們無法保證使用者所加入的第三方伺服器或邀請的機器人之安全性與內容品質。您在與第三方伺服器互動時須自行承擔風險。
									</li>
									<li>
										<strong>服務可用性：</strong>{" "}
										平台依照「現況（As-is）」提供服務。我們不保證平台隨時無中斷、無錯誤，且保留隨時修改或中斷服務的權利，無須對資料遺失負責。
									</li>
								</ul>
							</section>

							<section id="privacy" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									6. 隱私與資料蒐集
								</h3>
								<p className="leading-relaxed">
									我們尊重您的隱私。本平台僅會透過 Discord API
									獲取維護帳號及顯示伺服器資訊所必須的資料。我們承諾絕不會將您的個人資訊或伺服器數據出售給第三方廣告商。若要了解詳細的資料處理方式，請參閱我們的《隱私權政策》。
								</p>
							</section>

							<section id="changes" className="scroll-mt-8">
								<h3 className="text-2xl font-bold text-white mb-4 border-b border-[#36393f] pb-2">
									7. 條款修改與終止
								</h3>
								<p className="leading-relaxed">
									DiscordHubs
									保留隨時修改本服務條款的權利。任何重大變更將會在此頁面更新，並修改頂部的「最後更新日期」。變更生效後繼續使用本平台，即視為您同意接受修改後的條款。若您違反本條款，我們有權隨時終止您對平台的存取權。
								</p>
							</section>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
