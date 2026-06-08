import { type AnyFieldApi, useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import {
	AlertTriangle,
	Info,
	Loader2,
	Plus,
	Search,
	Trash2,
	UserPlus,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { SubmitBotFailed } from "#/errors/bot-errors";
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
import { userGetBaseProfileByNameOrIdQueryOptions } from "#/features/users/users.query";
import type { DevUser } from "#/features/users/users.types";
import { toErrorMessage } from "#/lib/effect-utils";
import type { CategoryType, Screenshot } from "#/lib/types";
import { Checkbox } from "../ui/checkbox";

type BotFormDefaultValues = Partial<BotFormData> & {
	screenshots?: string[];
	banner?: string | undefined;
	iconUrl?: string | null; // 補充未定義的 iconUrl
};

type BotFormProps = {
	mode?: "create" | "edit";
	defaultValues?: BotFormDefaultValues;
};

type MediaItem = {
	url: string;
	public_id?: string;
	file?: File;
};

type MediaState = {
	screenshots: MediaItem[];
	banner: MediaItem | undefined;
};

const botCategories: CategoryType[] = [
	{
		id: "1",
		name: "音樂",
		color: "bg-blue-500",
	},
	{
		id: "2",
		name: "遊戲",
		color: "bg-green-500",
	},
	{
		id: "3",
		name: "管理",
		color: "bg-yellow-500",
	},
	{
		id: "4",
		name: "工具",
		color: "bg-purple-500",
	},
	{
		id: "5",
		name: "社群",
		color: "bg-pink-500",
	},
	{
		id: "6",
		name: "娛樂",
		color: "bg-red-500",
	},
	{
		id: "7",
		name: "多功能",
		color: "bg-rose-500",
	},
	{
		id: "8",
		name: "AI",
		color: "bg-fuchsia-500",
	},
	{
		id: "9",
		name: "安全",
		color: "bg-teal-500",
	},
	{
		id: "10",
		name: "經濟",
		color: "bg-emerald-500",
	},
	{
		id: "11",
		name: "紀錄",
		color: "bg-indigo-500",
	},
];

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

type CommandItem = BotFormData["commands"][number];
type BaseDeveloperItem = BotFormData["developers"][number];

function readFirstError(errors: unknown[] | undefined): string | null {
	if (!Array.isArray(errors) || errors.length === 0) {
		return null;
	}
	const first = errors[0];
	if (typeof first === "string") return first;
	if (first instanceof Error) return first.message;
	return String(first);
}

function readPersistedFormValues(): Partial<BotFormData> {
	if (typeof window === "undefined") {
		return {};
	}
	try {
		const saved = window.localStorage.getItem("bot_form_backup");
		return saved ? JSON.parse(saved) : {};
	} catch (error) {
		console.error("無法解析表單備份", error);
		return {};
	}
}

function buildScreenshotFromUrl(url: string): Screenshot {
	const parts = url.split("/");
	const filename = parts[parts.length - 1] || "";
	const publicId = filename.split(".")[0] || filename;

	return { url, public_id: publicId };
}

// 記憶體優化：讀取為 Data URL 後，僅作為短暫傳輸用，不會長期掛載在 DOM 上
async function readFileAsDataUrl(file: File): Promise<string> {
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

async function ScreenshotUpload(files: File[]): Promise<Screenshot[]> {
	const payload = await Promise.all(
		files.map(async (file) => ({
			fileName: file.name,
			dataUrl: await readFileAsDataUrl(file),
		})),
	);

	const result = await uploadBotImagesFn({
		data: { files: payload },
	});

	if (!result.success) throw new Error(result.error.message);
	return result.items;
}

async function deleteCloudinaryImage(publicId: string): Promise<void> {
	const result = await deleteBotImageFn({ data: { publicId } });
	if (!result.success) throw new Error(result.error.message);
}

// 修復：改為對應 BotFormData 的欄位名稱
function hasRequiredPublishFields(values: {
	botDescription: string;
	botLongDescription: string;
	botInvite: string;
	botDevelopers: readonly unknown[]; // 加上 readonly
	botTags: readonly string[]; // 加上 botTags 和 readonly
}): boolean {
	return (
		values.botDescription.trim().length > 0 &&
		values.botLongDescription.trim().length > 0 &&
		values.botInvite.trim().length > 0 &&
		Array.isArray(values.botDevelopers) &&
		values.botDevelopers.length > 0 &&
		Array.isArray(values.botTags) &&
		values.botTags.length > 0
	);
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
		default:
			return error.message || "提交失敗，請稍後再試。";
	}
}

function ClientOnly({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
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
	if (screenshotPreviews.length === 0) return null;
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
			{screenshotPreviews.map((url, index) => (
				<div key={url} className="group relative overflow-hidden rounded-md">
					<img
						src={url}
						alt={`Screenshot ${index + 1}`}
						className="h-24 w-full object-cover md:h-32"
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
		if (!value || tags.length >= maxTags) return;
		if (tags.some((item) => item.toLowerCase() === value.toLowerCase())) return;

		// 新增標籤並觸發欄位更新（這會觸發你的表單驗證）
		field.handleChange([...tags, value]);
		setNextTag("");
	};

	const removeTag = (value: string) => {
		// 移除標籤並觸發欄位更新（若移除到 0 個，驗證機制會自動跳出錯誤）
		field.handleChange(tags.filter((item) => item !== value));
	};

	return (
		<div className="space-y-3 text-[#dcddde]">
			<Label className="text-sm font-medium text-[#eee]">標籤 *</Label>

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
					className="bg-[#202225] border-[#18191c] text-white transition-colors duration-200 placeholder:text-[#72767d] focus-visible:border-[#5865f2] focus-visible:ring-1 focus-visible:ring-[#5865f2] disabled:opacity-50 disabled:bg-[#2f3136]"
				/>
				<Button
					type="button"
					onClick={() => addTag(nextTag)}
					disabled={!nextTag.trim() || tags.length >= maxTags}
					className="bg-discord text-white border-transparent hover:bg-discord-hover active:bg-discord transition-all duration-200 shadow-sm disabled:bg-[#3c45a5]/50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
							disabled={tags.length >= maxTags}
							// 按鈕本體改為深色 Discord 風格，hover 時稍微亮一點
							className="inline-flex items-center gap-2 rounded-full bg-[#2f3136] hover:bg-[#35383e] border border-[#202225] px-3 py-1 text-xs font-medium text-[#b9bbbe] hover:text-white cursor-pointer transition-all duration-150 hover:scale-105 active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
						>
							{/* 顏色小點點 */}
							<span
								className={`h-2 w-2 rounded-full shrink-0 ${category.color}`}
							/>

							{/* 分類文字 */}
							<span>{category.name}</span>
						</button>
					))}
				</div>
			) : null}

			{/* 標籤顯示區域 */}
			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<span
						key={tag}
						className="inline-flex items-center gap-1.5 rounded-full bg-[#2f3136] hover:bg-[#35383e] text-[#b9bbbe] border border-[#202225] px-3 py-1 text-xs transition-all duration-150 hover:text-white"
					>
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							className="group cursor-pointer rounded-full p-0.5 transition-all duration-200 hover:bg-[#ed4245]/20"
						>
							<X className="h-3 w-3 text-[#b9bbbe] group-hover:text-[#ed4245] group-hover:scale-110 transition-transform" />
						</button>
					</span>
				))}
			</div>

			{/* 修改：動態提示文字，未滿 1 個時用黃色/紅色提醒 */}
			<p
				className={`text-xs ${tags.length === 0 ? "text-[#f1c40f]" : "text-[#b9bbbe]"}`}
			>
				目前已有 {tags.length} 個標籤（最少 1 個，最多 {maxTags} 個）
			</p>

			{/* 錯誤訊息：當 tags.length === 0 且表單被觸碰（touched）或送出時，這裡會顯示最少 1 個的錯誤 */}
			{errorMessage ? (
				<p className="text-sm text-[#ed4245] font-medium animate-pulse">
					{errorMessage}
				</p>
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

	// 最佳實踐：改用隨機 UUID 作為陣列 Key，避免因增刪導致的渲染錯誤
	const [commandKeys, setCommandKeys] = useState<string[]>(() =>
		commands.map(() => crypto.randomUUID()),
	);

	const addCommand = () => {
		field.handleChange([
			...commands,
			{ name: "", description: "", usage: "", category: "" },
		]);
		setCommandKeys((prev) => [...prev, crypto.randomUUID()]);
	};

	const updateCommand = (index: number, patch: Partial<CommandItem>) => {
		field.handleChange(
			commands.map((command, currentIndex) =>
				currentIndex === index ? { ...command, ...patch } : command,
			),
		);
	};

	const removeCommand = (index: number) => {
		const nextCommands = commands.filter((_, i) => i !== index);
		field.handleChange(nextCommands);
		setCommandKeys((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>指令列表</Label>
				<Button
					type="button"
					onClick={addCommand}
					size="sm"
					className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
				>
					<Plus className="h-4 w-4" />
					新增指令
				</Button>
			</div>

			{commands.length === 0 ? (
				<p className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-[#b9bbbe]">
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
								<p className="text-sm font-semibold text-white">
									指令 {index + 1}
								</p>
								<Button
									type="button"
									onClick={() => removeCommand(index)}
									className="bg-[#ed4245] text-white hover:bg-[#c93b3e]"
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
											updateCommand(index, { name: event.target.value })
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
											updateCommand(index, { category: event.target.value })
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
										updateCommand(index, { description: event.target.value })
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
										updateCommand(index, { usage: event.target.value })
									}
									placeholder="例如：/help"
								/>
							</div>
						</div>
					))}
				</div>
			)}
			{errorMessage ? (
				<p className="text-sm text-[#ed4245]">{errorMessage}</p>
			) : null}
		</div>
	);
}

