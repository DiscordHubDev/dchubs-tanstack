import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Schema } from "effect";
import { AlertTriangle } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import DiscordEmbedPreview from "#/components/DiscordEmbedPreview";
import EmbedFieldsListField from "#/components/EmbedFieldsListField";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import { OptimizedImage } from "#/components/OptimizedImage";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ServerCategories } from "#/lib/categories";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import type { CustomEmbedData } from "#/types/custom_embed";
import {
	uploadServerBannerFn,
	upsertServerPublishFn,
} from "../server-publish.functions";
import {
	InviteLinkSchema,
	LongDescriptionSchema,
	RuleSchema,
	RulesSchema,
	SecretSchema,
	ServerFormSchema,
	ServerNameSchema,
	ShortDescriptionSchema,
	TagSchema,
	TagsSchema,
	WebhookUrlSchema,
	WebsiteLinkSchema,
} from "../server-publish.schemas";
import type {
	ServerPublishBundle,
	ServerPublishFormValues,
	ServerPublishSubmitInput,
} from "../server-publish.types";
import { effectValidator } from "../server-publish.validators";
import { RulesField } from "./RulesField";
import { ServerTagField } from "./ServerTagField";

function readFirstError(errors: unknown[] | undefined): string | null {
	if (!Array.isArray(errors) || errors.length === 0) return null;
	const first = errors[0];
	if (typeof first === "string") return first;
	if (first instanceof Error) return first.message;
	return String(first);
}

