import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  preset: 'bun',
  prerender: {
    crawlLinks: true,
  },
  publicAssets: [
      {
        dir: './public',
        maxAge: 31536000, // 1 year
      },
  ],
  compressPublicAssets: true,
  alias: {
    'react-dom/server': 'react-dom/server.edge'
  },
  externals: {
    inline: [
      "@tanstack/react-start",
      'effect',
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
    ],
  },
  minify: true,
  debug: process.env.NODE_ENV !== "production",
  rollupConfig: {
		external: [/^@sentry\//],
	},
});