type DeveloperItem = BaseDeveloperItem & {
	_displayUsername?: string;
	avatar?: string | null;
};

export type DeveloperListFieldProps = {
	field: AnyFieldApi;
};

export function DeveloperListField({ field }: DeveloperListFieldProps) {
	console.log("DeveloperListField render", {
		value: field.state.value,
		errors: field.state.meta.errors,
	});

	const developers = Array.isArray(field.state.value)
		? (field.state.value as DeveloperItem[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);

	const [searchTerm, setSearchTerm] = useState("");
	const [debouncedTerm, setDebouncedTerm] = useState("");
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// 防抖
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedTerm(searchTerm.trim());
		}, 300);
		return () => clearTimeout(timer);
	}, [searchTerm]);

	// 獲取搜尋結果
	// 💡 將預設值改為空陣列 []，並將變數重新命名為 searchResults 以符合陣列語意
	const { data: searchResults = [], isFetching } = useQuery({
		...userGetBaseProfileByNameOrIdQueryOptions(debouncedTerm),
		enabled: debouncedTerm.length > 0,
	});

	// 點擊外部關閉
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const removeDeveloper = (index: number) => {
		const nextDevelopers = developers.filter((_, i) => i !== index);
		field.handleChange(nextDevelopers);
	};

	const selectDeveloper = (user: DevUser) => {
		// 檢查重複 (依賴 user.id)
		const isDuplicate = developers.some((dev) => dev.name === user.id);

		if (!isDuplicate) {
			const displayName =
				user.name && user.name.trim() !== "" ? user.name : user.username;

			field.handleChange([
				...developers,
				{
					name: user.id,
					_displayUsername: displayName,
					avatar: user.avatar,
				},
			]);
		}

		setSearchTerm("");
		setIsDropdownOpen(false);
	};

	return (
		<div className="space-y-4">
			<Label>開發者列表 *</Label>

			{/* 1. 已選擇的開發者展示區 */}
			{developers.length === 0 ? (
				<p className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-[#b9bbbe]">
					尚未新增任何開發者。
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					{developers.map((developer, index) => {
						const displayName = developer._displayUsername || developer.name;

						return (
							<div
								key={developer.name}
								className="flex items-center gap-2 rounded-md border border-white/10 bg-[#2b2d31] pl-3 pr-1 py-1"
							>
								{developer.avatar ? (
									<img
										src={developer.avatar}
										alt="avatar"
										className="h-5 w-5 rounded-full object-cover"
									/>
								) : (
									<div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1e1f22]">
										<Search className="h-3 w-3 text-muted-foreground" />
									</div>
								)}
								<span className="text-sm font-medium">{displayName}</span>
								<Button
									type="button"
									onClick={() => removeDeveloper(index)}
									variant="ghost"
									size="icon"
									className="h-6 w-6 rounded-full hover:bg-[#ed4245] hover:text-white"
								>
									<X className="h-3 w-3" />
								</Button>
							</div>
						);
					})}
				</div>
			)}

			{/* 2. 搜尋輸入框與下拉選單 */}
			<div className="relative" ref={dropdownRef}>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchTerm}
						onChange={(e) => {
							setSearchTerm(e.target.value);
							setIsDropdownOpen(true);
						}}
						onFocus={() => setIsDropdownOpen(true)}
						placeholder="搜尋 Discord ID 或是 名稱..."
						className="pl-9"
					/>
					{isFetching && (
						<Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
					)}
				</div>

				{/* 下拉選單結果 */}
				{isDropdownOpen && searchTerm.length > 0 && (
					<div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-md border border-white/10 bg-[#2b2d31] p-1 shadow-lg">
						{isFetching ? (
							<div className="p-3 text-center text-sm text-[#b9bbbe]">
								搜尋中...
							</div>
						) : searchResults.length === 0 ? (
							<div className="p-3 text-center text-sm text-[#b9bbbe]">
								找不到使用者
							</div>
						) : (
							searchResults.map((result: DevUser) => (
								<button
									key={result.id}
									type="button"
									onClick={() => selectDeveloper(result)}
									className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-[#404249] transition-colors"
								>
									{result.avatar ? (
										<img
											src={result.avatar}
											alt="avatar"
											className="h-8 w-8 shrink-0 rounded-full object-cover" /* 💡 確保頭像不被擠壓 (shrink-0) */
										/>
									) : (
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e1f22]">
											<UserPlus className="h-4 w-4 text-muted-foreground" />
										</div>
									)}

									{/* 💡 2. 加上 flex-1 min-w-0 讓文字區塊正確縮放，避免撐破 flex 容器 */}
									<div className="flex flex-1 flex-col min-w-0">
										{/* 💡 3. 加上 truncate 讓過長文字顯示為 ... */}
										<span className="truncate text-sm font-medium">
											{result.name && result.name.trim() !== ""
												? result.name
												: result.username}
										</span>
										<span className="truncate text-xs text-[#b9bbbe]">
											{result.id}
										</span>
									</div>
								</button>
							))
						)}
					</div>
				)}
			</div>

			{/* 錯誤訊息 */}
			{errorMessage ? (
				<p className="text-sm text-[#ed4245]">{errorMessage}</p>
			) : null}
		</div>
	);
}

