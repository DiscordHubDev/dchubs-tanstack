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
		prefix: "/",
		crossOrigin: "anonymous",
		cache: isProd,
	},
});

export default createServerEntry({ fetch: handler });
