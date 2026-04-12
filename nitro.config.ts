import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  prerender: {
    routes: ["/profile"],
  },
  compressPublicAssets: true,
  exportConditions: ['edge', 'worker'],
  alias: {
    'react-dom/server': 'react-dom/server.edge'
  },
  preset: "cloudflare-module",
  externals: {
    inline: [
      "@tanstack/react-start",
      'effect',
      '@neondatabase/serverless', 
    ],
    external: [
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
      /^cloudflare:/,
    ],
  },
  minify: true,
  debug: process.env.NODE_ENV !== "production",
  rollupConfig: {
		external: [/^@sentry\//],
	},
});
