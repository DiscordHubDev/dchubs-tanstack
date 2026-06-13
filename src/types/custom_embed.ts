export type EmbedFieldType = {
	name: string;
	value: string;
	inline: boolean;
};

export type CustomEmbedData = {
	username: string;
	avatar_url: string;
	content: string;
	color: string;
	authorName: string;
	authorUrl: string;
	authorIconUrl: string;
	title: string;
	url: string;
	description: string;
	imageUrl: string;
	thumbnailUrl: string;
	footerText: string;
	footerIconUrl: string;
	fields: EmbedFieldType[];
};
