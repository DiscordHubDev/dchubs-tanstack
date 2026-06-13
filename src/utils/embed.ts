import type { CustomEmbedData } from "#/types/custom_embed";

export function formatCustomEmbedData(
	source: Record<string, any> | null | undefined,
): CustomEmbedData | undefined {
	if (!source) return undefined;

	return {
		username: source.username ?? "",
		avatar_url: source.avatar_url ?? "",
		content: source.content ?? "",
		color: source.color ?? "#5865F2",
		authorName: source.authorName ?? "",
		authorUrl: source.authorUrl ?? "",
		authorIconUrl: source.authorIconUrl ?? "",
		title: source.title ?? "",
		url: source.url ?? "",
		description: source.description ?? "",
		imageUrl: source.imageUrl ?? "",
		thumbnailUrl: source.thumbnailUrl ?? "",
		footerText: source.footerText ?? "",
		footerIconUrl: source.footerIconUrl ?? "",
		// 關鍵點：利用 [...(陣列)] 解構，把 readonly array 轉成一般可變動陣列
		fields: source.fields
			? source.fields.map((f: any) => ({
					name: f.name ?? "",
					value: f.value ?? "",
					inline: f.inline ?? false,
				}))
			: [],
	};
}
