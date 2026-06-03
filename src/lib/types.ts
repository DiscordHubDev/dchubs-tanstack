export type UserProfile = {
	username: string;
	global_name: string;
	avatar_url: string;
	banner_url: string | null;
	accent_color: string | null;
	updatedAt: string; // ISO
};

export interface CategoryType {
	id: string;
	name: string;
	color: string;
}

export type UploadedFile = {
	url: string;
	public_id: string;
	format: string;
	type: "image" | "video" | "raw";
	original_filename: string;
};

export type Screenshot = {
	url: string;
	public_id: string;
};

export type Mail = {
	id: string;
	name: string;
	createdAt: string;
	subject: string;
	content: string;
	teaser: string;
	userId?: bigint | null;
	priority: EmailPriority;
	isSystem: boolean;
	read: boolean;
};

export type EmailPriority = "success" | "info" | "warning" | "danger";

// types/discord.ts

export type BotInfo = {
	username: string;
	global_name: string;
	avatar_url: string;
	banner_url: string;
	accent_color: string;
};
