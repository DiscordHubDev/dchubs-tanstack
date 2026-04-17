// src/server.ts
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

const handler = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: {
		prefix: process.env.CDN_ORIGIN || "",
		crossOrigin: "anonymous",
		cache: true,
	},
});

export default createServerEntry({ fetch: handler });
