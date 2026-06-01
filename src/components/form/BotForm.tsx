import { type AnyFieldApi, useForm, useStore } from "@tanstack/react-form";
import { Effect, Schema } from "effect";
import DOMPurify from "isomorphic-dompurify";
import { Info, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ImageUploadFailed, SubmitBotFailed } from "#/errors/bot-errors";
import {
	BotCommandsSchema,
	BotDescriptionSchema,
	BotDevelopersSchema,
	type BotFormData,
	BotFormSchema,
	BotInviteSchema,
	BotLongDescriptionSchema,
	BotNameSchema,
	BotPrefixSchema,
	BotTagsSchema,
} from "#/features/bots/bot-form-schema";
import {
	deleteBotImageFn,
	submitBotFn,
	uploadBotImagesFn,
} from "#/features/bots/bot-submit.functions";
import type {
	SubmitBotErrorPayload,
	SubmitBotResult,
} from "#/features/bots/bot-submit.types";
import { effectValidator } from "#/features/servers/server-publish.validators";
import { toErrorMessage } from "#/lib/effect-utils";
import type { CategoryType, Screenshot } from "#/lib/types";

type BotFormDefaultValues = Partial<BotFormData> & {
	screenshots?: string[];
	banner?: string | null;
};

type BotFormProps = {
	mode?: "create" | "edit";
	defaultValues?: BotFormDefaultValues;
};

type MediaState = {
	screenshots: Screenshot[];
	banner: Screenshot | null;
};

const botCategories: CategoryType[] = [];

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_GIF_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
] as const;

const OptionalStringSchema = Schema.Union(
	Schema.String,
	Schema.Null,
	Schema.Undefined,
);

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

type ValidationResult = {
	validFiles: File[];
	warnings: string[];
};

type UploadAttempt =
	| { status: "empty"; items: Screenshot[]; validCount: number }
	| { status: "success"; items: Screenshot[]; validCount: number };

type UploadResult =
	| UploadAttempt
	| { status: "error"; error: ImageUploadFailed };

type CommandItem = BotFormData["commands"][number];

type DeveloperItem = BotFormData["developers"][number];

function readFirstError(errors: unknown[] | undefined): string | null {
	if (!Array.isArray(errors) || errors.length === 0) {
		return null;
	}

	const first = errors[0];
	if (typeof first === "string") {
		return first;
	}

	if (first instanceof Error) {
		return first.message;
	}

	return String(first);
}

function readPersistedFields(): {
	botDescription: string;
	botLongDescription: string;
} {
	if (typeof window === "undefined") {
		return {
			botDescription: "",
			botLongDescription: "",
		};
	}

	return {
		botDescription: window.localStorage.getItem("desc") ?? "",
		botLongDescription: window.localStorage.getItem("longdesc") ?? "",
	};
}

function buildScreenshotFromUrl(url: string): Screenshot {
	const parts = url.split("/");
	const filename = parts[parts.length - 1] || "";
	const publicId = filename.split(".")[0] || filename;

	return {
		url,
		public_id: publicId,
	};
}

async function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onerror = () => {
			reject(new Error("無法讀取選取的圖片檔案"));
		};

		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("無法解析選取的圖片檔案"));
				return;
			}

			resolve(result);
		};

		reader.readAsDataURL(file);
	});
}

async function ScreenshotUpload(files: File[]): Promise<Screenshot[]> {
	const payload = await Promise.all(
		files.map(async (file) => ({
			fileName: file.name,
			dataUrl: await readFileAsDataUrl(file),
		})),
	);

	const result = await uploadBotImagesFn({
		data: {
			files: payload,
		},
	});

	if (!result.success) {
		throw new Error(result.error.message);
	}

	return result.items;
}

async function deleteCloudinaryImage(publicId: string): Promise<void> {
	const result = await deleteBotImageFn({
		data: { publicId },
	});

	if (!result.success) {
		throw new Error(result.error.message);
	}
}

