import type { SOCIAL_PLATFORMS } from "#/lib/socal";

export type SocialData = Partial<
	Record<keyof typeof SOCIAL_PLATFORMS, string | null>
>;
