import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

// ─── Vendor chunk grouping ─────────────────────────────────────────────────────
function manualChunks(id: string): string | undefined {
	if (!id.includes("node_modules")) return undefined;

	// React runtime — tiny, loaded on every page, cache forever
	if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
		return "vendor-react";

	// TanStack ecosystem (router, query, table, form, start...)
	if (id.includes("node_modules/@tanstack/")) return "vendor-tanstack";

	// Radix UI primitives
	if (
		id.includes("node_modules/@radix-ui/") ||
		id.includes("node_modules/radix-ui/")
	)
		return "vendor-radix";

	// Framer Motion — large, isolate so pages that skip it stay lean
	if (id.includes("node_modules/framer-motion/")) return "vendor-motion";

	// Icon libraries — tree-shake at source; still worth separating
	if (
		id.includes("node_modules/lucide-react/") ||
		id.includes("node_modules/react-icons/")
	)
		return "vendor-icons";

	// Effect — large functional-programming runtime
	if (id.includes("node_modules/effect/")) return "vendor-effect";

	// Date utilities
	if (id.includes("node_modules/date-fns/")) return "vendor-dates";

	// UI utility (CVA, clsx, tailwind-merge...)
	if (
		id.includes("node_modules/class-variance-authority/") ||
		id.includes("node_modules/clsx/") ||
		id.includes("node_modules/tailwind-merge/")
	)
		return "vendor-ui-utils";

	if (id.includes("node_modules/better-auth/")) return "vendor-auth";
	if (
		id.includes("node_modules/react-markdown/") ||
		id.includes("node_modules/remark") ||
		id.includes("node_modules/rehype")
	)
		return "vendor-markdown";

	if (id.includes("node_modules/sweetalert2/")) return "vendor-alerts";
	if (id.includes("node_modules/react-toastify/")) return "vendor-toast";
	if (id.includes("node_modules/zod/")) return "vendor-schema";
	if (id.includes("node_modules/drizzle-orm/")) return "vendor-db";
}

// ─── Config ───────────────────────────────────────────────────────────────────
export default defineConfig(({ mode }) => {
	const isProd = process.env.NODE_ENV === "production";
	const isAnalyze = process.env.ANALYZE === "true";

	return {
		base: "",
		// process.env.NODE_ENV === "production"
		// 	? `${process.env.VITE_CDN_ORIGIN}/`
		// 	: "/",

		// ─── 下面的配置完全保持你原本的寫法 ───
		resolve: {
			tsconfigPaths: true,
		},

		optimizeDeps: {
			include: ["react", "react-dom", "@tanstack/react-router"],
			exclude: ["bun", "drizzle-orm/bun-sql"],
		},

		ssr: {
			external: ["bun", "drizzle-orm/bun-sql"],
		},

		plugins: [
			isAnalyze &&
				visualizer({
					open: true,
					gzipSize: true,
					brotliSize: true,
					filename: ".vite/stats.html",
					template: "treemap",
				}),

			devtools(),
			tailwindcss(),
			tanstackStart({
				prerender: {
					enabled: true,
					crawlLinks: false,
					filter: ({ path }) => {
						const exactDynamicRoutes = ["/"];
						if (exactDynamicRoutes.includes(path)) return false;
						if (path.startsWith("/servers/")) return false;
						if (path.startsWith("/bots/")) return false;
						if (path.startsWith("/protected/")) return false;
						return true;
					},
				},
				server: {
					build: {
						inlineCss: {
							enabled: true,
							transformAssets: true,
						},
					},
				},
			}),
			nitro({ preset: "bun" }),
			viteReact(),
			babel({ presets: [reactCompilerPreset()] }),
		].filter(Boolean),

		build: {
			target: "esnext",
			minify: isProd ? "esbuild" : false,
			...(isProd && {
				minifyOptions: {
					compress: {
						drop_console: true,
						drop_debugger: true,
					},
					format: { comments: false },
				},
			}),
			cssCodeSplit: true,
			sourcemap: isProd ? false : "inline",
			reportCompressedSize: false,
			chunkSizeWarningLimit: 1500,
			rollupOptions: {
				output: {
					manualChunks, // 這裡沿用你原本在上面定義好的 function
					chunkFileNames: "assets/[name]-[hash].js",
					entryFileNames: "assets/[name]-[hash].js",
					assetFileNames: "assets/[name]-[hash][extname]",
				},
				treeshake: {
					annotations: true,
					propertyReadSideEffects: "always",
					unknownGlobalSideEffects: true,
					moduleSideEffects: (id: string) => id.endsWith(".css"),
				},
			},
		},
	};
});