function validateFiles(
	files: File[],
	remainingSlots: number,
): Effect.Effect<File[], never> {
	return Effect.sync(() => {
		const warnings: string[] = [];
		const validFiles: File[] = [];

		for (const file of files) {
			const mimeType = file.type.toLowerCase() as AllowedImageType;
			if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
				warnings.push("請傳送動圖或者是一般圖片！");
				continue;
			}

			if (mimeType === "image/gif" && file.size > MAX_GIF_SIZE_BYTES) {
				warnings.push(
					`動圖 ${file.name} 大於 ${MAX_GIF_SIZE_BYTES / (1024 * 1024)}MB，請傳送更小的動圖。`,
				);
				continue;
			}

			if (mimeType !== "image/gif" && file.size > MAX_IMAGE_SIZE_BYTES) {
				warnings.push(
					`圖片 ${file.name} 大於 ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB，請傳送更小的圖片。`,
				);
				continue;
			}

			validFiles.push(file);
		}

		return {
			validFiles: validFiles.slice(0, remainingSlots),
			warnings,
		} satisfies ValidationResult;
	}).pipe(
		Effect.tap((result) =>
			Effect.sync(() => {
				for (const warning of result.warnings) {
					toast.warn(warning);
				}
			}),
		),
		Effect.map((result) => result.validFiles),
	);
}

function uploadImages(
	files: File[],
): Effect.Effect<Screenshot[], ImageUploadFailed> {
	return Effect.tryPromise({
		try: () => ScreenshotUpload(files),
		catch: () =>
			new ImageUploadFailed({
				filename: files[0]?.name ?? "unknown",
			}),
	});
}

function deleteImage(publicId: string): Effect.Effect<void, never> {
	return Effect.promise(() => deleteCloudinaryImage(publicId));
}

function getSubmitErrorMessage(error: SubmitBotErrorPayload): string {
	switch (error.tag) {
		case "InvalidInviteUrl":
			return "邀請連結格式不正確，請確認包含 client_id";
		case "BotAlreadyExists":
			return "此機器人已存在，請勿重複提交。";
		case "DiscordRpcFailed":
			return "無法取得 Discord 機器人資訊，請稍後再試。";
		case "NotificationFailed":
			return "已提交，但通知送出失敗。";
		case "SubmitBotFailed":
			return error.message || "提交失敗，請稍後再試。";
		default:
			return error.message || "提交失敗，請稍後再試。";
	}
}

function ClientOnly({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;

	return <>{children}</>;
}

type ScreenshotGridProps = {
	screenshotPreviews: string[];
	removeScreenshot: (index: number) => void;
};

function ScreenshotGrid({
	screenshotPreviews,
	removeScreenshot,
}: ScreenshotGridProps) {
	if (screenshotPreviews.length === 0) {
		return null;
	}

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
			{screenshotPreviews.map((url, index) => (
				<div key={url} className="group relative overflow-hidden rounded-md">
					<img
						src={url}
						alt={`Screenshot ${index + 1}`}
						className="h-32 w-full object-cover"
						loading="lazy"
					/>
					<button
						type="button"
						onClick={() => removeScreenshot(index)}
						className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
					>
						<X size={14} />
					</button>
				</div>
			))}
		</div>
	);
}

type TagFieldProps = {
	field: AnyFieldApi;
	categories?: CategoryType[];
	maxTags?: number;
};

function TagField({ field, categories = [], maxTags = 8 }: TagFieldProps) {
	const [nextTag, setNextTag] = useState("");
	const tags = Array.isArray(field.state.value)
		? (field.state.value as string[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);

	const addTag = (raw: string) => {
		const value = raw.trim();
		if (!value || tags.length >= maxTags) {
			return;
		}

		if (tags.some((item) => item.toLowerCase() === value.toLowerCase())) {
			return;
		}

		field.handleChange([...tags, value]);
		setNextTag("");
	};

	const removeTag = (value: string) => {
		field.handleChange(tags.filter((item) => item !== value));
	};

	return (
		<div className="space-y-3">
			<Label>標籤</Label>

			<div className="flex gap-2">
				<Input
					value={nextTag}
					onBlur={field.handleBlur}
					onChange={(event) => setNextTag(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === ",") {
							event.preventDefault();
							addTag(nextTag);
						}
					}}
					placeholder="輸入標籤後按 Enter"
					disabled={tags.length >= maxTags}
				/>
				<Button
					type="button"
					onClick={() => addTag(nextTag)}
					disabled={!nextTag.trim() || tags.length >= maxTags}
					variant="outline"
				>
					加入
				</Button>
			</div>

			{categories.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{categories.map((category) => (
						<button
							key={category.id}
							type="button"
							onClick={() => addTag(category.name)}
							className="rounded-full px-3 py-1 text-white text-xs"
							style={{ backgroundColor: category.color }}
						>
							{category.name}
						</button>
					))}
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<span
						key={tag}
						className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs"
					>
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							className="rounded-full p-0.5 transition-colors hover:bg-black/10"
						>
							<X className="h-3 w-3" />
						</button>
					</span>
				))}
			</div>

			<p className="text-gray-400 text-xs">最多 {maxTags} 個標籤</p>

			{errorMessage ? (
				<p className="text-[#ed4245] text-sm">{errorMessage}</p>
			) : null}
		</div>
	);
}

