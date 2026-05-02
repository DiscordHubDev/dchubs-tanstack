import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import visualizer from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

const bunExternals = ["bun", "bun:sqlite", "bun:postgres"];
const serverExternal = [
	"cloudflare:sockets",
	"drizzle-orm/bun-sqlite",
	"drizzle-orm/sqlite-core",
	"drizzle-orm/d1",
	"pg",
	"pg-native",
	"pg-query-stream",
	"sqlite3",
	"mysql2",
	"better-sqlite3",
	"fsevents",
	"ws",
	"canvas",
	"jsdom",
	/^node:/,
	...bunExternals,
];

const base =
	process.env.NODE_ENV === "production" && process.env.CDN_ORIGIN
		? `${process.env.CDN_ORIGIN}/`
		: "/";

const databaseUrl = process.env.DATABASE_URL;

function getPackageName(id: string) {
	const modulePath = id.split("node_modules/").pop();
	if (!modulePath) return;

	const segments = modulePath.split("/");
	if (segments[0]?.startsWith("@") && segments[1]) {
		return `${segments[0]}/${segments[1]}`;
	}
	return segments[0];
}

function manualVendorChunks(id: string) {
	if (!id.includes("node_modules")) return;

	const pkg = getPackageName(id);
	if (!pkg) return;

	const reactPackages = new Set([
		"react",
		"react-dom",
		"scheduler",
		"use-sync-external-store",
		"loose-envify",
		"js-tokens",
		"object-assign",
	]);

	if (reactPackages.has(pkg)) return "react-vendor";
	if (pkg.startsWith("@tanstack/")) return "tanstack-vendor";
	if (pkg.startsWith("@radix-ui/")) return "radix-vendor";
	if (
		pkg === "react-markdown" ||
		pkg.startsWith("remark-") ||
		pkg.startsWith("rehype-") ||
		pkg.startsWith("micromark") ||
		pkg.startsWith("mdast") ||
		pkg.startsWith("hast") ||
		pkg.startsWith("unified") ||
		pkg.startsWith("vfile") ||
		pkg.startsWith("unist-")
	) {
		return "markdown-vendor";
	}
	if (pkg === "lucide-react" || pkg === "react-icons") return "icons-vendor";

	// Let Rollup decide chunk boundaries to avoid TDZ init issues.
	if (pkg === "better-auth" || pkg.startsWith("@better-auth/")) return;

	// Let Rollup resolve pg graphs to avoid circular chunk warnings.
	if (pkg === "pg" || pkg.startsWith("pg-")) return;

	return "vendor";
}

export default defineConfig({
	base,
	resolve: {
		tsconfigPaths: true,
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"@tanstack/react-router",
			"@tanstack/start",
		],
		exclude: bunExternals,
	},
	ssr: {
		noExternal: ["@tanstack/react-start", "effect", "lucide-react"],
		external: bunExternals,
	},
	css: {
		transformer: "lightningcss",
	},
	plugins: [
		devtools(),
		tailwindcss(),
		nitro({
			preset: "bun",
			compressPublicAssets: false,
			alias: {
				"react-dom/server": "react-dom/server.edge",
			},
			minify: true,
			debug: process.env.NODE_ENV !== "production",
			sourcemap: process.env.NODE_ENV !== "production",
			rollupConfig: {
				external: [/^@sentry\//, /^bun:/],
			},
			prerender: {
				crawlLinks: true,
				ignore: ["/api/**"],
			},
			storage: {
				cache: {
					driver: "fs",
					base: "./.tanstack/cache",
				},
			},
			runtimeConfig: {
				databaseUrl,
			},
		}),
		tanstackStart(),
		viteReact(),
		process.env.ANALYZE === "true" &&
			visualizer({ open: true, gzipSize: true, brotliSize: true }),
	].filter(Boolean),
	build: {
		sourcemap: "hidden",
		target: "es2022",
		cssMinify: "lightningcss",
		minify: "esbuild",
		chunkSizeWarningLimit: 1500, // 調高警告閾值 (單位 KB)
		rollupOptions: {
			external: serverExternal,
			output: {
				manualChunks: manualVendorChunks,
			},
			onwarn(warning, warn) {
				if (warning.message.includes("use client")) return;
				if (warning.code === "CIRCULAR_DEPENDENCY") return;
				warn(warning);
			},
		},
	},
});
