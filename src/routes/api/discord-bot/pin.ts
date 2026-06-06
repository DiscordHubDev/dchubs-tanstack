import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { Either, ParseResult, Schema } from "effect";
import { db } from "#/drizzle/db";
import { server } from "#/drizzle/schema";

// 只需要接收伺服器 ID 即可
const PinRequestSchema = Schema.Struct({
	id: Schema.String,
});

export const Route = createFileRoute("/api/discord-bot/pin")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					// 🔒 1. 驗證 Authorization Header，
					const authHeader = request.headers.get("Authorization");
					const expectedToken =
						process.env.API_SECRET_TOKEN || "YOUR_SECRET_TOKEN";

					if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
						return Response.json({ error: "未授權的請求" }, { status: 401 });
					}

					// 2. 解析並驗證 Payload
					const body = await request.json();
					const parseResult =
						Schema.decodeUnknownEither(PinRequestSchema)(body);

					if (Either.isLeft(parseResult)) {
						return Response.json(
							{
								error: "無效的 Payload",
								details: ParseResult.TreeFormatter.formatErrorSync(
									parseResult.left,
								),
							},
							{ status: 400 },
						);
					}

					const { id: guildId } = parseResult.right;

					// 3. 從資料庫尋找該伺服器
					const existingServer = await db.query.server.findFirst({
						where: eq(server.id, guildId),
					});

					if (!existingServer) {
						return Response.json(
							{ error: "找不到該伺服器，請先執行 /publish 發布伺服器。" },
							{ status: 404 },
						);
					}

					const now = new Date();

					// 4. 檢查是否已經在訂選狀態 (比較 pinExpiry 與當前時間)
					if (existingServer.pin && existingServer.pinExpiry) {
						const expiryDate = new Date(existingServer.pinExpiry);

						if (expiryDate > now) {
							// 還在訂選期限內，回傳 200 (這屬於正常的業務邏輯狀態，不是 Error)
							return Response.json(
								{
									success: false,
									message: "伺服器已在訂選狀態",
									expiresAt: existingServer.pinExpiry, // 回傳 ISO 字串給 Python 解析
								},
								{ status: 200 },
							);
						}
					}

					// 5. 執行訂選 (設定到期時間為 24 小時後)
					const PIN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 小時的毫秒數
					const newExpiry = new Date(now.getTime() + PIN_DURATION_MS);
					const newExpiryString = newExpiry.toISOString(); // 轉換為適合資料庫儲存的 ISO 格式

					await db
						.update(server)
						.set({
							pin: true,
							pinExpiry: newExpiryString,
						})
						.where(eq(server.id, guildId));

					return Response.json(
						{
							success: true,
							message: "伺服器已成功訂選！",
							expiresAt: newExpiryString,
						},
						{ status: 200 },
					);
				} catch (error) {
					console.error("Failed to pin server:", error);
					return Response.json({ error: "內部伺服器錯誤" }, { status: 500 });
				}
			},
		},
	},
});