type CommandListFieldProps = {
	field: AnyFieldApi;
};

function CommandListField({ field }: CommandListFieldProps) {
	const commands = Array.isArray(field.state.value)
		? (field.state.value as CommandItem[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);
	const keyCounterRef = useRef(0);
	const commandKeysRef = useRef<string[]>([]);

	const buildKey = () => {
		keyCounterRef.current += 1;
		return `command-${keyCounterRef.current}`;
	};

	while (commandKeysRef.current.length < commands.length) {
		commandKeysRef.current.push(buildKey());
	}
	if (commandKeysRef.current.length > commands.length) {
		commandKeysRef.current.length = commands.length;
	}
	const commandKeys = commandKeysRef.current;

	const addCommand = () => {
		field.handleChange([
			...commands,
			{ name: "", description: "", usage: "", category: "" },
		]);
	};

	const updateCommand = (index: number, patch: Partial<CommandItem>) => {
		field.handleChange(
			commands.map((command, currentIndex) =>
				currentIndex === index ? { ...command, ...patch } : command,
			),
		);
	};

	const removeCommand = (index: number) => {
		const nextCommands = commands.filter(
			(_, currentIndex) => currentIndex !== index,
		);
		commandKeysRef.current = commandKeysRef.current.filter(
			(_, currentIndex) => currentIndex !== index,
		);
		field.handleChange(nextCommands);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>指令列表</Label>
				<Button
					type="button"
					onClick={addCommand}
					size="sm"
					className="bg-discord text-white hover:bg-discord-hover"
				>
					<Plus className="h-4 w-4" />
					新增指令
				</Button>
			</div>

			{commands.length === 0 ? (
				<p className="rounded-md border border-white/10 border-dashed px-3 py-3 text-[#b9bbbe] text-sm">
					尚未新增任何指令。
				</p>
			) : (
				<div className="space-y-4">
					{commands.map((command, index) => (
						<div
							key={commandKeys[index]}
							className="space-y-3 rounded-lg border border-white/10 p-4"
						>
							<div className="flex items-center justify-between">
								<p className="font-semibold text-sm text-white">
									指令 {index + 1}
								</p>
								<Button
									type="button"
									onClick={() => removeCommand(index)}
									className="bg-red-600 text-white hover:bg-red-700"
									size="icon"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								<div className="space-y-2">
									<Label>指令名稱</Label>
									<Input
										value={command.name}
										onBlur={field.handleBlur}
										onChange={(event) =>
											updateCommand(index, {
												name: event.target.value,
											})
										}
										placeholder="例如：help"
									/>
								</div>
								<div className="space-y-2">
									<Label>分類</Label>
									<Input
										value={command.category ?? ""}
										onBlur={field.handleBlur}
										onChange={(event) =>
											updateCommand(index, {
												category: event.target.value,
											})
										}
										placeholder="例如：管理"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label>指令描述</Label>
								<Textarea
									value={command.description}
									onBlur={field.handleBlur}
									onChange={(event) =>
										updateCommand(index, {
											description: event.target.value,
										})
									}
									placeholder="描述指令用途"
									rows={2}
								/>
							</div>

							<div className="space-y-2">
								<Label>用法</Label>
								<Input
									value={command.usage}
									onBlur={field.handleBlur}
									onChange={(event) =>
										updateCommand(index, {
											usage: event.target.value,
										})
									}
									placeholder="例如：/help"
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{errorMessage ? (
				<p className="text-[#ed4245] text-sm">{errorMessage}</p>
			) : null}
		</div>
	);
}

type DeveloperListFieldProps = {
	field: AnyFieldApi;
};

function DeveloperListField({ field }: DeveloperListFieldProps) {
	const developers = Array.isArray(field.state.value)
		? (field.state.value as DeveloperItem[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);
	const keyCounterRef = useRef(0);
	const developerKeysRef = useRef<string[]>([]);

	const buildKey = () => {
		keyCounterRef.current += 1;
		return `developer-${keyCounterRef.current}`;
	};

	while (developerKeysRef.current.length < developers.length) {
		developerKeysRef.current.push(buildKey());
	}
	if (developerKeysRef.current.length > developers.length) {
		developerKeysRef.current.length = developers.length;
	}
	const developerKeys = developerKeysRef.current;

	const addDeveloper = () => {
		field.handleChange([...developers, { name: "" }]);
	};

	const updateDeveloper = (index: number, name: string) => {
		field.handleChange(
			developers.map((developer, currentIndex) =>
				currentIndex === index ? { ...developer, name } : developer,
			),
		);
	};

	const removeDeveloper = (index: number) => {
		const nextDevelopers = developers.filter(
			(_, currentIndex) => currentIndex !== index,
		);
		developerKeysRef.current = developerKeysRef.current.filter(
			(_, currentIndex) => currentIndex !== index,
		);
		field.handleChange(nextDevelopers);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>開發者列表</Label>
				<Button
					type="button"
					onClick={addDeveloper}
					size="sm"
					className="bg-discord text-white hover:bg-discord-hover"
				>
					<Plus className="h-4 w-4" />
					新增開發者
				</Button>
			</div>

			{developers.length === 0 ? (
				<p className="rounded-md border border-white/10 border-dashed px-3 py-3 text-[#b9bbbe] text-sm">
					尚未新增任何開發者。
				</p>
			) : (
				<div className="space-y-3">
					{developers.map((developer, index) => (
						<div key={developerKeys[index]} className="flex items-center gap-2">
							<Input
								value={developer.name}
								onBlur={field.handleBlur}
								onChange={(event) => updateDeveloper(index, event.target.value)}
								placeholder="輸入 Discord 使用者名稱或 ID"
							/>
							<Button
								type="button"
								onClick={() => removeDeveloper(index)}
								className="bg-red-600 text-white hover:bg-red-700"
								size="icon"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{errorMessage ? (
				<p className="text-[#ed4245] text-sm">{errorMessage}</p>
			) : null}
		</div>
	);
}

export default function BotForm({
	mode = "create",
	defaultValues,
}: BotFormProps) {
	const persisted = useMemo(() => readPersistedFields(), []);

	const form = useForm({
		defaultValues: {
			botName: "",
			botPrefix: "",
			botDescription: persisted.botDescription,
			botLongDescription: persisted.botLongDescription,
			botInvite: "",
			botWebsite: "",
			botSupport: "",
			developers: [],
			commands: [],
			tags: [],
			secret: "",
			webhook_url: "",
			...(defaultValues || {}),
		},
		validators: {
			onChange: ({ value }) => {
				try {
					Schema.decodeUnknownSync(BotFormSchema)(value);
				} catch (error) {
					return toErrorMessage(error);
				}
			},
		},
		onSubmit: async ({ value }) => {
			setLoading(true);
			setSuccess(false);

			const payload = {
				form: value,
				screenshots: media.screenshots,
				banner: media.banner?.url ?? null,
				mode,
			};

			const response = await Effect.runPromise(
				Effect.tryPromise({
					try: () => submitBotFn({ data: payload }),
					catch: (error) =>
						new SubmitBotFailed({
							message: `提交失敗：${toErrorMessage(error)}`,
						}),
				}).pipe(
					Effect.catchAll((error) =>
						Effect.succeed({
							success: false as const,
							error: {
								tag: error._tag,
								message: error.message,
							},
						} satisfies SubmitBotResult),
					),
				),
			);

			if (!response.success) {
				toast.error(getSubmitErrorMessage(response.error));
				setLoading(false);
				return;
			}

			setSuccess(true);
			window.localStorage.removeItem("desc");
			window.localStorage.removeItem("longdesc");

			if (mode === "create") {
				form.reset();
				setMedia({ screenshots: [], banner: null });
			}

			if (mode === "edit") {
				toast.success("編輯成功");
			}

			setLoading(false);
		},
	});

	const [media, setMedia] = useState<MediaState>({
		screenshots: [],
		banner: null,
	});
	const [uploading, setUploading] = useState(false);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const previewRef = useRef<HTMLDivElement | null>(null);
	const persistedRef = useRef(persisted);

	const longDescription = useStore(
		form.store,
		(state) => state.values.botLongDescription,
	);

	useEffect(() => {
		persistedRef.current = persisted;
	}, [persisted]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const lastValues = {
			botDescription: persistedRef.current.botDescription,
			botLongDescription: persistedRef.current.botLongDescription,
		};

		const subscription = form.store.subscribe((state) => {
			const botDescription = state.values.botDescription ?? "";
			const botLongDescription = state.values.botLongDescription ?? "";

			if (botDescription !== lastValues.botDescription) {
				window.localStorage.setItem("desc", botDescription);
				lastValues.botDescription = botDescription;
			}

			if (botLongDescription !== lastValues.botLongDescription) {
				window.localStorage.setItem("longdesc", botLongDescription);
				lastValues.botLongDescription = botLongDescription;
			}
		});

		return () => subscription.unsubscribe();
	}, [form.store]);

	useEffect(() => {
		const screenshots = defaultValues?.screenshots;
		if (Array.isArray(screenshots) && screenshots.length > 0) {
			setMedia((previous) => ({
				...previous,
				screenshots: screenshots.map((url) => buildScreenshotFromUrl(url)),
			}));
		}

		const banner = defaultValues?.banner;
		if (typeof banner === "string" && banner.length > 0) {
			setMedia((previous) => ({
				...previous,
				banner: buildScreenshotFromUrl(banner),
			}));
		}
	}, [defaultValues?.screenshots, defaultValues?.banner]);

	const validateBotName = useMemo(
		() =>
			effectValidator(BotNameSchema, {
				label: "機器人名稱",
				required: "機器人名稱不可為空",
				maxLength: { value: 50, message: "機器人名稱最多 50 字" },
			}),
		[],
	);
	const validateBotPrefix = useMemo(
		() =>
			effectValidator(BotPrefixSchema, {
				label: "機器人前綴",
				required: "機器人前綴不可為空",
				maxLength: { value: 10, message: "機器人前綴最多 10 字" },
			}),
		[],
	);
	const validateBotDescription = useMemo(
		() =>
			effectValidator(BotDescriptionSchema, {
				label: "簡短描述",
				required: "請填寫簡短描述",
				minLength: { value: 10, message: "簡短描述至少 10 字" },
				maxLength: { value: 200, message: "簡短描述最多 200 字" },
			}),
		[],
	);
	const validateBotLongDescription = useMemo(
		() =>
			effectValidator(BotLongDescriptionSchema, {
				label: "詳細描述",
				required: "請填寫詳細描述",
			}),
		[],
	);
	const validateBotInvite = useMemo(
		() =>
			effectValidator(BotInviteSchema, {
				label: "機器人邀請連結",
				required: "請填寫機器人邀請連結",
				fallback: "請輸入有效的機器人邀請連結",
			}),
		[],
	);
	const validateBotWebsite = useMemo(
		() =>
			effectValidator(OptionalStringSchema, {
				label: "網站連結",
				fallback: "網站連結格式不正確",
			}),
		[],
	);
	const validateBotSupport = useMemo(
		() =>
			effectValidator(OptionalStringSchema, {
				label: "支援伺服器連結",
				fallback: "支援伺服器連結格式不正確",
			}),
		[],
	);
	const validateTags = useMemo(
		() =>
			effectValidator(BotTagsSchema, {
				fallback: "標籤格式不正確",
			}),
		[],
	);
	const validateDevelopers = useMemo(
		() =>
			effectValidator(BotDevelopersSchema, {
				fallback: "開發者格式不正確",
			}),
		[],
	);
	const validateCommands = useMemo(
		() =>
			effectValidator(BotCommandsSchema, {
				fallback: "指令格式不正確",
			}),
		[],
	);
	const validateSecret = useMemo(
		() =>
			effectValidator(OptionalStringSchema, {
				label: "Secret",
				fallback: "Secret 格式不正確",
			}),
		[],
	);
	const validateWebhookUrl = useMemo(
		() =>
			effectValidator(OptionalStringSchema, {
				label: "Webhook URL",
				fallback: "Webhook URL 格式不正確",
			}),
		[],
	);

	const handleScroll = () => {
		const textarea = textareaRef.current;
		const preview = previewRef.current;

		if (textarea && preview) {
			const scrollRatio =
				textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
			const previewScrollTop =
				scrollRatio * (preview.scrollHeight - preview.clientHeight);
			preview.scrollTop = previewScrollTop;
		}
	};

	const handleMediaUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
		kind: "screenshots" | "banner",
	) => {
		const files = event.target.files ? Array.from(event.target.files) : [];
		event.target.value = "";
		if (files.length === 0) return;

		const remainingSlots =
			kind === "banner"
				? media.banner
					? 0
					: 1
				: Math.max(0, 5 - media.screenshots.length);

		if (remainingSlots <= 0) {
			return;
		}

		setUploading(true);

		const uploadAttemptEffect = Effect.gen(function* () {
			const validFiles = yield* validateFiles(files, remainingSlots);
			if (validFiles.length === 0) {
				return {
					status: "empty" as const,
					items: [] as Screenshot[],
					validCount: 0,
				};
			}

			const items = yield* uploadImages(validFiles);
			return {
				status: "success" as const,
				items,
				validCount: validFiles.length,
			};
		});
		const uploadEffect: Effect.Effect<UploadResult, never> =
			uploadAttemptEffect.pipe(
				Effect.catchAll((error) =>
					Effect.succeed({
						status: "error" as const,
						error,
					}),
				),
			);

		const result = await Effect.runPromise(uploadEffect);

		if (result.status === "error") {
			const message =
				result.error instanceof ImageUploadFailed
					? `圖片 ${result.error.filename} 上傳失敗`
					: "上傳失敗";
			toast.error(message);
			setUploading(false);
			return;
		}

		if (result.status === "success" && result.items.length > 0) {
			if (kind === "banner") {
				setMedia((previous) => ({
					...previous,
					banner: result.items[0] ?? null,
				}));
			} else {
				setMedia((previous) => ({
					...previous,
					screenshots: [...previous.screenshots, ...result.items],
				}));
			}

			if (result.items.length < result.validCount) {
				toast.warning(
					`只上傳了 ${result.items.length} 個檔案，其他可能是格式不符或上傳失敗。`,
				);
			} else {
				toast.success("上傳成功！");
			}
		}

		setUploading(false);
	};

	const removeScreenshot = (index: number) => {
		const toDelete = media.screenshots[index];
		setMedia((previous) => ({
			...previous,
			screenshots: previous.screenshots.filter(
				(_, current) => current !== index,
			),
		}));
		if (!toDelete) return;

		void Effect.runPromise(
			deleteImage(toDelete.public_id).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
		);
	};

	const removeBanner = () => {
		const toDelete = media.banner;
		setMedia((previous) => ({ ...previous, banner: null }));
		if (!toDelete) return;

		void Effect.runPromise(
			deleteImage(toDelete.public_id).pipe(
				Effect.catchAll(() => Effect.succeed(undefined)),
			),
		);
	};

	const sanitizedMarkdown = useMemo(
		() => DOMPurify.sanitize(longDescription || "詳細描述預覽 (支援Markdown)"),
		[longDescription],
	);

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			<div className="mx-auto max-w-4xl px-4 py-8">
				<div className="rounded-lg bg-[#2b2d31] p-6 shadow-lg">
					<h1 className="mb-6 font-bold text-2xl">
						{mode === "edit" ? "編輯" : "新增"}您的 Discord 機器人
					</h1>

					<form
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								event.target instanceof HTMLInputElement
							) {
								event.preventDefault();
							}
						}}
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							void form.handleSubmit();
						}}
						className="space-y-6"
					>
						<div className="space-y-4">
							<h2 className="font-semibold text-xl">基本資訊</h2>

							<form.Field
								name="botName"
								validators={{ onChange: ({ value }) => validateBotName(value) }}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
									return (
										<div className="space-y-2">
											<Label htmlFor="botName">機器人名稱 *</Label>
											<Input
												id="botName"
												value={field.state.value ?? ""}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder="輸入您的機器人名稱"
											/>
											{errorMessage ? (
												<p className="text-[#ed4245] text-sm">{errorMessage}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<form.Field
								name="botPrefix"
								validators={{
									onChange: ({ value }) => validateBotPrefix(value),
								}}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
									return (
										<div className="space-y-2">
											<Label htmlFor="botPrefix">機器人前綴 *</Label>
											<Input
												id="botPrefix"
												value={field.state.value ?? ""}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder="例如：! 或 /"
											/>
											{errorMessage ? (
												<p className="text-[#ed4245] text-sm">{errorMessage}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<form.Field
								name="botDescription"
								validators={{
									onChange: ({ value }) => validateBotDescription(value),
								}}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
									return (
										<div className="space-y-2">
											<Label htmlFor="botDescription">簡短描述 *</Label>
											<Textarea
												id="botDescription"
												value={field.state.value ?? ""}
												maxLength={200}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder="簡短描述您的機器人功能（最多 200 字）"
											/>
											{errorMessage ? (
												<p className="text-[#ed4245] text-sm">{errorMessage}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<form.Field
								name="botLongDescription"
								validators={{
									onChange: ({ value }) => validateBotLongDescription(value),
								}}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
									return (
										<div className="space-y-2">
											<Label htmlFor="botLongDescription">詳細描述 *</Label>
											<Textarea
												id="botLongDescription"
												value={field.state.value ?? ""}
												rows={10}
												placeholder="請輸入詳細描述 (支援Markdown)"
												ref={(el) => {
													textareaRef.current = el;
												}}
												onScroll={handleScroll}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												onBlur={field.handleBlur}
											/>
											{errorMessage ? (
												<p className="text-[#ed4245] text-sm">{errorMessage}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<div
								ref={previewRef}
								className="mt-4 h-62.5 overflow-auto rounded-md border border-gray-700 bg-[#1e1f22] p-4"
							>
								<ClientOnly>
									<MarkdownRenderer content={sanitizedMarkdown} />
								</ClientOnly>
							</div>

							<form.Field
								name="botInvite"
								validators={{
									onChange: ({ value }) => validateBotInvite(value),
								}}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
									return (
										<div className="space-y-2">
											<Label htmlFor="botInvite">機器人邀請連結 *</Label>
											<Input
												id="botInvite"
												value={field.state.value ?? ""}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder="例如：https://discord.com/oauth2/authorize?client_id=..."
											/>
											{errorMessage ? (
												<p className="text-[#ed4245] text-sm">{errorMessage}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field
									name="botWebsite"
									validators={{
										onChange: ({ value }) => validateBotWebsite(value),
									}}
								>
									{(field) => {
										const errorMessage = readFirstError(
											field.state.meta.errors,
										);
										return (
											<div className="space-y-2">
												<Label htmlFor="botWebsite">網站連結</Label>
												<Input
													id="botWebsite"
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="例如：https://example.com"
												/>
												{errorMessage ? (
													<p className="text-[#ed4245] text-sm">
														{errorMessage}
													</p>
												) : null}
											</div>
										);
									}}
								</form.Field>

								<form.Field
									name="botSupport"
									validators={{
										onChange: ({ value }) => validateBotSupport(value),
									}}
								>
									{(field) => {
										const errorMessage = readFirstError(
											field.state.meta.errors,
										);
										return (
											<div className="space-y-2">
												<Label htmlFor="botSupport">支援伺服器連結</Label>
												<Input
													id="botSupport"
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="例如：https://discord.gg/example"
												/>
												{errorMessage ? (
													<p className="text-[#ed4245] text-sm">
														{errorMessage}
													</p>
												) : null}
											</div>
										);
									}}
								</form.Field>
							</div>

							<form.Field
								name="developers"
								validators={{
									onChange: ({ value }) => validateDevelopers(value),
								}}
							>
								{(field) => <DeveloperListField field={field} />}
							</form.Field>

							<form.Field
								name="tags"
								validators={{ onChange: ({ value }) => validateTags(value) }}
							>
								{(field) => (
									<TagField field={field} categories={botCategories} />
								)}
							</form.Field>

							<form.Field
								name="commands"
								validators={{
									onChange: ({ value }) => validateCommands(value),
								}}
							>
								{(field) => <CommandListField field={field} />}
							</form.Field>

							<div className="space-y-4">
								<h2 className="font-semibold text-xl">投票通知</h2>

								<form.Field
									name="secret"
									validators={{
										onChange: ({ value }) => validateSecret(value),
									}}
								>
									{(field) => {
										const errorMessage = readFirstError(
											field.state.meta.errors,
										);
										return (
											<div className="space-y-2">
												<Label htmlFor="secret">
													Secret（觸發投票時，Secret會加到 Auth
													Header，用來驗證請求是從這裡送出）
												</Label>
												<Input
													id="secret"
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="輸入 Secret"
												/>
												{errorMessage ? (
													<p className="text-[#ed4245] text-sm">
														{errorMessage}
													</p>
												) : null}
											</div>
										);
									}}
								</form.Field>

								<form.Field
									name="webhook_url"
									validators={{
										onChange: ({ value }) => validateWebhookUrl(value),
									}}
								>
									{(field) => {
										const errorMessage = readFirstError(
											field.state.meta.errors,
										);
										return (
											<div className="space-y-2">
												<Label htmlFor="webhook_url">
													Webhook URL（輸入 Discord Webhook
													時會送出美化的投票通知 Embed，自訂 Web Server
													則會接收到 JSON 格式的資料）
												</Label>
												<Input
													id="webhook_url"
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													placeholder="https://your-webhook.url"
												/>
												{errorMessage ? (
													<p className="text-[#ed4245] text-sm">
														{errorMessage}
													</p>
												) : null}
											</div>
										);
									}}
								</form.Field>
							</div>

							<div className="space-y-4">
								<h2 className="font-semibold text-xl">圖片上傳</h2>

								<div className="mt-4 space-y-5">
									<Label htmlFor="bot-banner">機器人橫幅</Label>
									<div className="flex flex-col gap-3">
										<ScreenshotGrid
											screenshotPreviews={
												media.banner ? [media.banner.url] : []
											}
											removeScreenshot={removeBanner}
										/>
										{!media.banner && (
											<div className="flex h-32 items-center justify-center rounded border border-[#4f545c] border-dashed bg-[#36393f]">
												<Input
													id="bot-banner"
													type="file"
													accept="image/*"
													className="hidden"
													onChange={(event) =>
														handleMediaUpload(event, "banner")
													}
												/>
												<Label
													htmlFor="bot-banner"
													className="flex cursor-pointer flex-col items-center text-gray-400 hover:text-white"
												>
													{uploading ? (
														<div className="flex flex-col items-center">
															<div className="h-6 w-6 animate-spin rounded-full border-white border-b-2" />
															<span className="mt-2 text-sm">上傳中...</span>
														</div>
													) : (
														<>
															<Upload size={24} />
															<span className="mt-2 text-sm">上傳橫幅</span>
														</>
													)}
												</Label>
											</div>
										)}
										<p className="text-gray-400 text-xs">
											上傳您機器人的自訂橫幅 (如不設置將以機器人橫幅代替)
										</p>
									</div>
								</div>

								<div className="mt-4 space-y-5">
									<Label htmlFor="bot-screenshots">
										機器人截圖（最多 5 張）
									</Label>
									<div className="flex flex-col gap-3">
										<ScreenshotGrid
											screenshotPreviews={media.screenshots.map(
												(item) => item.url,
											)}
											removeScreenshot={removeScreenshot}
										/>
										{media.screenshots.length < 5 && (
											<div className="flex h-32 items-center justify-center rounded border border-[#4f545c] border-dashed bg-[#36393f]">
												<Input
													id="bot-screenshots"
													type="file"
													accept="image/*"
													multiple
													className="hidden"
													onChange={(event) =>
														handleMediaUpload(event, "screenshots")
													}
												/>
												<Label
													htmlFor="bot-screenshots"
													className="flex cursor-pointer flex-col items-center text-gray-400 hover:text-white"
												>
													{uploading ? (
														<div className="flex flex-col items-center">
															<div className="h-6 w-6 animate-spin rounded-full border-white border-b-2" />
															<span className="mt-2 text-sm">上傳中...</span>
														</div>
													) : (
														<>
															<Upload size={24} />
															<span className="mt-2 text-sm">上傳截圖</span>
														</>
													)}
												</Label>
											</div>
										)}
										<p className="text-gray-400 text-xs">
											上傳您機器人的截圖，展示機器人的功能和使用場景
										</p>
									</div>
								</div>
							</div>

							<div className="flex items-center justify-between border-[#1e1f22] border-t pt-4">
								<div className="flex items-center justify-between border-[#1e1f22] border-t pt-4">
									<div className="flex items-start gap-2">
										<Info size={16} className="mt-0.5 text-[#5865f2]" />
										<p className="text-gray-400 text-sm">
											{mode === "edit"
												? "保存後，變更可能需要一段時間才會套用。"
												: "提交後，我們將審核您的機器人。審核通常需要 1-2 個工作日。"}
										</p>
									</div>
								</div>
								<Button
									type="submit"
									disabled={loading}
									className="discord relative flex cursor-pointer items-center justify-center rounded px-4 py-2 text-white disabled:opacity-50"
								>
									{loading && (
										<svg
											className="mr-2 h-5 w-5 animate-spin text-white"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											aria-hidden="true" /* ✨ 加上這行，就能解決 biomelint/a11y 錯誤 */
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
											/>
										</svg>
									)}
									{loading
										? mode === "edit"
											? "儲存中..."
											: "提交中..."
										: mode === "edit"
											? "保存變更"
											: "提交機器人"}
								</Button>
							</div>
						</div>
					</form>

					{success && (
						<div className="mt-4 rounded border border-green-500 bg-green-100/10 p-3 text-green-500 text-sm">
							{mode === "create"
								? "✅ 機器人已成功提交，請等待審核人員審核，審核結果將會在網站的收件匣和官方群組的通知中出現。"
								: "✅ 機器人已成功保存！"}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
