import { useForm, useStore } from "@tanstack/react-form";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import {
	uploadServerBannerFn,
	upsertServerPublishFn,
} from "../server-publish.functions";
import { serverPublishQueryOptions } from "../server-publish.query";
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
import type { ServerPublishSubmitInput } from "../server-publish.types";
import { effectValidator } from "../server-publish.validators";
import { RulesField } from "./RulesField";
import { ServerTagField } from "./ServerTagField";

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
	if (fileName.endsWith(".gif")) {
		return "image/gif";
	}

	if (fileName.endsWith(".png")) {
		return "image/png";
	}

	if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
		return "image/jpeg";
	}

	if (fileName.endsWith(".webp")) {
		return "image/webp";
	}

	return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
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

async function buildFileFingerprint(file: File): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		throw new Error("目前瀏覽器不支援檔案雜湊，請更新後重試");
	}

	const buffer = await file.arrayBuffer();
	const digest = await subtle.digest("SHA-256", buffer);

	return Array.from(new Uint8Array(digest), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "儲存時發生未預期錯誤";
}

function hasRequiredPublishFields(values: {
	shortDescription: string;
	longDescription: string;
	inviteLink: string;
}): boolean {
	return (
		values.shortDescription.trim().length > 0 &&
		values.longDescription.trim().length > 0 &&
		values.inviteLink.trim().length > 0
	);
}

export type ServerPublishPageProps = {
	serverId: string;
};

