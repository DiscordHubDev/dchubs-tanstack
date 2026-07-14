import crypto from "node:crypto";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  // 1. 生成這次專屬的隨機 Nonce
  const nonce = crypto.randomBytes(16).toString("base64");

  // 2. 注入 nonce 到 context
  const result = await next({
    context: { nonce },
  });

  if (result?.response) {
    const isDev = process.env.NODE_ENV === "development"; // 或 import.meta.env.DEV
    const cspHeaderName = isDev ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

    // 3. 組合 CSP：將 nonce 正確注入到 script-src 中
    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://assets.dchubs.org https://ajax.cloudflare.com https://static.cloudflareinsights.com`, // 移除 unsafe-eval + unsafe-inline（測試後）
      "style-src 'self' 'unsafe-inline' https://assets.dchubs.org", // style 通常允許 unsafe-inline 較安全
      "img-src 'self' data: https://cdn.discordapp.com https://res.cloudinary.com blob: https://*.discord.com",
      "frame-src https://discord.com https://www.youtube.com https://*.discord.com",
      "connect-src 'self' https://*.dchubs.org https://discord.com https://*.cloudflare.com",
      "font-src 'self' https://assets.dchubs.org",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
      // "require-trusted-types-for 'script'" // 進階防護（需搭配 Trusted Types）
    ].join("; ");

    // 寫入 CSP
    result.response.headers.set(cspHeaderName, cspDirectives);

    // 寫入其他安全標頭
    result.response.headers.set("X-Frame-Options", "SAMEORIGIN");
    result.response.headers.set("X-Content-Type-Options", "nosniff");

    // 🟢 修正 2: 補上 Lighthouse 要求的 COOP
    if (!result.response.headers.has("Cross-Origin-Resource-Policy")) {
      result.response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    }

    result.response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

    // 🟢 修正 3: 補上 Referrer-Policy 防止隱私洩漏
    result.response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    result.response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );

    result.response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), sync-xhr=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), speaker-selection=() fullscreen=(self https://discord.com https://www.youtube.com)",
    );
  }

  return result;
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => {
    if (ctx.handlerType !== "serverFn") return false;

    const authHeader = ctx.request.headers.get("Authorization");
    const cronToken = process.env.API_CRON_TOKEN;

    // 🟢 修正 4: 嚴格檢查 cronToken 是否存在，防止 "Bearer undefined" 繞過漏洞
    if (cronToken && authHeader === `Bearer ${cronToken}`) {
      return false; // 放行機器人
    }

    return true;
  },
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
  };
});
