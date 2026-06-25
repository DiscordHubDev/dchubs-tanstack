import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { adminMiddleware } from "#/lib/auth-middleware";
import { AnnouncementService, AnnouncementServiceLive } from "#/services/announcement";

export const getGlobalAnnouncement = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async () => {
    // 組裝 Effect 程式
    const program = Effect.gen(function* () {
      const service = yield* AnnouncementService;
      return yield* service.getActiveAnnouncement;
    }).pipe(
      // 注入實作層
      Effect.provide(AnnouncementServiceLive),
    );

    // 執行 Effect
    try {
      const announcement = await Effect.runPromise(program);
      return { success: true, data: announcement };
    } catch (error) {
      console.error("Failed to fetch announcement:", error);
      // 這裡可以根據錯誤型態做細緻處理
      return { success: false, error: "Internal Server Error" };
    }
  });
