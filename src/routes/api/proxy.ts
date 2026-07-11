// app/routes/api/proxy.ts
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_DOMAINS = ["cdn.discordapp.com", "gallery.dawngs.top", "res.cloudinary.com"];

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");

        if (!url) {
          return new Response("Missing url parameter", { status: 400 });
        }

        let parsedTargetUrl: URL;
        try {
          parsedTargetUrl = new URL(url);
        } catch {
          return new Response("Invalid url parameter", { status: 400 });
        }

        if (!ALLOWED_DOMAINS.includes(parsedTargetUrl.hostname)) {
          return new Response("Forbidden domain", { status: 403 });
        }

        // Fetch the image
        const imageResponse = await fetch(url, {
          headers: { Accept: "image/webp,image/apng,image/*,*/*;q=0.8" },
        });

        if (!imageResponse.ok || !imageResponse.body) {
          return new Response("Failed to fetch upstream image", { status: 502 });
        }

        // Return proxied response with custom headers
        return new Response(imageResponse.body, {
          status: imageResponse.status,
          headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": imageResponse.headers.get("Content-Type") || "image/jpeg",
          },
        });
      },
    },
  },
});
