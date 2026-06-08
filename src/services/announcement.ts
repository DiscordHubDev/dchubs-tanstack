import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { db } from "#/drizzle/db";
import { announcements } from "#/drizzle/schema";

// 1. 定義錯誤型態
export class DbError {
	readonly _tag = "DbError";
	constructor(readonly error: unknown) {}
}

// 2. 定義 Service 介面 (Tag)
export interface AnnouncementService {
	getActiveAnnouncement: Effect.Effect<
		typeof announcements.$inferSelect | null,
		DbError
	>;
}
export const AnnouncementService = Context.GenericTag<AnnouncementService>(
	"AnnouncementService",
);

// 3. 實作 Service Layer
export const AnnouncementServiceLive = Layer.succeed(
	AnnouncementService,
	AnnouncementService.of({
		getActiveAnnouncement: Effect.tryPromise({
			try: async () => {
				const result = await db
					.select()
					.from(announcements)
					.where(eq(announcements.isActive, true))
					.limit(1);
				return result[0] || null;
			},
			catch: (error) => new DbError(error),
		}),
	}),
);
