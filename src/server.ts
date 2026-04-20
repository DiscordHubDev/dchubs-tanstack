// src/server.ts
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

// 檢查是否為生產環境
const isProd = process.env.NODE_ENV === "production";

const handler = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: {
		// 開發環境強行使用空字串，確保讀取本地 Vite Server 的資源
		prefix: isProd ? process.env.CDN_ORIGIN || "" : "",
		crossOrigin: "anonymous",
		// 開發環境可以關閉 transformAssets 的快取，確保資源變動即時反映
		cache: isProd,
	},
});

export default createServerEntry({ fetch: handler });
