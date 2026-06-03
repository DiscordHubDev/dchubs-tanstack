import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// ─── Environment flags ────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";
const isAnalyze = process.env.ANALYZE === "true";

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
export default defineConfig({
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
				template: "treemap", // "sunburst" | "treemap" | "network"
			}),

		devtools(),
		tailwindcss(),
		tanstackStart(),
		nitro({ preset: "bun" }),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	].filter(Boolean),

	build: {
		// ── Target ────────────────────────────────────────────────────────────────
		// "esnext" → no downlevelling; Bun + modern browsers understand it natively.
		// Change to ["es2020", "edge88", "firefox78", "chrome87", "safari14"] if you
		// need broader browser support.
		target: "esnext",

		minify: isProd ? "esbuild" : false,

		...(isProd && {
			minifyOptions: {
				compress: {
					drop_console: true,
					drop_debugger: true,
				},
				format: {
					comments: false, // 相當於 legalComments: 'none'
				},
			},
		}),

		// ── CSS ───────────────────────────────────────────────────────────────────
		// Split CSS per-chunk so route pages only load their own styles.
		cssCodeSplit: true,

		// ── Source maps ───────────────────────────────────────────────────────────
		// false        → no source maps (smallest output, safest for public deploy)
		// "hidden"     → generates maps but doesn't reference them in bundles
		//                (upload to Sentry / Datadog without exposing to users)
		// true/"inline"→ full source maps (dev only)
		sourcemap: isProd ? false : "inline",

		// ── Misc ──────────────────────────────────────────────────────────────────
		// Skip gzip size calculation on every chunk → faster build output logging.
		reportCompressedSize: false,

		// Warn when a single chunk exceeds this size (kB). Adjust to taste.
		chunkSizeWarningLimit: 1500,

		// ── Rollup options ────────────────────────────────────────────────────────
		rollupOptions: {
			output: {
				/**
				 * Vendor chunk splitting.
				 *
				 * TanStack Router + Start already handle route-level code splitting
				 * automatically via dynamic imports — no manual config needed there.
				 *
				 * Here we split large, rarely-changing vendor libraries into separate
				 * cacheable chunks so that a UI change in your app code doesn't bust
				 * the React or TanStack cache entries in the user's browser.
				 */
				manualChunks,

				// Deterministic, content-hashed filenames for long-lived caching.
				chunkFileNames: "assets/[name]-[hash].js",
				entryFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash][extname]",
			},

			/**
			 * Tree-shaking preset.
			 *
			 * "recommended" = safest aggressive mode.
			 * moduleSideEffects: mark CSS files as having side effects (they inject
			 * global styles) but treat everything else as pure until proven otherwise.
			 * This lets Rollup eliminate more dead code from packages that forgot to
			 * mark themselves as side-effect-free in their package.json.
			 */
			treeshake: {
				annotations: true,
				propertyReadSideEffects: "always",
				unknownGlobalSideEffects: true,
				moduleSideEffects: (id: string) => id.endsWith(".css"),
			},
		},
	},
});
