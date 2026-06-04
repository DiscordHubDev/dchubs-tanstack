// 請先確保安裝了 directus sdk（選用），這裡我們直接用標準 fetch 實現，最輕量
// bun add @types/node

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	// 1. 先用帳密登入 Directus 取得臨時 Token
	console.log("🔑 正在嘗試登入 Directus...");
	const loginRes = await fetch("${DIRECTUS_URL}/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});

	if (!loginRes.ok) {
		console.error("❌ Directus 登入失敗，請檢查管理員帳密是否正確。");
		console.error(await loginRes.text());
		return;
	}

	const loginData = (await loginRes.json()) as {
		data: { access_token: string };
	};
	const directusToken = loginData.data.access_token;
	console.log("✅ 登入成功，已取得 Access Token。");

	// 2. 透過 Directus API 撈取資料
	console.log("🔍 正在從 Directus 撈取需要修復的 956 筆資料...");
	const collectionName = "auth_user";

	const queryParams = new URLSearchParams({
		filter: JSON.stringify({
			_and: [
				{ username: { _eq: "未知使用者" } },
				{ discord_id: { _nempty: true } },
			],
		}),
		fields: "id,discord_id",
		limit: "-1",
	});

	const fetchUsersRes = await fetch(
		"${DIRECTUS_URL}/items/${collectionName}?${queryParams}",
		{
			headers: { Authorization: `Bearer ${directusToken}` },
		},
	);

	if (!fetchUsersRes.ok) {
		console.error("❌ 無法從 Directus 撈取資料:", await fetchUsersRes.text());
		return;
	}

	const { data: targetUsers } = (await fetchUsersRes.json()) as {
		data: Array<{ id: string; discord_id: string }>;
	};
	console.log(`📊 Directus 回傳了 ${targetUsers.length} 筆待修復資料。`);

	if (targetUsers.length === 0) {
		console.log("✅ 沒有需要修復的資料。");
		return;
	}

	let successCount = 0;
	let failCount = 0;

	// 3. 開始跑迴圈修復
	for (const [index, user] of targetUsers.entries()) {
		const progress = `[${index + 1}/${targetUsers.length}]`;
		console.log(`${progress} 正在處理 Discord ID: ${user.discord_id}...`);

		try {
			// 請求 Discord API
			const discordRes = await fetch(
				`https://discord.com/api/v10/users/${user.discord_id}`,
				{
					headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
				},
			);

			if (!discordRes.ok) {
				if (discordRes.status === 429) {
					const retryAfter = Number(discordRes.headers.get("Retry-After")) || 5;
					console.warn(
						`⚠️ 觸發 Discord Rate Limit！強制暫停 ${retryAfter} 秒...`,
					);
					await sleep(retryAfter * 1000);
				}
				throw new Error(`Discord API 錯誤: ${discordRes.status}`);
			}

			const discordUser = (await discordRes.json()) as {
				username: string;
				name?: string;
			};

			const correctName = discordUser.name || discordUser.username;
			const syncName = discordUser.username;

			// 4. 更新 Directus 資料
			const updateRes = await fetch("/items/${collectionName}/${user.id}", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${directusToken}`,
				},
				body: JSON.stringify({ name: correctName, username: syncName }),
			});

			if (!updateRes.ok) {
				throw new Error(`Directus 更新失敗: ${updateRes.statusText}`);
			}

			console.log(`✨ 成功將 Directus ID ${user.id} 更新為: "${correctName}"`);
			successCount++;
		} catch (error) {
			console.error(`❌ 處理用戶 ${user.id} 時發生錯誤:`, error);
			failCount++;
		}

		await sleep(250);
	}

	console.log("\n======================================");
	console.log(`🎉 修復任務結束！`);
	console.log(`✅ 成功: ${successCount} 筆`);
	console.log(`❌ 失敗: ${failCount} 筆`);
	console.log("======================================");
}

main().catch(console.error);
