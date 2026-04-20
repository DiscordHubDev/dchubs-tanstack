import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  preset: 'bun',
  compressPublicAssets: false,
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
  sourceMap: process.env.NODE_ENV !== "production",
  rollupConfig: {
		external: [/^@sentry\//],
	},
});
