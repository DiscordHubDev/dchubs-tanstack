import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { nitro } from "nitro/vite";
import visualizer from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

const isProd = process.env.NODE_ENV === "production";

const bunExternals = ["bun", "bun:sqlite", "bun:postgres"];
const baseServerExternal = [
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
	...bunExternals,
];

const rollupExternal = [...baseServerExternal, /^node:/];

const base =
	isProd && process.env.CDN_ORIGIN ? `${process.env.CDN_ORIGIN}/` : "/";
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

const reactPackages = new Set([
	"react",
	"react-dom",
	"scheduler",
	"use-sync-external-store",
	"loose-envify",
	"js-tokens",
	"object-assign",
]);

function manualVendorChunks(id: string) {
	if (!id.includes("node_modules")) return;

	const pkg = getPackageName(id);
	if (!pkg) return;

	if (reactPackages.has(pkg)) return "react-vendor";
	if (pkg.startsWith("@tanstack/")) return "tanstack-vendor";
	if (pkg.startsWith("@radix-ui/")) return "radix-vendor";

	if (
		pkg === "react-markdown" ||
		/^(remark-|rehype-|micromark|mdast|hast|unified|vfile|unist-)/.test(pkg)
	) {
		return "markdown-vendor";
	}
	if (pkg === "lucide-react" || pkg === "react-icons") return "icons-vendor";

	if (pkg === "better-auth" || pkg.startsWith("@better-auth/")) return;
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
		external: baseServerExternal,
	},
	css: {
		transformer: "lightningcss",
	},
	plugins: [
		!isProd && devtools(),
		tailwindcss(),
		nitro({
			preset: "bun",
			compressPublicAssets: false,
			alias: {
				"react-dom/server": "react-dom/server.edge",
			},
			minify: true,
			debug: !isProd,
			sourcemap: !isProd,
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
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		tanstackStart(),
		react(),
		process.env.ANALYZE === "true" &&
			visualizer({ open: true, gzipSize: true, brotliSize: true }),
	].filter(Boolean),
	build: {
		sourcemap: "hidden",
		target: "es2022",
		cssMinify: "lightningcss",
		minify: "oxc",
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			external: rollupExternal,
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
