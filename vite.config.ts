import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import visualizer from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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

	// better-auth 在 SSR/prerender bundle 內有循環初始化相依，
	// 強制手動分 chunk 可能導致 "Cannot access ... before initialization"。
	// 交給 Rollup 自動決定 chunk 邊界可避免 TDZ 初始化順序錯誤。
	if (pkg === "better-auth" || pkg.startsWith("@better-auth/")) return;

	// 解決 pg -> pg-pool 的 Circular chunk 錯誤
	// 交給 Rollup 原生處理依賴圖，避免強制分包導致循環參照
	if (pkg === "pg" || pkg.startsWith("pg-")) return;

	return "vendor";
}

export default defineConfig(({ isSsrBuild }) => {
	return {
		base: "",
		experimental: {
			renderBuiltUrl(filename, { hostType }) {
				if (hostType === "js") {
					return { relative: true };
				}
				return `https://${process.env.CDN_ORIGIN}/${filename}`;
			},
		},
		ssr: {
			noExternal: ["lucide-react"],
		},
		css: {
			transformer: "lightningcss",
		},
		plugins: [
			// cloudflare({ viteEnvironment: { name: "ssr" } }),
			devtools(),
			nitro(),
			tsconfigPaths({ projects: ["./tsconfig.json"] }),
			tailwindcss(),
			tanstackStart(),
			viteReact({
				babel: {
					plugins: ["babel-plugin-react-compiler"],
				},
			}),
			process.env.ANALYZE === "true" &&
				visualizer({ open: true, gzipSize: true, brotliSize: true }),
		].filter(Boolean),

		build: {
			sourcemap: "hidden",
			target: "es2022",
			cssMinify: "lightningcss",
			minify: "terser",

			rollupOptions: {
				// 將 output 和 external 都透過 isSsrBuild 來動態給予
				...(isSsrBuild
					? {
							// SSR 構建：告訴 Vite 忽略這些 Cloudflare / 後端專屬套件，把它們保留給之後的 Nitro 處理
							external: [
								"cloudflare:sockets",
								"drizzle-orm/bun-sqlite",
								"drizzle-orm/sqlite-core",
								"drizzle-orm/d1",
								// 如果 Vite 在 SSR 打包時抱怨找不到 node 內建模組，也可以加在這裡
								// /^node:/
							],
						}
					: {
							// Client 構建：不需要 external 後端套件，但需要做 code splitting (你原本的 vendor chunks)
							output: { manualChunks: manualVendorChunks },
						}),

				onwarn(warning, warn) {
					// 忽略 "use client" 警告
					if (warning.message.includes("use client")) {
						return;
					}
					if (warning.code === "CIRCULAR_DEPENDENCY") {
						return;
					}
					warn(warning);
				},
			},
		},
	};
});
