import type { CustomEmbedData } from "#/types/custom_embed";

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
		<div className="flex w-full flex-col rounded-lg bg-[#313338] py-4 text-left font-['gg_sans','Noto_Sans','Helvetica_Neue',Helvetica,Arial,sans-serif] antialiased cursor-default">
			{/* 模擬單則 Discord 訊息 */}
			<div className="group relative flex px-4 py-0.5 hover:bg-[#2e3035]">
				{/* 左側大頭貼 - [保留] cursor-pointer */}
				<div className="mt-0.5 mr-4 shrink-0 cursor-pointer">
					<div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#5865F2]">
						<img
							height={40}
							width={40}
							src={
								data.avatar_url ||
								"https://cdn.discordapp.com/avatars/1324996138251583580/14bdbdc05d5e5bb8512b84e3019c7b65.png?size=1024"
							}
							alt="Bot Icon"
							className="h-full w-full object-cover"
						/>
					</div>
				</div>

				{/* 右側訊息內容區 */}
				<div className="flex w-full min-w-0 flex-col">
					{/* 發送者與時間頭部 */}
					<div className="mb-1 flex items-center leading-[1.375rem]">
						{/* 機器人名稱 - [保留] cursor-pointer 與 hover 效果 */}
						<span className="mr-1 cursor-pointer text-base font-medium text-[#f2f3f5] hover:underline">
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
						<span className="ml-2 text-xs font-medium text-[#949ba4]">
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
						<div className="mb-2 whitespace-pre-wrap break-words text-[1rem] leading-[1.375rem] text-[#dbdee1] cursor-text">
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
											<div className="mb-2 mt-1 flex items-center space-x-2">
												{data.authorIconUrl && (
													<img
														src={data.authorIconUrl}
														alt="author"
														className="h-6 w-6 rounded-full object-cover cursor-pointer"
													/>
												)}
												{/* 作者名稱 - [優化] 加入 cursor-pointer 與 hover:underline */}
												<span className="text-sm font-semibold text-[#f2f3f5] cursor-pointer hover:underline">
													{data.authorName}
												</span>
											</div>
										)}

										{/* Embed Title */}
										{data.title && (
											<div className="mb-1 mt-1">
												{/* 標題 - 只有在有 URL 時才顯示游標變化 */}
												<span
													className={`text-base font-bold ${
														data.url
															? "cursor-pointer text-[#00a8fc] hover:underline"
															: "text-[#f2f3f5] cursor-text"
													}`}
												>
													{data.title}
												</span>
											</div>
										)}

										{/* Embed Description - [優化] 加入 cursor-text */}
										{data.description && (
											<div className="mb-2 whitespace-pre-wrap text-[14px] leading-[1.125rem] text-[#dbdee1] cursor-text">
												{data.description}
											</div>
										)}

										{/* Embed Fields */}
										{data.fields && data.fields.length > 0 && (
											<div className="mb-2 mt-2 flex flex-wrap gap-x-4 gap-y-2">
												{data.fields.map((field, i) => (
													<div
														// biome-ignore lint/suspicious/noArrayIndexKey: yeah
														key={i}
														className={
															field.inline ? "min-w-[120px] flex-1" : "w-full"
														}
													>
														{/* 欄位標題與內容 - [優化] 加入 cursor-text */}
														<div className="mb-0.5 text-[14px] font-bold text-[#f2f3f5] cursor-text">
															{field.name || "\u200B"}
														</div>
														<div className="text-[14px] leading-[1.125rem] text-[#dbdee1] cursor-text">
															{field.value || "\u200B"}
														</div>
													</div>
												))}
											</div>
										)}

										{/* Embed Image */}
										{data.imageUrl && (
											<div className="mt-4">
												<img
													src={data.imageUrl}
													alt="embed"
													className="max-h-[300px] max-w-full rounded-[4px] object-contain cursor-pointer"
												/>
											</div>
										)}
									</div>

									{/* Embed Thumbnail (置於右上) */}
									{data.thumbnailUrl && (
										<div className="mt-1 shrink-0">
											<img
												src={data.thumbnailUrl}
												alt="thumbnail"
												className="h-[80px] w-[80px] rounded-[4px] object-cover cursor-pointer"
											/>
										</div>
									)}
								</div>

								{/* Embed Footer */}
								{data.footerText && (
									<div className="mt-3 flex items-center space-x-2">
										{data.footerIconUrl && (
											<img
												src={data.footerIconUrl}
												alt="footer"
												className="h-5 w-5 rounded-full object-cover"
											/>
										)}
										{/* Footer 文字 - [優化] 保持預設文字游標 */}
										<span className="text-[12px] font-medium text-[#dbdee1] cursor-text">
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
				<p className="py-8 text-center text-sm text-[#949ba4] cursor-default">
					在左側編輯器輸入內容後，這裡會同步顯示 Discord Embed 預覽。
				</p>
			)}
		</div>
	);
}
