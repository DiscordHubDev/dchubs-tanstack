// ─── Vite 8 config (Rolldown + Oxc) ──────────────────────────────────────────
//
// Migration summary from original:
//   • rollupOptions  → rolldownOptions   (Vite 8 / Rolldown)
//   • manualChunks   → advancedChunks    (function form deprecated in Vite 8)
//   • `isProd` now derived from `mode` parameter, not process.env.NODE_ENV
//   • devtools() gated to dev-only
//   • server.warmup added (pre-warms HMR on hot routes)
//   • modulePreload.polyfill disabled (unnecessary at target: esnext)
//   • @rolldown/plugin-babel KEPT — @vitejs/plugin-react v6 now uses Oxc
//     internally, so Babel is the only correct path for the React Compiler preset
//   • base now guards against undefined VITE_CDN_ORIGIN
//   • prerender filter simplified (single-element array → direct comparison)
//   • optimizeDeps.rolldownOptions used for Rolldown-native dep optimisation

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// ─── Rolldown advancedChunks groups ───────────────────────────────────────────
// Replaces the manualChunks() function. Groups are evaluated in `priority`
// order (higher = matched first). Regex matching is done against the module id.
const chunkGroups = [
  // React runtime — tiny, cached forever, loaded on every page
  {
    name: "vendor-react",
    test: /node_modules\/(react|react-dom|scheduler)\//,
    priority: 10,
  },

  // TanStack ecosystem (router, query, table, form, start…)
  { name: "vendor-tanstack", test: /node_modules\/@tanstack\//, priority: 9 },

  // Radix UI primitives
  {
    name: "vendor-radix",
    test: /node_modules\/(radix-ui|@radix-ui)\//,
    priority: 8,
  },

  // Framer Motion — large, isolate so pages that skip it stay lean
  { name: "vendor-motion", test: /node_modules\/framer-motion\//, priority: 7 },

  // Icon libraries — tree-shake at source; still worth separating
  {
    name: "vendor-icons",
    test: /node_modules\/(lucide-react|react-icons)\//,
    priority: 6,
  },

  // Effect — large functional-programming runtime
  { name: "vendor-effect", test: /node_modules\/effect\//, priority: 5 },

  // Date utilities
  { name: "vendor-dates", test: /node_modules\/date-fns\//, priority: 5 },

  // Auth system (contains key & crypto logic — keep isolated for clarity)
  { name: "vendor-auth", test: /node_modules\/better-auth\//, priority: 5 },

  // Markdown rendering pipeline
  {
    name: "vendor-markdown",
    test: /node_modules\/(react-markdown|remark|rehype)/,
    priority: 4,
  },

  // Small UI utilities — CVA, clsx, tailwind-merge
  // Note: these are tiny; if advancedChunks merges them automatically you can
  // safely drop this group without impact.
  {
    name: "vendor-ui-utils",
    test: /node_modules\/(class-variance-authority|clsx|tailwind-merge)\//,
    priority: 3,
  },

  // Misc single-package chunks
  { name: "vendor-alerts", test: /node_modules\/sweetalert2\//, priority: 2 },
  { name: "vendor-toast", test: /node_modules\/react-toastify\//, priority: 2 },
  { name: "vendor-schema", test: /node_modules\/zod\//, priority: 2 },
  { name: "vendor-db", test: /node_modules\/drizzle-orm\//, priority: 2 },
];

// ─── Config ───────────────────────────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  // ✅ Use `mode` (set by Vite CLI) rather than process.env.NODE_ENV, which
  //    may not be populated until after Vite has already consumed the config.
  const isProd = mode === "production";
  const isAnalyze = process.env.ANALYZE === "true";
  const cdnOrigin = process.env.VITE_CDN_ORIGIN;

  return {
    // Guard against an undefined CDN origin in non-prod environments
    base: isProd && cdnOrigin ? `${cdnOrigin}/` : "/",

    resolve: {
      tsconfigPaths: true,
    },

    // ─── Dev: pre-bundle heavy deps so HMR stays fast ─────────────────────
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "@tanstack/react-router",
        // Force-prebundle Radix UI primitives to avoid hundreds of
        // individual file requests in dev mode.
        "@radix-ui/react-accordion",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-aspect-ratio",
        "@radix-ui/react-avatar",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-label",
        "@radix-ui/react-popover",
        "@radix-ui/react-progress",
        "@radix-ui/react-radio-group",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slider",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toast",
        "@radix-ui/react-toggle",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
        "lucide-react",
        "clsx",
        "tailwind-merge",
      ],
      exclude: [
        "bun",
        "drizzle-orm",
        "drizzle-orm/bun-sql",
        "pg",
        "better-auth",
        "@aws-sdk/client-s3",
      ],
      // ✅ Vite 8: use rolldownOptions for dep optimiser config,
      // esbuildOptions is now deprecated.
      rolldownOptions: {
        // treeshake during dep pre-bundling for smaller cached chunks
        treeshake: true,
      },
    },

    // ─── SSR externals ─────────────────────────────────────────────────────
    ssr: {
      external: [
        // 1. Core runtime
        "bun",
        "bun:sqlite",
        "node:crypto",

        // 2. Database / ORM — must never be bundled into client
        "drizzle-orm",
        "drizzle-orm/bun-sql",
        "pg",

        // 3. Auth — contains key material & crypto
        "better-auth",
        "@better-auth/drizzle-adapter",

        // 4. Cloud / storage SDKs — contain AWS credential logic
        "@aws-sdk/client-s3",
        "@aws-sdk/lib-storage",
        "cloudinary",

        // 5. Env validation & tooling
        "@t3-oss/env-core",
        "dotenv",
        "mime-types",
      ],
    },

    // ─── Plugins ───────────────────────────────────────────────────────────
    plugins: [
      // Bundle analyser — must be first to capture the full module graph
      isAnalyze &&
        visualizer({
          open: true,
          gzipSize: true,
          brotliSize: true,
          filename: ".vite/stats.html",
          template: "treemap",
        }),

      !isProd && devtools(),

      // CSS — process early so other plugins see resolved class names
      tailwindcss(),

      // TanStack Start (file-based routing, prerender, server functions)
      tanstackStart({
        prerender: {
          enabled: true,
          crawlLinks: false,
          filter: ({ path }) => {
            // ✅ Direct comparison; no need for a single-element array
            if (path === "/") return false;
            if (path.startsWith("/servers/")) return false;
            if (path.startsWith("/bots/")) return false;
            if (path.startsWith("/protected/")) return false;
            return true;
          },
        },
        server: {
          build: {
            inlineCss: { enabled: true, transformAssets: true },
          },
        },
      }),

      // Bun-flavoured Nitro server
      nitro({ preset: "bun" }),

      // ✅ @vitejs/plugin-react v6 uses Oxc internally (not Babel) for
      // React Refresh. The React Compiler is a Babel preset and CANNOT be
      // folded into viteReact() any more — it must stay as a separate
      // @rolldown/plugin-babel pass.
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
    ].filter(Boolean),

    // ─── Build ─────────────────────────────────────────────────────────────
    build: {
      // ✅ esnext targets the modern baseline; pair with polyfill: false below
      target: "esnext",

      // Oxc minifier (Rust-native, already fastest option)
      minify: isProd ? "oxc" : false,
      oxc: isProd ? { transform: { drop: ["console", "debugger"] } } : undefined,

      cssCodeSplit: true,

      cssMinify: "lightningcss",
      sourcemap: isProd ? false : "inline",

      // Skips the gzip/brotli size report — measurably faster CI builds
      reportCompressedSize: false,

      chunkSizeWarningLimit: 1500,

      // ✅ No preload polyfill needed — all target browsers support
      // <link rel="modulepreload"> natively at esnext baseline.
      modulePreload: { polyfill: false },

      // ─── Rolldown options (replaces rollupOptions in Vite 8) ───────────
      rolldownOptions: {
        external: ["bun", "bun:sqlite"],

        output: {
          // ✅ advancedChunks replaces the deprecated manualChunks function.
          // Rolldown evaluates groups by priority and uses regex test against
          // the module id — no manual maintenance when you add a dependency.
          codeSplitting: { groups: chunkGroups },

          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },

        treeshake: {
          annotations: true,
          // "always" is the safe default. Flip to false only after
          // verifying none of your dependencies rely on property-read
          // side-effects (most modern ESM-first libraries are safe).
          propertyReadSideEffects: "always",
          unknownGlobalSideEffects: true,
          // Only CSS files carry genuine module-level side-effects here
          moduleSideEffects: (id: string) => id.endsWith(".css"),
        },
      },
    },
  };
});