export function ServerPublishPage({ serverId }: ServerPublishPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: bundle } = useSuspenseQuery(
		serverPublishQueryOptions(serverId),
	);

	const [iconPreviewUrl, setIconPreviewUrl] = useState(bundle.iconUrl ?? "");
	const [bannerPreviewUrl, setBannerPreviewUrl] = useState(
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
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

	// 新增：當元件卸載或更換預覽網址時，釋放 Object URL 記憶體
	useEffect(() => {
		return () => {
			if (localPreviewUrl) {
				URL.revokeObjectURL(localPreviewUrl);
			}
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
		() =>
			effectValidator(RulesSchema, {
				fallback: "規則內容格式不正確",
			}),
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
	const validateTags = useMemo(
		() =>
			effectValidator(TagsSchema, {
				fallback: "標籤格式不正確",
			}),
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
						name: payload.form.serverName, // 對應 serverName
						description: payload.form.shortDescription, // 對應 shortDescription
						longDescription: payload.form.longDescription, // 對應 longDescription
						inviteUrl: payload.form.inviteLink, // 對應 inviteLink
						website: payload.form.websiteLink, // 對應 websiteLink
						rules: payload.form.rules, // 對應 rules
						tags: payload.form.tags, // 對應 tags
						secret: payload.form.secret, // 對應 secret
						voteNotificationUrl: payload.form.webhook_url, // 對應 webhook_url
					};
				},
			);
			await Promise.all([
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

			void navigate({
				to: "/servers/$serverId",
				params: { serverId },
			});
		},
		onError: (error) => {
			showErrorAlert(getErrorMessage(error), "儲存失敗");
		},
	});

	const bannerUploadMutation = useMutation({
		mutationFn: async (file: File) => {
			const mimeType = resolveSupportedBannerMimeType(file);
			if (!mimeType) {
				throw new Error("請選擇 GIF、PNG、JPG、JPEG 或 WEBP 圖片檔案");
			}

			if (file.size <= 0) {
				throw new Error("選擇的檔案內容為空，請重新選擇");
			}

			if (file.size > MAX_BANNER_IMAGE_BYTES) {
				throw new Error("圖片檔案大小不可超過 10MB");
			}

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

	const form = useForm({
		defaultValues: bundle.formValues,
		validators: {
			onSubmit: ({ value }) => validateForm(value),
		},
		onSubmit: async ({ value }) => {
			let finalBannerUrl = normalizeExternalUrl(bannerPreviewUrl);

			// 如果有選取新圖片，先執行圖片上傳
			if (bannerFile) {
				try {
					const result = await bannerUploadMutation.mutateAsync(bannerFile);
					// 上傳成功後，使用後端回傳的圖片網址
					finalBannerUrl = normalizeExternalUrl(result.bannerUrl);
				} catch (error) {
					console.error("Banner 圖片上傳失敗，已取消發布流程:", error);
					return;
				}
			}

			// 執行原始的表單儲存
			await saveMutation.mutateAsync({
				serverId,
				iconUrl: normalizeExternalUrl(iconPreviewUrl),
				bannerUrl: finalBannerUrl,
				form: value,
			});
		},
	});

	const longDescriptionValue = useStore(
		form.store,
		(state) => state.values.longDescription,
	);

	const sanitizedMarkdown = useMemo(
		() => longDescriptionValue || "詳細描述預覽 (支援Markdown)",
		[longDescriptionValue],
	);

	const handleScroll = () => {
		if (!textareaRef.current || !previewRef.current) {
			return;
		}

		previewRef.current.scrollTop = textareaRef.current.scrollTop;
	};

	const handleBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		// 基本驗證
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

		// 釋放前一次的本機預覽網址記憶體
		if (localPreviewUrl) {
			URL.revokeObjectURL(localPreviewUrl);
		}

		// 建立新的 Object URL 作為預覽
		const newPreviewUrl = URL.createObjectURL(file);
		setLocalPreviewUrl(newPreviewUrl);
		setBannerPreviewUrl(newPreviewUrl);
		setBannerFile(file); // 儲存檔案以供提交時上傳

		setBannerUploadStatus("已選擇新圖片，將於儲存時上傳");
		setBannerUploadError(null);

		event.target.value = ""; // 清空 input 以允許重複選取相同檔案
	};

	const isBannerUploading = bannerUploadMutation.isPending;

	const isUploading = isIconUploading || isBannerUploading;

	return (
		<div className="min-h-screen bg-[#1e1f22] px-4 py-8 text-white">
			<div className="mx-auto max-w-7xl space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold">
							{bundle.isPublished ? "編輯您的伺服器" : "發布您的伺服器"}
						</h1>
					</div>
					<Button
						type="button"
						onClick={() =>
							void navigate({
								to: "/servers/$serverId",
								params: { serverId },
							})
						}
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
					<div className="space-y-6 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						<h2 className="border-b border-white/10 pb-2 font-bold text-lg">
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
										<div className="flex items-center justify-between text-xs text-[#b9bbbe]">
											<span>最多 200 字</span>
											<span>{field.state.value.length}/200</span>
										</div>
										{errorMessage ? (
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
											className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40"
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
										) : null}
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
									if (listError) {
										return listError;
									}

									for (const rule of value) {
										const ruleError = validateRule(rule);
										if (ruleError) {
											return ruleError;
										}
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
									if (listError) {
										return listError;
									}

									for (const tag of value) {
										const tagError = validateTag(tag);
										if (tagError) {
											return tagError;
										}
									}

									return undefined;
								},
							}}
						>
							{(field) => <ServerTagField field={field} />}
						</form.Field>

						<h2 className="border-b border-white/10 pb-2 font-bold text-lg">
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<h2 className="border-b border-white/10 pb-2 font-bold text-lg">
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
								<p className="text-sm text-[#57f287]">{bannerUploadStatus}</p>
							) : null}
							{bannerUploadError ? (
								<p className="text-sm text-[#ed4245]">{bannerUploadError}</p>
							) : null}
						</div>

						<form.Subscribe
							selector={(state) => ({
								canSubmit: state.canSubmit,
								isSubmitting: state.isSubmitting,
								hasRequiredFields: hasRequiredPublishFields({
									shortDescription: state.values.shortDescription,
									longDescription: state.values.longDescription,
									inviteLink: state.values.inviteLink,
								}),
							})}
						>
							{({ canSubmit, isSubmitting, hasRequiredFields }) => (
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
							)}
						</form.Subscribe>
					</div>

					<div className="flex h-full flex-col space-y-4 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						{/* 1. 橫幅預覽 */}
						<div className="space-y-2">
							<Label>Icon 預覽</Label>
							<div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#36393f]">
								{iconPreviewUrl ? (
									<img
										src={iconPreviewUrl}
										alt="Server icon preview"
										className="h-full w-full object-cover"
									/>
								) : (
									<span className="text-xs text-[#b9bbbe]">沒有伺服器</span>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label>Banner 預覽</Label>
							<div className="h-40 overflow-hidden rounded-lg border border-white/10 bg-[#36393f]">
								{bannerPreviewUrl ? (
									<img
										src={bannerPreviewUrl}
										alt="Server banner preview"
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full items-center justify-center text-sm text-[#b9bbbe]">
										沒有伺服器旗幟
									</div>
								)}
							</div>
						</div>

						{/* 3. Markdown 預覽（加上 flex-1 與 h-0 讓它自動延伸至最底部） */}
						<div className="flex flex-1 flex-col space-y-2">
							<Label>Markdown 預覽</Label>
							<div
								ref={previewRef}
								className="flex-1 h-0 overflow-y-auto rounded-lg border border-white/10 bg-[#1f2124] p-4"
							>
								<ClientOnly>
									{sanitizedMarkdown.trim() ? (
										<MarkdownRenderer content={sanitizedMarkdown} />
									) : (
										<p className="text-sm text-[#b9bbbe]">
											在左側輸入詳細介紹後，這裡會同步顯示預覽。
										</p>
									)}
								</ClientOnly>
							</div>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
