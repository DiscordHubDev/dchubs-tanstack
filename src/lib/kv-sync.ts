import { Effect } from "effect";

/**
 * 將封鎖狀態同步至 Cloudflare KV
 * @param userId 目標用戶 ID
 * @param isBanned true 代表封鎖寫入 KV，false 代表解封從 KV 移除
 */
export const syncToCloudflareKV = (userId: string, isBanned: boolean) => {
  return Effect.tryPromise({
    try: async () => {
      // 注意：如果在 Cloudflare Pages/Workers 環境，這裡可能需要換成你的 env 讀取方式
      const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
      const CF_KV_NAMESPACE_ID = process.env.CF_BANNED_USERS_KV_ID;
      const CF_API_TOKEN = process.env.CF_API_TOKEN;

      if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
        throw new Error("遺失 Cloudflare API 環境變數 (CF_ACCOUNT_ID, KV_ID, API_TOKEN)");
      }

      const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/banned:${userId}`;

      const response = await fetch(kvUrl, {
        // 如果是封鎖就用 PUT 寫入，解封就用 DELETE 刪除該 key
        method: isBanned ? "PUT" : "DELETE",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
        },
        body: isBanned ? "true" : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare API 錯誤: ${response.status} ${errorText}`);
      }

      return await response.json();
    },
    catch: (error) => new Error(`KV 同步失敗: ${error}`),
  });
};
