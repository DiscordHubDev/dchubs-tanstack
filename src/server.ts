// src/server.ts
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

const cdnOrigin = process.env.VITE_CDN_ORIGIN || "";

// 檢查是否為生產環境
const isProd = process.env.NODE_ENV === "production";

const handler = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: {
		prefix: isProd ? cdnOrigin || "" : "",
		crossOrigin: "anonymous",
		cache: isProd,
		warmup: true,
	},
});

export default createServerEntry({ fetch: handler });