export default function BotForm({
	mode = "create",
	defaultValues,
}: BotFormProps) {
	const navigate = useNavigate();
	const persistedValues = useMemo(() => readPersistedFormValues(), []);

	const objectUrlsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		return () => {
			// Adding curly braces prevents the implicit return
			objectUrlsRef.current.forEach((url) => {
				URL.revokeObjectURL(url);
			});
		};
	}, []);

	const form = useForm({
		defaultValues: {
			botName: "",
			botPrefix: "",
			botDescription: "",
			botLongDescription: "",
			botInvite: "",
			botWebsite: "",
			botSupport: "",
			developers: [],
			commands: [],
			tags: [],
			secret: "",
			webhook_url: "",
			nsfw: false,
			...(defaultValues || {}),
			...persistedValues,
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

			// 將核心業務邏輯全部封裝進 Effect 流程中
			const program = Effect.gen(function* () {
				// 1. 處理 Banner 上傳
				let finalBannerUrl = media.banner?.url ?? undefined;
				if (media.banner?.file) {
					yield* Effect.sync(() => toast.info("上傳 Banner 中..."));
					const uploadedBanner = yield* Effect.tryPromise({
						try: () => ScreenshotUpload([media.banner!.file!]),
						catch: (err) =>
							new SubmitBotFailed({
								message: `Banner 上傳失敗：${toErrorMessage(err)}`,
							}),
					});
					finalBannerUrl = uploadedBanner[0]?.url ?? undefined;
				}

				// 2. 處理 Screenshots 上傳
				const finalScreenshots = [...media.screenshots];
				const localScreenshotIndices: number[] = [];
				const localScreenshotFiles: File[] = [];

				media.screenshots.forEach((s, index) => {
					if (s.file) {
						localScreenshotIndices.push(index);
						localScreenshotFiles.push(s.file);
					}
				});

				if (localScreenshotFiles.length > 0) {
					yield* Effect.sync(() =>
						toast.info(`上傳 ${localScreenshotFiles.length} 張截圖中...`),
					);
					const uploadedScreenshots = yield* Effect.tryPromise({
						try: () => ScreenshotUpload(localScreenshotFiles),
						catch: (err) =>
							new SubmitBotFailed({
								message: `截圖上傳失敗：${toErrorMessage(err)}`,
							}),
					});

					localScreenshotIndices.forEach((originalIndex, newIndex) => {
						finalScreenshots[originalIndex] = uploadedScreenshots[newIndex];
					});
				}

				// 3. 組裝 Payload 並送出最終表單資料
				const payload = {
					form: value,
					screenshots: finalScreenshots,
					banner: finalBannerUrl,
					mode,
				};

				const response = yield* Effect.tryPromise({
					try: () => submitBotFn({ data: payload }),
					catch: (err) =>
						new SubmitBotFailed({
							message: `資料提交失敗：${toErrorMessage(err)}`,
						}),
				});

				return response;
			}).pipe(
				// 統一捕捉此 Effect 鏈中的所有自訂錯誤 (SubmitBotFailed)
				Effect.catchAll((error) =>
					Effect.succeed({
						success: false as const,
						error: {
							tag: error._tag,
							message: error.message,
						},
					} satisfies SubmitBotResult),
				),
			);

			try {
				// 執行 Effect
				const response = await Effect.runPromise(program);

				// 統一處理後端/上傳回應的失敗狀態
				if (!response.success) {
					await Swal.fire({
						icon: "error",
						title: "儲存失敗",
						text: getSubmitErrorMessage(response.error),
						confirmButtonText: "重新嘗試",
					});
					setLoading(false);
					return;
				}

				// 成功後的共同行為
				setSuccess(true);
				window.localStorage.removeItem("bot_form_backup");

				// 根據模式 (create / edit) 執行對應的 Swal 彈窗與後續動作
				if (mode === "create") {
					form.reset();
					setMedia({ screenshots: [], banner: undefined });

					await Swal.fire({
						icon: "success",
						title: "發布成功",
						text: "請等待審核，審核通過後機器人便會出現在列表中。",
						confirmButtonText: "前往個人頁面",
					}).then(() => {
						void navigate({
							to: "/protected/profile",
							search: { tab: "bots" },
						});
					});
				}

				if (mode === "edit") {
					await Swal.fire({
						icon: "success",
						title: "儲存成功",
						text: "機器人資料已成功儲存。",
						confirmButtonText: "前往機器人頁面",
					}).then(() => {
						void navigate({
							to: "/bots/$botId",
							params: { botId: response.botId },
						});
					});
				}
			} catch (error) {
				// 這裡只會捕捉到非預期的運行時嚴重崩潰 (如代碼 bug、NullPointer 等)
				await Swal.fire({
					icon: "error",
					title: "系統錯誤",
					text: `發生非預期錯誤：${toErrorMessage(error)}`,
					confirmButtonText: "確定",
				});
			} finally {
				setLoading(false);
			}
		},
	});

	const [media, setMedia] = useState<MediaState>({
		screenshots: [],
		banner: undefined,
	});
	const [uploading] = useState(false);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const previewRef = useRef<HTMLDivElement | null>(null);
	const bannerFileInputRef = useRef<HTMLInputElement | null>(null);
	const screenshotsFileInputRef = useRef<HTMLInputElement | null>(null);

	const longDescription = useStore(
		form.store,
		(state) => state.values.botLongDescription,
	);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			// 檢查表單是否被修改過 (isDirty)
			const isDirty = form.state.isDirty;

			if (isDirty) {
				// 觸發瀏覽器原生的離開確認對話框
				event.preventDefault();
				event.returnValue = "";
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [form.state.isDirty]); // 依賴 isDirty 狀態

	useEffect(() => {
		if (typeof window === "undefined") return;

		let timeoutId: NodeJS.Timeout;

		// 訂閱表單狀態變更
		const subscription = form.store.subscribe((state) => {
			// 清除上一次的計時器
			clearTimeout(timeoutId);

			// 設定 500 毫秒的延遲，如果使用者連續打字，就不會頻繁寫入
			timeoutId = setTimeout(() => {
				try {
					// 將整個表單狀態轉為 JSON 字串存入
					window.localStorage.setItem(
						"bot_form_backup",
						JSON.stringify(state.values),
					);
				} catch (error) {
					console.error("寫入表單備份失敗:", error);
				}
			}, 500);
		});

		return () => {
			subscription.unsubscribe();
			clearTimeout(timeoutId); // 元件卸載時清除計時器
		};
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
	const validateisNsfw = useMemo(
		() =>
			effectValidator(Schema.Boolean, {
				label: "NSFW",
				required: "請選擇是否為 NSFW 伺服器",
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
	const validateTags = useMemo(() => {
		// 1. 建立原本的驗證器
		const baseValidator = effectValidator(BotTagsSchema, {
			fallback: "格式不正確",
		});

		// 2. 回傳一個自訂的驗證邏輯，手動攔截陣列長度
		return (value: readonly string[]) => {
			if (!value || value.length < 1) {
				return "請至少新增一個標籤";
			}
			if (value.length > 8) {
				return "最多只能新增 8 個標籤";
			}

			// 長度沒問題，再丟給原來的 Effect decode 去檢查單一 tag 的 maxLength(24)
			return (baseValidator as any)(value);
		};
	}, []);
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

		if (remainingSlots <= 0) return;

		// 僅驗證檔案
		const validFiles = await Effect.runPromise(
			validateFiles(files, remainingSlots).pipe(
				Effect.catchAll(() => Effect.succeed([] as File[])),
			),
		);

		if (validFiles.length === 0) return;

		// 建立本機預覽 (Object URL)
		const newItems: MediaItem[] = validFiles.map((file) => {
			const url = URL.createObjectURL(file);
			objectUrlsRef.current.add(url);
			return { url, file };
		});

		if (kind === "banner") {
			// 若原有本地 banner，先釋放
			if (media.banner?.file) {
				URL.revokeObjectURL(media.banner.url);
				objectUrlsRef.current.delete(media.banner.url);
			}
			setMedia((previous) => ({
				...previous,
				banner: newItems[0] ?? undefined,
			}));
		} else {
			setMedia((previous) => ({
				...previous,
				screenshots: [...previous.screenshots, ...newItems],
			}));
		}
	};

	const removeScreenshot = (index: number) => {
		const toDelete = media.screenshots[index];
		if (!toDelete) return;

		if (toDelete.file) {
			// 本地圖片：釋放記憶體
			URL.revokeObjectURL(toDelete.url);
			objectUrlsRef.current.delete(toDelete.url);
		} else if (toDelete.public_id) {
			// 遠端圖片：呼叫刪除 API
			void Effect.runPromise(
				deleteImage(toDelete.public_id).pipe(
					Effect.catchAll(() => Effect.succeed(undefined)),
				),
			);
		}

		setMedia((previous) => ({
			...previous,
			screenshots: previous.screenshots.filter(
				(_, current) => current !== index,
			),
		}));
	};

	const removeBanner = () => {
		const toDelete = media.banner;
		if (!toDelete) return;

		if (toDelete.file) {
			URL.revokeObjectURL(toDelete.url);
			objectUrlsRef.current.delete(toDelete.url);
		} else if (toDelete.public_id) {
			void Effect.runPromise(
				deleteImage(toDelete.public_id).pipe(
					Effect.catchAll(() => Effect.succeed(undefined)),
				),
			);
		}
		// 修正：改用 undefined 替代 null
		setMedia((previous) => ({ ...previous, banner: undefined }));
	};

	const sanitizedMarkdown = useMemo(
		() => longDescription || "詳細描述預覽 (支援Markdown)",
		[longDescription],
	);

	return (
		<div className="min-h-screen bg-[#1e1f22] px-4 py-8 text-white">
			<div className="mx-auto max-w-7xl space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold">
							{mode === "edit" ? "編輯" : "新增"}您的 Discord 機器人
						</h1>
					</div>
				</div>

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
					className="grid gap-6 lg:grid-cols-2"
				>
					<div className="space-y-6 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						<h2 className="border-b border-white/10 pb-2 font-bold text-lg">
							基本資訊
						</h2>

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
											rows={3}
											maxLength={200}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="簡短描述您的機器人功能（最多 200 字）"
											aria-invalid={Boolean(errorMessage)}
										/>
										<div className="flex items-center justify-between text-xs text-[#b9bbbe]">
											<span>最多 200 字</span>
											<span>{(field.state.value ?? "").length}/200</span>
										</div>
										{errorMessage ? (
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						{/* 效能優化：對長文本區塊加入防抖 (Debounce) 驗證 */}
						<form.Field
							name="botLongDescription"
							validators={{
								onChangeAsyncDebounceMs: 500,
								onChangeAsync: async ({ value }) =>
									validateBotLongDescription(value),
							}}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="space-y-2">
										<Label htmlFor="botLongDescription">詳細描述 *</Label>
										<textarea
											id="botLongDescription"
											ref={(el) => {
												textareaRef.current = el;
											}}
											rows={14}
											className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40"
											value={field.state.value ?? ""}
											onBlur={field.handleBlur}
											onScroll={handleScroll}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="請輸入詳細描述 (支援Markdown)"
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
							name="nsfw"
							validators={{ onChange: ({ value }) => validateisNsfw(value) }}
						>
							{(field) => {
								const errorMessage = readFirstError(field.state.meta.errors);
								return (
									<div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
										<Checkbox
											id="nsfw"
											checked={field.state.value ?? false}
											onCheckedChange={(checked) => {
												field.handleChange(checked === true);
											}}
										/>
										<div className="space-y-1 leading-none">
											{/* 新加入的警告元件 */}
											<div className="space-y-1 leading-none">
												<Label htmlFor="nsfw" className="cursor-pointer">
													NSFW 機器人
												</Label>
												<p className="text-sm text-muted-foreground">
													如果你的機器人包含成人或敏感內容，請勾選此項。
												</p>

												{/* 警告元件：套用黃色樣式與 text-xs text-yellow-700 */}
												<div className="max-w-sm rounded-md border border-yellow-400 bg-yellow-100 px-3 py-2 text-xs text-yellow-700 mt-2 flex gap-2 items-start">
													<div className="relative z-20 cursor-pointer text-yellow-600 hover:text-yellow-500">
														<AlertTriangle className="h-5 w-5" />
													</div>
													<div className="space-y-0.5">
														<p className="font-semibold text-yellow-900">
															警告：誠實申報
														</p>
														<p className="leading-relaxed">
															未能如實標註您的機器人內容類型可能會導致嚴重後果。如果我們發現您的機器人未正確標註為
															NSFW，可能會導致其遭到系統強制移除，並且不另行通知。請確保遵循相關社群準則。
														</p>
													</div>
												</div>

												{errorMessage ? (
													<p className="text-sm text-[#ed4245] mt-1">
														{errorMessage}
													</p>
												) : null}
											</div>

											{errorMessage ? (
												<p className="text-sm text-[#ed4245] mt-1">
													{errorMessage}
												</p>
											) : null}
										</div>
									</div>
								);
							}}
						</form.Field>

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
											aria-invalid={Boolean(errorMessage)}
										/>
										{errorMessage ? (
											<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
									const errorMessage = readFirstError(field.state.meta.errors);
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
								name="botSupport"
								validators={{
									onChange: ({ value }) => validateBotSupport(value),
								}}
							>
								{(field) => {
									const errorMessage = readFirstError(field.state.meta.errors);
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
												aria-invalid={Boolean(errorMessage)}
											/>
											{errorMessage ? (
												<p className="text-sm text-[#ed4245]">{errorMessage}</p>
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
							validators={{
								// 💡 將 validateTags 斷言為可以接收參數的函式
								onChange: ({ value }) =>
									(validateTags as (v: typeof value) => string | undefined)(
										value,
									),
							}}
						>
							{(field) => <TagField field={field} categories={botCategories} />}
						</form.Field>

						<form.Field
							name="commands"
							validators={{
								onChange: ({ value }) => validateCommands(value),
							}}
						>
							{(field) => <CommandListField field={field} />}
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
										<Label htmlFor="secret">Secret</Label>
										<Input
											id="secret"
											value={field.state.value ?? ""}
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
											value={field.state.value ?? ""}
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
							<Label htmlFor="bot-banner">機器人橫幅</Label>
							<input
								ref={bannerFileInputRef}
								id="bot-banner"
								type="file"
								accept="image/*"
								className="sr-only"
								disabled={uploading || !!media.banner}
								onChange={(event) => handleMediaUpload(event, "banner")}
							/>
							<Button
								type="button"
								className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
								disabled={uploading || !!media.banner}
								onClick={() => bannerFileInputRef.current?.click()}
							>
								{uploading ? "圖片上傳中..." : "選擇橫幅圖片"}
							</Button>
							<p className="text-xs text-[#b9bbbe]">
								上傳您機器人的自訂橫幅 (如不設置將以機器人橫幅代替)
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="bot-screenshots">機器人截圖（最多 5 張）</Label>
							<input
								ref={screenshotsFileInputRef}
								id="bot-screenshots"
								type="file"
								accept="image/*"
								multiple
								className="sr-only"
								disabled={uploading || media.screenshots.length >= 5}
								onChange={(event) => handleMediaUpload(event, "screenshots")}
							/>
							<Button
								type="button"
								className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
								disabled={uploading || media.screenshots.length >= 5}
								onClick={() => screenshotsFileInputRef.current?.click()}
							>
								{uploading ? "圖片上傳中..." : "選擇截圖"}
							</Button>
							<p className="text-xs text-[#b9bbbe]">
								上傳您機器人的截圖，展示機器人的功能和使用場景
							</p>
						</div>

						<div className="space-y-4 border-t border-white/10 pt-4">
							<div className="flex items-start gap-2">
								<Info size={16} className="mt-0.5 text-[#5865f2]" />
								<p className="text-sm text-[#b9bbbe]">
									{mode === "edit"
										? "保存後，變更可能需要一段時間才會套用。"
										: "提交後，我們將審核您的機器人。審核通常需要 1-2 個工作日。"}
								</p>
							</div>

							{/* 修復：清除了未定義變數，並綁定正確的表單屬性 */}
							<form.Subscribe
								selector={(state) => ({
									canSubmit: state.canSubmit,
									isSubmitting: state.isSubmitting,
									hasRequiredFields: hasRequiredPublishFields({
										botDescription: state.values.botDescription ?? "",
										botLongDescription: state.values.botLongDescription ?? "",
										botInvite: state.values.botInvite ?? "",
										botDevelopers: state.values.developers ?? [],
										botTags: state.values.tags ?? [],
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
											loading ||
											uploading
										}
										className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
									>
										{loading || isSubmitting
											? "儲存中..."
											: mode === "edit"
												? "更新機器人"
												: "新增機器人"}
									</Button>
								)}
							</form.Subscribe>
						</div>
					</div>

					<div className="flex h-full flex-col space-y-4 rounded-xl border border-white/10 bg-[#2b2d31] p-5">
						{/* 1. 橫幅預覽 */}
						<div className="space-y-2">
							<Label>橫幅預覽</Label>
							<div className="h-40 overflow-hidden rounded-lg border border-white/10 bg-[#36393f]">
								{media.banner ? (
									<div className="group relative h-full w-full">
										<img
											src={media.banner.url}
											alt="Banner preview"
											className="h-full w-full object-cover"
										/>
										<button
											type="button"
											onClick={removeBanner}
											className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
										>
											<X size={14} />
										</button>
									</div>
								) : (
									<div className="flex h-full items-center justify-center text-sm text-[#b9bbbe]">
										沒有機器人橫幅
									</div>
								)}
							</div>
						</div>

						{/* 2. 截圖預覽 */}
						<div className="space-y-2">
							<Label>截圖預覽</Label>
							<div className="min-h-32 rounded-lg border border-white/10 bg-[#36393f] p-4">
								{media.screenshots.length > 0 ? (
									<ScreenshotGrid
										screenshotPreviews={media.screenshots.map(
											(item) => item.url,
										)}
										removeScreenshot={removeScreenshot}
									/>
								) : (
									<div className="flex h-full items-center justify-center pt-8 pb-8 text-sm text-[#b9bbbe]">
										沒有機器人截圖
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
