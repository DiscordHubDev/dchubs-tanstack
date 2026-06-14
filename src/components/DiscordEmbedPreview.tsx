import type { CustomEmbedData } from "#/types/custom_embed";
import { OptimizedImage } from "./OptimizedImage";

export default function DiscordEmbedPreview({
	data,
}: {
	data: CustomEmbedData;
}) {
	const hasEmbedData =
		data.title ||
		data.description ||
		data.authorName ||
		data.footerText ||
		data.imageUrl ||
		data.thumbnailUrl ||
		(data.fields && data.fields.length > 0);

	return (
		// [優化] 外層容器加入 cursor-default，讓整體背景與空白處保持預設箭頭游標
		<div className="flex w-full cursor-default flex-col rounded-lg bg-[#313338] py-4 text-left font-['gg_sans','Noto_Sans','Helvetica_Neue',Helvetica,Arial,sans-serif] antialiased">
			{/* 模擬單則 Discord 訊息 */}
			<div className="group relative flex px-4 py-0.5 hover:bg-[#2e3035]">
				{/* 左側大頭貼 - [保留] cursor-pointer */}
				<div className="mt-0.5 mr-4 shrink-0 cursor-pointer">
					<div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#5865F2]">
						<OptimizedImage
							src={data.avatar_url}
							fallbackSrc="https://cdn.discordapp.com/avatars/1324996138251583580/14bdbdc05d5e5bb8512b84e3019c7b65.png"
							alt="Bot Icon"
							width={40}
							height={40}
							className="h-full w-full object-cover"
						/>
					</div>
				</div>

				{/* 右側訊息內容區 */}
				<div className="flex w-full min-w-0 flex-col">
					{/* 發送者與時間頭部 */}
					<div className="mb-1 flex items-center leading-[1.375rem]">
						{/* 機器人名稱 - [保留] cursor-pointer 與 hover 效果 */}
						<span className="mr-1 cursor-pointer font-medium text-[#f2f3f5] text-base hover:underline">
							{data.username || "DcHubs 投票通知"}
						</span>

						{/* 官方認證 BOT 標籤 */}
						<span
							style={{
								backgroundColor: "#5865f2",
								color: "#fff",
								fontSize: ".625em",
								marginLeft: "4px",
								borderRadius: ".1875rem",
								lineHeight: "100%",
								textTransform: "uppercase",
								display: "flex",
								alignItems: "center",
								height: ".9375rem",
								padding: "0 .275rem",
								marginTop: ".075em",
							}}
							className="font-medium"
						>
							應用
						</span>

						{/* 時間戳記 - 一般文字不需要游標變化 */}
						<span className="ml-2 font-medium text-[#949ba4] text-xs">
							{(() => {
								const now = new Date();
								const timeString = now.toLocaleTimeString("en-US", {
									hour: "2-digit",
									minute: "2-digit",
									hour12: true,
								});
								return `今天 ${timeString}`;
							})()}
						</span>
					</div>

					{/* 訊息本體 (Message Content) - [優化] 加入 cursor-text 確保可選取 */}
					{data.content && (
						<div className="mb-2 cursor-text whitespace-pre-wrap break-words text-[#dbdee1] text-[1rem] leading-[1.375rem]">
							{data.content}
						</div>
					)}

					{/* Embed 卡片 */}
					{hasEmbedData && (
						<div className="mt-1 flex max-w-[520px] overflow-hidden rounded-[4px] bg-[#2b2d31]">
							{/* 左側顏色條 */}
							<div
								className="w-1 shrink-0"
								style={{ backgroundColor: data.color || "#1e1f22" }}
							/>

							<div className="flex w-full flex-col px-4 py-3">
								<div className="flex gap-4">
									<div className="flex w-full flex-col">
										{/* Embed Author */}
										{data.authorName && (
											<div className="mt-1 mb-2 flex items-center space-x-2">
												{data.authorIconUrl && (
													<OptimizedImage
														src={data.authorIconUrl}
														fallbackSrc="https://cdn.discordapp.com/embed/avatars/0.png"
														alt="author"
														width={20}
														height={20}
														className="h-full w-full cursor-pointer object-cover"
													/>
												)}
												{/* 作者名稱 - [優化] 加入 cursor-pointer 與 hover:underline */}
												<span className="cursor-pointer font-semibold text-[#f2f3f5] text-sm hover:underline">
													{data.authorName}
												</span>
											</div>
										)}

										{/* Embed Title */}
										{data.title && (
											<div className="mt-1 mb-1">
												{/* 標題 - 只有在有 URL 時才顯示游標變化 */}
												<span
													className={`font-bold text-base ${
														data.url
															? "cursor-pointer text-[#00a8fc] hover:underline"
															: "cursor-text text-[#f2f3f5]"
													}`}
												>
													{data.title}
												</span>
											</div>
										)}

										{/* Embed Description - [優化] 加入 cursor-text */}
										{data.description && (
											<div className="mb-2 cursor-text whitespace-pre-wrap text-[#dbdee1] text-[14px] leading-[1.125rem]">
												{data.description}
											</div>
										)}

										{/* Embed Fields */}
										{data.fields && data.fields.length > 0 && (
											<div className="mt-2 mb-2 flex flex-wrap gap-x-4 gap-y-2">
												{data.fields.map((field, i) => (
													<div
														// biome-ignore lint/suspicious/noArrayIndexKey: yeah
														key={i}
														className={
															field.inline ? "min-w-[120px] flex-1" : "w-full"
														}
													>
														{/* 欄位標題與內容 - [優化] 加入 cursor-text */}
														<div className="mb-0.5 cursor-text font-bold text-[#f2f3f5] text-[14px]">
															{field.name || "\u200B"}
														</div>
														<div className="cursor-text text-[#dbdee1] text-[14px] leading-[1.125rem]">
															{field.value || "\u200B"}
														</div>
													</div>
												))}
											</div>
										)}

										{/* Embed Image */}
										{data.imageUrl && (
											<div className="mt-4">
												<OptimizedImage
													src={data.imageUrl}
													alt="embed"
													width={600} // ✨ 給定一個合理的基礎寬度 (例如 600)
													height={300} // ✨ 對應你 className 裡的 max-h-[300px]
													className="max-h-[300px] max-w-full cursor-pointer rounded-[4px] object-contain"
												/>
											</div>
										)}
									</div>

									{/* Embed Thumbnail (置於右上) */}
									{data.thumbnailUrl && (
										<div className="mt-1 shrink-0">
											<OptimizedImage
												src={data.thumbnailUrl}
												alt="thumbnail"
												width={80} // ✨ 補上寬度
												height={80} // ✨ 補上高度
												className="h-[80px] w-[80px] cursor-pointer rounded-[4px] object-cover"
											/>
										</div>
									)}
								</div>

								{/* Embed Footer */}
								{data.footerText && (
									<div className="mt-3 flex items-center space-x-2">
										{data.footerIconUrl && (
											<OptimizedImage
												src={data.footerIconUrl}
												alt="footer"
												width={20}
												height={20}
												className="h-full w-full object-cover"
											/>
										)}
										{/* Footer 文字 - [優化] 保持預設文字游標 */}
										<span className="cursor-text font-medium text-[#dbdee1] text-[12px]">
											{data.footerText}
										</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* 空狀態提示 */}
			{!data.content && !hasEmbedData && (
				<p className="cursor-default py-8 text-center text-[#949ba4] text-sm">
					在左側編輯器輸入內容後，這裡會同步顯示 Discord Embed 預覽。
				</p>
			)}
		</div>
	);
}