function normalizeExternalUrl(value: string): string | null {
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

const SUPPORTED_BANNER_FILE_TYPES = [
	"image/gif",
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;
const SUPPORTED_BANNER_EXTENSIONS = [".gif", ".png", ".jpg", ".jpeg", ".webp"];
const SUPPORTED_BANNER_FILE_ACCEPT = [
	...SUPPORTED_BANNER_FILE_TYPES,
	...SUPPORTED_BANNER_EXTENSIONS,
].join(",");
const MAX_BANNER_IMAGE_BYTES = 10 * 1024 * 1024;

type SupportedBannerMimeType = (typeof SUPPORTED_BANNER_FILE_TYPES)[number];

function resolveSupportedBannerMimeType(
	file: File,
): SupportedBannerMimeType | null {
	const mimeType = file.type.toLowerCase();
	if (
		SUPPORTED_BANNER_FILE_TYPES.includes(mimeType as SupportedBannerMimeType)
	) {
		return mimeType as SupportedBannerMimeType;
	}
	const fileName = file.name.toLowerCase();
	if (fileName.endsWith(".gif")) return "image/gif";
	if (fileName.endsWith(".png")) return "image/png";
	if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg"))
		return "image/jpeg";
	if (fileName.endsWith(".webp")) return "image/webp";
	return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("無法讀取選取的圖片檔案"));
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

async function buildFileFingerprint(file: File): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error("目前瀏覽器不支援檔案雜湊，請更新後重試");
	const buffer = await file.arrayBuffer();
	const digest = await subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(digest), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "儲存時發生未預期錯誤";
}

function hasRequiredPublishFields(values: {
	shortDescription: string;
	longDescription: string;
	inviteLink: string;
	tags: readonly string[];
}): boolean {
	return (
		values.shortDescription.trim().length > 0 &&
		values.longDescription.trim().length > 0 &&
		values.inviteLink.trim().length > 0 &&
		Array.isArray(values.tags) &&
		values.tags.length > 0
	);
}

export type ServerPublishPageProps = {
	serverId: string;
	mode: "edit" | "create";
	bundle: ServerPublishBundle; // ✨ 新增這行
};

export function ServerPublishPage({
	serverId,
	mode,
	bundle,
}: ServerPublishPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [iconPreviewUrl, setIconPreviewUrl] = useState(bundle.iconUrl ?? "");
	const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string>(
		bundle.bannerUrl ?? "",
	);
	const [bannerFingerprint, setBannerFingerprint] = useState<string | null>(
		null,
	);
	const [bannerUploadStatus, setBannerUploadStatus] = useState<string | null>(
		null,
	);
	const [bannerUploadError, setBannerUploadError] = useState<string | null>(
		null,
	);
	const [isIconUploading] = useState(false);

	const [bannerFile, setBannerFile] = useState<File | null>(null);
	const [localPreviewUrl] = useState<string | null>(null);

	// 定義 localStorage 的鍵值，確保不同伺服器的草稿不會互相污染
	const DRAFT_KEY = `server-publish-draft-${serverId}`;

	useEffect(() => {
		return () => {
			if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
		};
	}, [localPreviewUrl]);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const previewRef = useRef<HTMLDivElement | null>(null);
	const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		setIconPreviewUrl(bundle.iconUrl ?? "");
		setBannerPreviewUrl(bundle.bannerUrl ?? "");
		setBannerFingerprint(null);
		setBannerUploadStatus(null);
		setBannerUploadError(null);
	}, [bundle.iconUrl, bundle.bannerUrl]);

	const validateServerName = useMemo(
		() =>
			effectValidator(ServerNameSchema, {
				label: "伺服器名稱",
				required: "伺服器名稱不可為空",
				maxLength: { value: 120, message: "伺服器名稱最多 120 字" },
			}),
		[],
	);
	const validateShortDescription = useMemo(
		() =>
			effectValidator(ShortDescriptionSchema, {
				label: "簡短描述",
				required: "請填寫簡短描述",
				maxLength: { value: 200, message: "簡短描述最多 200 字" },
			}),
		[],
	);
	const validateLongDescription = useMemo(
		() =>
			effectValidator(LongDescriptionSchema, {
				label: "詳細介紹",
				required: "請填寫詳細介紹",
				maxLength: { value: 8000, message: "詳細介紹最多 8000 字" },
			}),
		[],
	);
	const validateInviteLink = useMemo(
		() =>
			effectValidator(InviteLinkSchema, {
				label: "Discord 邀請連結",
				required: "請填寫 Discord 邀請連結",
				maxLength: { value: 500, message: "Discord 邀請連結最多 500 字" },
				fallback:
					"請輸入有效的 Discord 邀請連結（例如 https://discord.gg/your-server）",
			}),
		[],
	);
	const validateWebsiteLink = useMemo(
		() =>
			effectValidator(WebsiteLinkSchema, {
				label: "網站連結",
				maxLength: { value: 500, message: "網站連結最多 500 字" },
				fallback: "網站連結格式不正確，請使用 http:// 或 https:// 開頭",
			}),
		[],
	);
	const validateRules = useMemo(
		() => effectValidator(RulesSchema, { fallback: "規則內容格式不正確" }),
		[],
	);
	const validateRule = useMemo(
		() =>
			effectValidator(RuleSchema, {
				label: "規則",
				required: "規則不可為空",
				maxLength: { value: 300, message: "單條規則最多 300 字" },
			}),
		[],
	);
	const validateisNsfw = useMemo(
		() =>
			effectValidator(Schema.Boolean, {
				label: "NSFW",
				required: "請選擇是否為 NSFW 伺服器",
			}),
		[],
	);
	const validateTags = useMemo(
		() => effectValidator(TagsSchema, { fallback: "標籤格式不正確" }),
		[],
	);
	const validateTag = useMemo(
		() =>
			effectValidator(TagSchema, {
				label: "標籤",
				required: "標籤不可為空",
				maxLength: { value: 24, message: "單一標籤最多 24 字" },
			}),
		[],
	);
	const validateSecret = useMemo(
		() =>
			effectValidator(SecretSchema, {
				label: "secret",
				maxLength: { value: 500, message: "secret 最多 500 字" },
			}),
		[],
	);
	const validateWebhookUrl = useMemo(
		() =>
			effectValidator(WebhookUrlSchema, {
				label: "webhook_url",
				maxLength: { value: 500, message: "webhook_url 最多 500 字" },
				fallback: "Webhook 網址格式不正確，請使用 http:// 或 https:// 開頭",
			}),
		[],
	);
	const validateForm = useMemo(
		() =>
			effectValidator(ServerFormSchema, {
				fallback: "表單內容有誤，請檢查欄位後再送出",
			}),
		[],
	);

	const saveMutation = useMutation({
		mutationFn: (payload: ServerPublishSubmitInput) =>
			runEffect(
				tryEffectPromise("Failed to save server publish data", () =>
					upsertServerPublishFn({ data: payload }),
				),
			),
		onSuccess: async (result, payload) => {
			queryClient.setQueryData(
				queryKeys.servers.detail(serverId),
				(oldData: any) => {
					if (!oldData) return oldData;
					return {
						...oldData,
						name: payload.form.serverName,
						description: payload.form.shortDescription,
						longDescription: payload.form.longDescription,
						inviteUrl: payload.form.inviteLink,
						website: payload.form.websiteLink,
						rules: payload.form.rules,
						tags: payload.form.tags,
						secret: payload.form.secret,
						voteNotificationUrl: payload.form.webhook_url,
						nsfw: payload.form.nsfw,
						customEmbed: payload.form.customEmbed,
					};
				},
			);
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: queryKeys.servers.publish(serverId),
				}),
				queryClient.invalidateQueries({
					queryKey: queryKeys.servers.detail(serverId),
				}),
			]);

			await Swal.fire({
				icon: "success",
				title: "儲存成功",
				text: result.message,
				confirmButtonText: "前往伺服器頁面",
			});

			void navigate({ to: "/servers/$serverId", params: { serverId } });
		},
		onError: (error) => {
			showErrorAlert(getErrorMessage(error), "儲存失敗");
		},
	});

	const bannerUploadMutation = useMutation({
		mutationFn: async (file: File) => {
			const mimeType = resolveSupportedBannerMimeType(file);
			if (!mimeType)
				throw new Error("請選擇 GIF、PNG、JPG、JPEG 或 WEBP 圖片檔案");
			if (file.size <= 0) throw new Error("選擇的檔案內容為空，請重新選擇");
			if (file.size > MAX_BANNER_IMAGE_BYTES)
				throw new Error("圖片檔案大小不可超過 10MB");

			const fingerprint = await buildFileFingerprint(file);

			if (
				bannerFingerprint === fingerprint &&
				bannerPreviewUrl.trim().length > 0
			) {
				return {
					bannerUrl: bannerPreviewUrl,
					fingerprint,
					skipped: true,
					message: "選擇的圖片與目前 Banner 相同，已略過上傳",
				};
			}

			const dataUrl = await readFileAsDataUrl(file);

			return runEffect(
				tryEffectPromise("Failed to upload server banner", () =>
					uploadServerBannerFn({
						data: {
							serverId,
							fileName: file.name,
							mimeType,
							dataUrl,
							fingerprint,
						},
					}),
				),
			);
		},
		onMutate: () => {
			setBannerUploadError(null);
			setBannerUploadStatus("Banner 圖片上傳中...");
		},
		onSuccess: (result) => {
			setBannerPreviewUrl(result.bannerUrl);
			setBannerFingerprint(result.fingerprint);
			setBannerUploadStatus(result.message);
			setBannerUploadError(null);
		},
		onError: (error) => {
			const message = getErrorMessage(error);
			setBannerUploadStatus(null);
			setBannerUploadError(message);
			showErrorAlert(message, "Banner 上傳失敗");
		},
	});

	// 【功能 1】：初始化時合併資料庫 bundle 與 localStorage 的草稿
	const defaultFormValues = useMemo<ServerPublishFormValues>(() => {
		// 1. 初始化一個用來收集最終資料的物件
		let rawData: Record<string, any> = {
			...bundle.formValues,
			nsfw: bundle.formValues?.nsfw ?? false,
		};

		// 2. 嘗試載入 localStorage 的草稿並覆蓋
		if (typeof window !== "undefined") {
			try {
				const draftStr = localStorage.getItem(DRAFT_KEY);
				if (draftStr) {
					const draftParsed = JSON.parse(draftStr);
					// 合併遠端資料與本地草稿
					rawData = { ...rawData, ...draftParsed };
				}
			} catch (err) {
				console.error("無法載入本地草稿:", err);
			}
		}

		// 3. 安全解析與清洗 customEmbed (此時 rawData.customEmbed 可能是字串、物件或 undefined)
		let rawcustomEmbed = rawData.customEmbed;
		if (typeof rawcustomEmbed === "string") {
			try {
				rawcustomEmbed = JSON.parse(rawcustomEmbed);
			} catch {
				rawcustomEmbed = undefined;
			}
		}

		// 4. 將合併後的髒資料，嚴格格式化為符合 ServerFormSchema 的外觀
		const formattedcustomEmbed = rawcustomEmbed
			? {
					...rawcustomEmbed, // 保留其他可能存在的屬性
					content: rawcustomEmbed.content ?? undefined, // 迎合 Schema.optional
					color: rawcustomEmbed.color ?? undefined,
					// 關鍵：將 fields 轉為一般可變動陣列，解開 readonly 鎖定
					fields: rawcustomEmbed.fields
						? rawcustomEmbed.fields.map((f: any) => ({
								name: f.name ?? "",
								value: f.value ?? "",
								inline: f.inline ?? false,
							}))
						: undefined,
				}
			: undefined;

		// 5. 回傳完全符合 TypeScript 期待的乾淨資料
		return {
			serverName: rawData.serverName ?? "",
			shortDescription: rawData.shortDescription ?? "",
			longDescription: rawData.longDescription ?? "",
			inviteLink: rawData.inviteLink ?? "",
			websiteLink: rawData.websiteLink ?? "",
			rules: rawData.rules ?? [],
			tags: rawData.tags ?? [],
			secret: rawData.secret ?? "",
			webhook_url: rawData.webhook_url ?? "",
			nsfw: rawData.nsfw,
			customEmbed: formattedcustomEmbed,
		};
	}, [bundle.formValues, DRAFT_KEY]);

	const form = useForm({
		defaultValues: defaultFormValues,
		validators: {
			onSubmit: ({ value }) => validateForm(value),
		},
		onSubmit: async ({ value }) => {
			let finalBannerUrl = normalizeExternalUrl(bannerPreviewUrl);

			if (bannerFile) {
				try {
					const result = await bannerUploadMutation.mutateAsync(bannerFile);
					finalBannerUrl = normalizeExternalUrl(result.bannerUrl);
				} catch (error) {
					console.error("Banner 圖片上傳失敗，已取消發布流程:", error);
					return;
				}
			}

			await saveMutation.mutateAsync({
				serverId,
				iconUrl: normalizeExternalUrl(iconPreviewUrl),
				bannerUrl: finalBannerUrl,
				form: value,
			});

			// 送出成功後，清除快取的草稿
			if (typeof window !== "undefined") {
				localStorage.removeItem(DRAFT_KEY);
			}
		},
	});

	// 取出表單目前狀態，用於判斷是否需要警告或儲存
	const currentFormValues = useStore(form.store, (state) => state.values);
	const isFormDirty = useStore(form.store, (state) => state.isDirty);

	// 【功能 1.2】：表單有變動且為 dirty 狀態時，自動寫入 localStorage
	useEffect(() => {
		if (isFormDirty && typeof window !== "undefined") {
			localStorage.setItem(DRAFT_KEY, JSON.stringify(currentFormValues));
		}
	}, [currentFormValues, isFormDirty, DRAFT_KEY]);

	// 【功能 2】：防止瀏覽器意外重整、關閉分頁
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isFormDirty) {
				e.preventDefault();
				// 賦值給 returnValue 才能觸發標準瀏覽器提示框
				e.returnValue = "您有未儲存的變更，確定要離開嗎？";
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [isFormDirty]);

	// 【加碼】：處理內部 Router 的返回行為
	const handleGoBack = () => {
		if (isFormDirty) {
			const confirmLeave = window.confirm(
				"您有未儲存的內容，確定要放棄草稿並離開嗎？",
			);
			if (!confirmLeave) return; // 使用者按取消則停留在原地
		}

		void navigate({
			to: "/servers/$serverId",
			params: { serverId },
		});
	};

	useEffect(() => {
		// 當組件卸載時，如果當前是 blob 網址，就釋放它
		return () => {
			if (bannerPreviewUrl?.startsWith("blob:")) {
				URL.revokeObjectURL(bannerPreviewUrl);
			}
		};
	}, [bannerPreviewUrl]);

	const longDescriptionValue = useSelector(
		form.store,
		(state) => state.values.longDescription,
	);

	const customEmbedValues = useSelector(
		form.store,
		(state) => state.values.customEmbed,
	);

	const sanitizedMarkdown = useMemo(
		() => longDescriptionValue || "詳細描述預覽 (支援Markdown)",
		[longDescriptionValue],
	);

	const handleScroll = () => {
		if (!textareaRef.current || !previewRef.current) return;
		previewRef.current.scrollTop = textareaRef.current.scrollTop;
	};

	const handleBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		const mimeType = resolveSupportedBannerMimeType(file);
		if (!mimeType) {
			showErrorAlert("請選擇 GIF、PNG、JPG、JPEG 或 WEBP 圖片檔案", "格式錯誤");
			event.target.value = "";
			return;
		}

		if (file.size <= 0) {
			showErrorAlert("選擇的檔案內容為空，請重新選擇", "檔案無效");
			event.target.value = "";
			return;
		}

		if (file.size > MAX_BANNER_IMAGE_BYTES) {
			showErrorAlert("圖片檔案大小不可超過 10MB", "檔案過大");
			event.target.value = "";
			return;
		}

		// --- 修正部分 ---
		// 先前產生的舊 blob URL 可以先不用急著手動 revoke，或是只在確認它是 blob 時才釋放
		if (bannerPreviewUrl?.startsWith("blob:")) {
			URL.revokeObjectURL(bannerPreviewUrl);
		}

		const newPreviewUrl = URL.createObjectURL(file);

		// 統一更新這個狀態即可
		setBannerPreviewUrl(newPreviewUrl);
		setBannerFile(file);

		setBannerUploadStatus("已選擇新圖片，將於儲存時上傳");
		setBannerUploadError(null);
		event.target.value = "";
	};

	const isBannerUploading = bannerUploadMutation.isPending;
	const isUploading = isIconUploading || isBannerUploading;

	return (
		<div className="min-h-screen bg-[#1e1f22] px-4 py-8 text-white">
			<div className="mx-auto max-w-7xl space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="font-bold text-2xl">
							{bundle.isPublished ? "編輯您的伺服器" : "發布您的伺服器"}
						</h1>
					</div>
					<Button
						type="button"
						onClick={handleGoBack}
						className="bg-discord text-white hover:bg-discord-hover"
					>
						返回伺服器頁
					</Button>
				</div>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void form.handleSubmit();
					}}
					className="grid gap-6 lg:grid-cols-2"
				>
					{/* ... 後續的表單 JSX 不需要變更 ... */}
					<div className="space-y-6 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						<h2 className="border-white/10 border-b pb-2 font-bold text-lg">
							基本資訊
						</h2>
						<form.Field
							name="serverName"
							validators={{
								onChange: ({ value }) => validateServerName(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="serverName">伺服器名稱</Label>
										<Input
											id="serverName"
											value={field.state.value}
											disabled
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="shortDescription"
							validators={{
								onChange: ({ value }) => validateShortDescription(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="shortDescription">簡短描述 *</Label>
										<Textarea
											id="shortDescription"
											rows={3}
											maxLength={200}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="一句話介紹你的社群"
											aria-invalid={Boolean(errorMessage)}
										/>
										<div className="flex items-center justify-between text-[#b9bbbe] text-xs">
											<span>最多 200 字</span>
											<span>{field.state.value.length}/200</span>
										</div>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="longDescription"
							validators={{
								onChange: ({ value }) => validateLongDescription(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="longDescription">詳細介紹 *</Label>
										<textarea
											id="longDescription"
											ref={textareaRef}
											rows={14}
											className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40"
											value={field.state.value}
											onBlur={field.handleBlur}
											onScroll={handleScroll}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="支援 Markdown，右側可即時預覽"
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="nsfw"
							validators={{ onChange: ({ value }) => validateisNsfw(value) }}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
										<Checkbox
											id="NFW"
											checked={field.state.value ?? false}
											onCheckedChange={(checked) => {
												field.handleChange(checked === true);
											}}
										/>
										<div className="space-y-1 leading-none">
											<div className="space-y-1 leading-none">
												<Label htmlFor="nsfw" className="cursor-pointer">
													NSFW 伺服器
												</Label>
												<p className="text-muted-foreground text-sm">
													如果你的伺服器包含成人或敏感內容，請勾選此項。
												</p>
												<div className="mt-2 flex max-w-sm items-start gap-2 rounded-md border border-yellow-400 bg-yellow-100 px-3 py-2 text-xs text-yellow-700">
													<div className="relative z-20 cursor-pointer text-yellow-600 hover:text-yellow-500">
														<AlertTriangle className="h-5 w-5" />
													</div>
													<div className="space-y-0.5">
														<p className="font-semibold text-yellow-900">
															警告：誠實申報
														</p>
														<p className="leading-relaxed">
															未能如實標註您的伺服器內容類型可能會導致嚴重後果。如果我們發現您的伺服器未正確標註為
															NSFW，可能會導致其遭到系統強制移除，並且不另行通知。請確保遵循相關社群準則。
														</p>
													</div>
												</div>
												{errorMessage ? (
													<p className="mt-1 text-[#ed4245] text-sm">
														{errorMessage}
													</p>
												) : null}
											</div>
											{errorMessage ? (
												<p className="mt-1 text-[#ed4245] text-sm">
													{errorMessage}
												</p>
											) : null}
										</div>
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="inviteLink"
							validators={{
								onChange: ({ value }) => validateInviteLink(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="inviteLink">Discord 邀請連結 *</Label>
										<Input
											id="inviteLink"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="https://discord.gg/your-server"
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="websiteLink"
							validators={{
								onChange: ({ value }) => validateWebsiteLink(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="websiteLink">網站連結</Label>
										<Input
											id="websiteLink"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="https://your-website.example"
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field
							name="rules"
							validators={{
								onChange: ({ value }) => {
									const listError = validateRules(value);
									if (listError) return listError;
									for (const rule of value) {
										const ruleError = validateRule(rule);
										if (ruleError) return ruleError;
									}
									return undefined;
								},
							}}
						>
							{(field) => <RulesField field={field} />}
						</form.Field>

						<form.Field
							name="tags"
							validators={{
								onChange: ({ value }) => {
									const listError = validateTags(value);
									if (listError) return listError;
									for (const tag of value) {
										const tagError = validateTag(tag);
										if (tagError) return tagError;
									}
									return undefined;
								},
							}}
						>
							{(field) => (
								<ServerTagField field={field} categories={ServerCategories} />
							)}
						</form.Field>

						<h2 className="border-white/10 border-b pb-2 font-bold text-lg">
							投票通知
						</h2>

						<form.Field
							name="secret"
							validators={{
								onChange: ({ value }) => validateSecret(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="secret">密鑰</Label>
										<Input
											id="secret"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="可選：Webhook 密鑰 (用於驗證來自自訂端點的 Webhook 請求)"
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
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
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="webhook_url">Webhook 網址</Label>
										<Input
											id="webhook_url"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="可選：Discord Webhook 網址 或 自訂端點網址"
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-[#ed4245] text-sm">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<h2 className="border-white/10 border-b pb-2 font-bold text-lg">
							圖片上傳
						</h2>

						<div className="space-y-2">
							<Label htmlFor="bannerImageFile">
								自訂 Banner 圖片（GIF/PNG/JPG/WEBP）
							</Label>
							<input
								ref={bannerFileInputRef}
								id="bannerImageFile"
								type="file"
								accept={SUPPORTED_BANNER_FILE_ACCEPT}
								disabled={isBannerUploading}
								className="sr-only"
								onChange={(event) => {
									void handleBannerFileChange(event);
								}}
							/>
							<Button
								type="button"
								className="bg-discord text-white hover:bg-discord-hover disabled:cursor-not-allowed disabled:bg-discord/70"
								disabled={isBannerUploading}
								onClick={() => bannerFileInputRef.current?.click()}
							>
								{isBannerUploading ? "圖片上傳中..." : "選擇 Banner 圖片"}
							</Button>
							{bannerUploadStatus ? (
								<p className="text-[#57f287] text-sm">{bannerUploadStatus}</p>
							) : null}
							{bannerUploadError ? (
								<p className="text-[#ed4245] text-sm">{bannerUploadError}</p>
							) : null}
						</div>

						<h2 className="mt-8 border-white/10 border-b pb-2 font-bold text-lg">
							自訂投票 Embed 格式 (選填)
						</h2>

						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="customEmbed.username">
								{(field) => (
									<div className="space-y-2">
										<Label>通知名稱</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="customEmbed.avatar_url">
								{(field) => (
									<div className="space-y-2">
										<Label>通知頭像</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>

						<form.Field name="customEmbed.content">
							{(field) => (
								<div className="space-y-2">
									<Label>一般文字內容 (Content)</Label>
									<Textarea
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="顯示在 Embed 上方的純文字內容，可標記 User 或 Role"
										rows={2}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="customEmbed.color">
							{(field) => (
								<div className="space-y-2">
									<Label>邊框顏色 (Color Hex)</Label>
									<div className="flex items-center gap-2">
										<input
											type="color"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
										/>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="#5865F2"
											className="w-32 uppercase"
										/>
									</div>
								</div>
							)}
						</form.Field>

						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="customEmbed.authorName">
								{(field) => (
									<div className="space-y-2">
										<Label>作者名稱</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="customEmbed.authorIconUrl">
								{(field) => (
									<div className="space-y-2">
										<Label>作者圖標 URL</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="customEmbed.title">
								{(field) => (
									<div className="space-y-2">
										<Label>標題 (Title)</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="customEmbed.url">
								{(field) => (
									<div className="space-y-2">
										<Label>標題連結 (URL)</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>

						<form.Field name="customEmbed.description">
							{(field) => (
								<div className="space-y-2">
									<Label>描述 (Description)</Label>
									<Textarea
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										rows={3}
									/>
								</div>
							)}
						</form.Field>

						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="customEmbed.imageUrl">
								{(field) => (
									<div className="space-y-2">
										<Label>大圖 URL (Image)</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="customEmbed.thumbnailUrl">
								{(field) => (
									<div className="space-y-2">
										<Label>右上角縮圖 URL (Thumbnail)</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="customEmbed.footerText">
								{(field) => (
									<div className="space-y-2">
										<Label>頁尾文字 (Footer)</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="customEmbed.footerIconUrl">
								{(field) => (
									<div className="space-y-2">
										<Label>頁尾圖標 URL</Label>
										<Input
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>

						<form.Field name="customEmbed.fields">
							{(field) => <EmbedFieldsListField field={field} />}
						</form.Field>

						<form.Subscribe
							selector={(state) => ({
								canSubmit: state.canSubmit,
								isSubmitting: state.isSubmitting,
								hasRequiredFields: hasRequiredPublishFields({
									shortDescription: state.values.shortDescription,
									longDescription: state.values.longDescription,
									inviteLink: state.values.inviteLink,
									tags: state.values.tags,
								}),
							})}
						>
							{({ canSubmit, isSubmitting, hasRequiredFields }) => (
								<div className="w-full space-y-4">
									<Button
										type="submit"
										disabled={
											!hasRequiredFields ||
											!canSubmit ||
											isSubmitting ||
											saveMutation.isPending ||
											isUploading
										}
										className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
									>
										{bannerUploadMutation.isPending
											? "圖片上傳中..."
											: saveMutation.isPending || isSubmitting
												? "儲存中..."
												: bundle.isPublished
													? "更新伺服器"
													: "發布伺服器"}
									</Button>
								</div>
							)}
						</form.Subscribe>
					</div>

					<div className="flex h-full flex-col space-y-4 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						<div className="space-y-2">
							<Label>Icon 預覽</Label>
							<div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#36393f]">
								{iconPreviewUrl ? (
									<OptimizedImage
										src={iconPreviewUrl}
										alt="Server icon preview"
										width={64}
										height={64}
										className="h-full w-full object-cover"
									/>
								) : (
									<span className="text-[#b9bbbe] text-xs">沒有伺服器</span>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label>Banner 預覽</Label>
							<div className="h-40 overflow-hidden rounded-lg border border-white/10 bg-[#36393f]">
								{bannerPreviewUrl ? (
									<OptimizedImage
										src={bannerPreviewUrl}
										alt="Server banner preview"
										width={960}
										height={320}
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full items-center justify-center text-[#b9bbbe] text-sm">
										沒有伺服器旗幟
									</div>
								)}
							</div>
						</div>

						<div className="flex h-0 flex-1 flex-col space-y-2">
							<Label>Markdown 預覽</Label>
							<div
								ref={previewRef}
								className="h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-[#1f2124] p-4"
							>
								<ClientOnly>
									{sanitizedMarkdown.trim() ? (
										<MarkdownRenderer content={sanitizedMarkdown} />
									) : (
										<p className="text-[#b9bbbe] text-sm">
											在左側輸入詳細介紹後，這裡會同步顯示預覽。
										</p>
									)}
								</ClientOnly>
							</div>
						</div>
						<div className="flex h-0 flex-1 flex-col space-y-2">
							<Label>Embed 預覽</Label>
							<div className="flex-1 overflow-y-auto rounded-lg border border-white/10 bg-[#1f2124] p-4">
								<ClientOnly>
									<DiscordEmbedPreview
										data={
											(customEmbedValues ?? { fields: [] }) as CustomEmbedData
										}
									/>
								</ClientOnly>
							</div>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
