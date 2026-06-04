import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));
const HttpProtocols = new Set(["http:", "https:"]);

function parseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function isHttpUrl(value: string): boolean {
	const url = parseUrl(value);
	if (!url) {
		return false;
	}

	return HttpProtocols.has(url.protocol);
}

function isDiscordInviteUrl(value: string): boolean {
	const url = parseUrl(value);
	if (!url || !HttpProtocols.has(url.protocol)) {
		return false;
	}

	const host = url.hostname.toLowerCase();
	const path = url.pathname.toLowerCase();

	if (host === "discord.gg" || host === "www.discord.gg") {
		return path.length > 1;
	}

	if (
		host === "discord.com" ||
		host === "www.discord.com" ||
		host === "ptb.discord.com" ||
		host === "canary.discord.com"
	) {
		return path.startsWith("/invite/");
	}

	return false;
}

const OptionalHttpUrlSchema = Schema.String.pipe(
	Schema.maxLength(500),
	Schema.filter((value) => {
		const normalized = value.trim();
		if (normalized.length === 0) {
			return true;
		}

		return isHttpUrl(normalized);
	}),
);

const SupportedBannerMimeTypeSchema = Schema.Union(
	Schema.Literal("image/gif"),
	Schema.Literal("image/png"),
	Schema.Literal("image/jpeg"),
	Schema.Literal("image/webp"),
);

const BannerImageDataUrlSchema = Schema.String.pipe(
	Schema.maxLength(20_000_000),
	Schema.pattern(/^data:image\/(?:gif|png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/),
);
const FingerprintSchema = Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/));

export const ServerPublishInputSchema = Schema.Struct({
	serverId: NonEmptyString,
});

export const ServerNameSchema = NonEmptyString.pipe(Schema.maxLength(120));
export const ShortDescriptionSchema = NonEmptyString.pipe(
	Schema.maxLength(200),
);
export const LongDescriptionSchema = NonEmptyString.pipe(
	Schema.maxLength(8000),
);
export const InviteLinkSchema = NonEmptyString.pipe(
	Schema.maxLength(500),
	Schema.filter((value) => isDiscordInviteUrl(value.trim())),
);
export const WebsiteLinkSchema = OptionalHttpUrlSchema;
export const WebhookUrlSchema = OptionalHttpUrlSchema;
export const SecretSchema = Schema.String.pipe(Schema.maxLength(500));
export const RuleSchema = NonEmptyString.pipe(Schema.maxLength(300));
export const TagSchema = NonEmptyString.pipe(Schema.maxLength(24));

export const RulesSchema = Schema.Array(RuleSchema);
export const TagsSchema = Schema.Array(TagSchema);

export const ServerFormSchema = Schema.Struct({
	serverName: ServerNameSchema,
	shortDescription: ShortDescriptionSchema,
	longDescription: LongDescriptionSchema,
	inviteLink: InviteLinkSchema,
	websiteLink: WebsiteLinkSchema,
	rules: RulesSchema,
	tags: TagsSchema,
	secret: SecretSchema,
	webhook_url: WebhookUrlSchema,
	isNsfw: Schema.Boolean,
});

const NullableUrlSchema = Schema.Union(
	Schema.Null,
	Schema.String.pipe(Schema.maxLength(2000)),
);

export const ServerPublishSubmitSchema = Schema.Struct({
	serverId: NonEmptyString,
	iconUrl: NullableUrlSchema,
	bannerUrl: NullableUrlSchema,
	form: ServerFormSchema,
});

export const ServerBannerUploadSchema = Schema.Struct({
	serverId: NonEmptyString,
	fileName: NonEmptyString.pipe(Schema.maxLength(255)),
	mimeType: SupportedBannerMimeTypeSchema,
	dataUrl: BannerImageDataUrlSchema,
	fingerprint: FingerprintSchema,
});

export const ServerBannerUploadResultSchema = Schema.Struct({
	bannerUrl: Schema.String.pipe(Schema.maxLength(2000)),
	fingerprint: FingerprintSchema,
	skipped: Schema.Boolean,
	message: NonEmptyString.pipe(Schema.maxLength(200)),
});
