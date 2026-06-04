import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "#/drizzle/db";
import * as schema from "#/drizzle/schema";

// =========================================================================
// ✅ 1. 給 Better-Auth CLI 用的靜態宣告
// 這裡必須放入真實的 Drizzle Adapter、Schema、會影響 DB 的 Plugins 以及自定義欄位。
// 這樣 CLI 才能準確比對並生成正確的 SQL/Migration 檔案。
// =========================================================================
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),

	// 必須放 admin plugin，因為它會在 User 關聯裡新增欄位 (如 role) 和相關表
	plugins: [admin()],

	// 必須包含自定義的模型名稱與欄位，讓 CLI 知道要建立哪些 Column
	user: {
		modelName: "user",
		additionalFields: {
			discordId: { type: "string", required: false },
			username: { type: "string", required: false },
			avatar: { type: "string", required: false },
			banner: { type: "string", required: false },
			bannerColor: { type: "string", required: false },
			bio: { type: "string", required: false },
			social: { type: "string", required: false },
		},
	},
	session: { modelName: "authSession" },
	account: {
		modelName: "authAccount",
	},
	verification: { modelName: "authVerification" },
});

// =========================================================================
// 🎯 2. 你原本的架構（不變）：專案運行時（Runtime）真正使用的動態載入
// =========================================================================
type RuntimeModule = typeof import("@/lib/auth.runtime");
type AuthInstance = Awaited<ReturnType<RuntimeModule["createAuth"]>>;

let authPromise: Promise<AuthInstance> | undefined;

export async function getAuth(): Promise<AuthInstance> {
	if (!authPromise) {
		authPromise = import("@/lib/auth.runtime").then(({ createAuth }) =>
			createAuth(),
		);
	}
	return authPromise;
}
