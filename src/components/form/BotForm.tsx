import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Effect, Schema } from "effect";
import { AlertTriangle, Info, Loader2, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { SubmitBotErrorPayload, SubmitBotResult } from "#/features/bots/bot-submit.types";
import { effectValidator } from "#/features/servers/server-publish.validators";
import { userGetBaseProfileByNameOrIdQueryOptions } from "#/features/users/users.query";
import type { DevUser } from "#/features/users/users.types";
import { botCategories } from "#/lib/categories";
import { toErrorMessage } from "#/lib/effect-utils";
import type { CategoryType, Screenshot } from "#/lib/types";
import type { CustomEmbedData } from "#/types/custom_embed";
import DiscordEmbedPreview from "../DiscordEmbedPreview";
import EmbedFieldsListField from "../EmbedFieldsListField";
import { OptimizedImage } from "../OptimizedImage";
import { Checkbox } from "../ui/checkbox";

const EMPTY_CATEGORIES: CategoryType[] = [];
const EMPTY_ARRAY: any[] = [];

// ============================================================================
// Types
// ============================================================================

export type BotFormDefaultValues = Partial<BotFormData> & {
  screenshots?: string[];
  banner?: string | undefined;
  iconUrl?: string | null;
};

export type BotFormProps = {
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

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_GIF_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

type ValidationResult = {
  validFiles: File[];
  warnings: string[];
};

type CommandItem = BotFormData["commands"][number];
type BaseDeveloperItem = BotFormData["developers"][number];

// ============================================================================
// Static Validators (Moved outside component to prevent re-creation on render)
// ============================================================================

const OptionalStringSchema = Schema.Union(Schema.String, Schema.Null, Schema.Undefined);

const validateBotName = effectValidator(BotNameSchema, {
  label: "機器人名稱",
  required: "機器人名稱不可為空",
  maxLength: { value: 50, message: "機器人名稱最多 50 字" },
});

const validateBotPrefix = effectValidator(BotPrefixSchema, {
  label: "機器人前綴",
  required: "機器人前綴不可為空",
  maxLength: { value: 10, message: "機器人前綴最多 10 字" },
});

const validateIsNsfw = effectValidator(Schema.Boolean, {
  label: "NSFW",
  required: "請選擇是否為 NSFW 伺服器",
});

const validateBotDescription = effectValidator(BotDescriptionSchema, {
  label: "簡短描述",
  required: "請填寫簡短描述",
  minLength: { value: 10, message: "簡短描述至少 10 字" },
  maxLength: { value: 200, message: "簡短描述最多 200 字" },
});

const validateBotLongDescription = effectValidator(BotLongDescriptionSchema, {
  label: "詳細描述",
  required: "請填寫詳細描述",
});

const validateBotInvite = effectValidator(BotInviteSchema, {
  label: "機器人邀請連結",
  required: "請填寫機器人邀請連結",
  fallback: "請輸入有效的機器人邀請連結",
});

const validateBotWebsite = effectValidator(OptionalStringSchema, {
  label: "網站連結",
  fallback: "網站連結格式不正確",
});

const validateBotSupport = effectValidator(OptionalStringSchema, {
  label: "支援伺服器連結",
  fallback: "支援伺服器連結格式不正確",
});

const baseTagsValidator = effectValidator(BotTagsSchema, {
  fallback: "格式不正確",
});
const validateTags = (value: readonly string[]) => {
  if (!value || value.length < 1) return "請至少新增一個標籤";
  if (value.length > 8) return "最多只能新增 8 個標籤";
  return baseTagsValidator(value);
};

const validateDevelopers = effectValidator(BotDevelopersSchema, {
  fallback: "至少需要一位開發者",
});

const validateCommands = effectValidator(BotCommandsSchema, {
  fallback: "指令格式不正確",
});

const validateSecret = effectValidator(OptionalStringSchema, {
  label: "Secret",
  fallback: "Secret 格式不正確",
});

const validateWebhookUrl = effectValidator(OptionalStringSchema, {
  label: "Webhook URL",
  fallback: "Webhook URL 格式不正確",
});

// ============================================================================
// Helper Functions
// ============================================================================

function readFirstError(errors: unknown[] | undefined): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (typeof first === "string") return first;
  if (first instanceof Error) return first.message;
  return String(first);
}

function readPersistedFormValues(): Partial<BotFormData> {
  if (typeof window === "undefined") return {};
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

  const result = await uploadBotImagesFn({ data: { files: payload } });
  if (!result.success) throw new Error(result.error.message);
  return result.items;
}

async function deleteCloudinaryImage(publicId: string): Promise<void> {
  const result = await deleteBotImageFn({ data: { publicId } });
  if (!result.success) throw new Error(result.error.message);
}

function hasRequiredPublishFields(values: {
  botDescription: string;
  botLongDescription: string;
  botInvite: string;
  botDevelopers: readonly unknown[];
  botTags: readonly string[];
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

const ALLOWED_IMAGE_TYPES_SET = new Set(ALLOWED_IMAGE_TYPES);

function validateFiles(files: File[], remainingSlots: number): Effect.Effect<File[], never> {
  return Effect.sync(() => {
    const warnings: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const mimeType = file.type.toLowerCase() as AllowedImageType;
      if (!ALLOWED_IMAGE_TYPES_SET.has(mimeType)) {
        warnings.push("請傳送動圖或者是一般圖片！");
        continue;
      }

      if (mimeType === "image/gif" && file.size > MAX_GIF_SIZE_BYTES) {
        warnings.push(
          `動圖 ${file.name} 大於 ${MAX_GIF_SIZE_BYTES / (1024 * 1024)}MB，請傳送更小檔案。`,
        );
        continue;
      }

      if (mimeType !== "image/gif" && file.size > MAX_IMAGE_SIZE_BYTES) {
        warnings.push(
          `圖片 ${file.name} 大於 ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB，請傳送更小檔案。`,
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
    default:
      return error.message || "提交失敗，請稍後再試。";
  }
}

// ============================================================================
// Effect Programs (Extracted for React Compiler compatibility)
// ============================================================================

/**
 * Submit program: upload banner/screenshots then submit bot.
 * Extracted from the component so React Compiler can analyze the component
 * without encountering unsupported `yield*` generator syntax.
 */
function submitBotProgram({
  media,
  mode,
  value,
}: {
  media: MediaState;
  mode: "create" | "edit";
  value: BotFormData;
}): Effect.Effect<SubmitBotResult, SubmitBotFailed> {
  return Effect.gen(function* () {
    let finalBannerUrl = media.banner?.url ?? undefined;
    const bannerFile = media.banner?.file;

    if (bannerFile) {
      yield* Effect.sync(() => toast.info("上傳 Banner 中..."));
      const uploadedBanner = yield* Effect.tryPromise({
        try: () => ScreenshotUpload([bannerFile]),
        catch: (err) =>
          new SubmitBotFailed({
            message: `Banner 上傳失敗：${toErrorMessage(err)}`,
          }),
      });
      finalBannerUrl = uploadedBanner[0]?.url ?? undefined;
    }

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
      yield* Effect.sync(() => toast.info(`上傳 ${localScreenshotFiles.length} 張截圖中...`));
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

    const payload = {
      form: value,
      screenshots: finalScreenshots,
      banner: finalBannerUrl,
      mode,
    };

    return yield* Effect.tryPromise({
      try: () => submitBotFn({ data: payload }),
      catch: (err) =>
        new SubmitBotFailed({
          message: `資料提交失敗：${toErrorMessage(err)}`,
        }),
    });
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        success: false as const,
        error: { tag: error._tag, message: error.message },
      } satisfies SubmitBotResult),
    ),
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted] = useState(() => typeof window !== "undefined");
  if (!mounted) return null;
  return <>{children}</>;
}

const ScreenshotGrid = React.memo(
  ({
    screenshotPreviews,
    removeScreenshot,
  }: {
    screenshotPreviews: string[];
    removeScreenshot: (index: number) => void;
  }) => {
    if (screenshotPreviews.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {screenshotPreviews.map((url, index) => (
          <div key={url} className="group relative overflow-hidden rounded-md">
            <OptimizedImage
              src={url}
              alt={`Screenshot ${index + 1}`}
              width={320}
              height={128}
              className="h-24 w-full object-cover md:h-32"
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
  },
);
ScreenshotGrid.displayName = "ScreenshotGrid";

function TagField({
  field,
  categories = EMPTY_CATEGORIES,
  maxTags = 8,
}: {
  field: AnyFieldApi;
  categories?: CategoryType[];
  maxTags?: number;
}) {
  const [nextTag, setNextTag] = useState("");
  const tags = Array.isArray(field.state.value) ? (field.state.value as string[]) : EMPTY_ARRAY;
  const errorMessage = readFirstError(field.state.meta.errors);

  const addTag = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value || tags.length >= maxTags) return;
      if (tags.some((item) => item.toLowerCase() === value.toLowerCase())) return;

      field.handleChange([...tags, value]);
      setNextTag("");
    },
    [field, tags, maxTags],
  );

  const removeTag = useCallback(
    (value: string) => {
      field.handleChange(tags.filter((item) => item !== value));
    },
    [field, tags],
  );

  return (
    <div className="space-y-3 text-[#dcddde]">
      <Label className="font-medium text-[#eee] text-sm">標籤 *</Label>
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
          className="border-[#18191c] bg-[#202225] text-white transition-colors duration-200 placeholder:text-[#72767d] focus-visible:border-[#5865f2] focus-visible:ring-1 focus-visible:ring-[#5865f2] disabled:bg-[#2f3136] disabled:opacity-50"
        />
        <Button
          type="button"
          onClick={() => addTag(nextTag)}
          disabled={!nextTag.trim() || tags.length >= maxTags}
          className="cursor-pointer border-transparent bg-discord text-white shadow-sm transition-all duration-200 hover:bg-discord-hover active:bg-discord disabled:cursor-not-allowed disabled:bg-[#3c45a5]/50 disabled:opacity-50"
        >
          加入
        </Button>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => addTag(category.name)}
              disabled={tags.length >= maxTags}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#202225] bg-[#2f3136] px-3 py-1 font-medium text-[#b9bbbe] text-xs shadow-sm transition-all duration-150 hover:scale-105 hover:bg-[#35383e] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${category.color}`} />
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#202225] bg-[#2f3136] px-3 py-1 text-[#b9bbbe] text-xs transition-all duration-150 hover:bg-[#35383e] hover:text-white"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="group cursor-pointer rounded-full p-0.5 transition-all duration-200 hover:bg-[#ed4245]/20"
            >
              <X className="h-3 w-3 text-[#b9bbbe] transition-transform group-hover:scale-110 group-hover:text-[#ed4245]" />
            </button>
          </span>
        ))}
      </div>

      <p className={`text-xs ${tags.length === 0 ? "text-[#f1c40f]" : "text-[#b9bbbe]"}`}>
        目前已有 {tags.length} 個標籤（最少 1 個，最多 {maxTags} 個）
      </p>

      {errorMessage && (
        <p className="animate-pulse font-medium text-[#ed4245] text-sm">{errorMessage}</p>
      )}
    </div>
  );
}

function CommandListField({ field }: { field: AnyFieldApi }) {
  const commands = Array.isArray(field.state.value)
    ? (field.state.value as CommandItem[])
    : EMPTY_ARRAY;
  const errorMessage = readFirstError(field.state.meta.errors);
  const [commandKeys, setCommandKeys] = useState<string[]>(() =>
    commands.map(() => crypto.randomUUID()),
  );

  const addCommand = useCallback(() => {
    field.handleChange([...commands, { name: "", description: "", usage: "", category: "" }]);
    setCommandKeys((prev) => [...prev, crypto.randomUUID()]);
  }, [field, commands]);

  const updateCommand = useCallback(
    (index: number, patch: Partial<CommandItem>) => {
      field.handleChange(commands.map((cmd, i) => (i === index ? { ...cmd, ...patch } : cmd)));
    },
    [field, commands],
  );

  const removeCommand = useCallback(
    (index: number) => {
      field.handleChange(commands.filter((_, i) => i !== index));
      setCommandKeys((prev) => prev.filter((_, i) => i !== index));
    },
    [field, commands],
  );

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
          <Plus className="h-4 w-4" /> 新增指令
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
                <p className="font-semibold text-sm text-white">指令 {index + 1}</p>
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
                    onChange={(e) => updateCommand(index, { name: e.target.value })}
                    placeholder="例如：help"
                  />
                </div>
                <div className="space-y-2">
                  <Label>分類</Label>
                  <Input
                    value={command.category ?? ""}
                    onBlur={field.handleBlur}
                    onChange={(e) => updateCommand(index, { category: e.target.value })}
                    placeholder="例如：管理"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>指令描述</Label>
                <Textarea
                  value={command.description}
                  onBlur={field.handleBlur}
                  onChange={(e) => updateCommand(index, { description: e.target.value })}
                  placeholder="描述指令用途"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>用法</Label>
                <Input
                  value={command.usage}
                  onBlur={field.handleBlur}
                  onChange={(e) => updateCommand(index, { usage: e.target.value })}
                  placeholder="例如：/help"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
    </div>
  );
}

type DeveloperItem = BaseDeveloperItem & {
  _displayUsername?: string;
  avatar?: string | null;
};

function DeveloperListField({ field }: { field: AnyFieldApi }) {
  const developers = Array.isArray(field.state.value)
    ? (field.state.value as DeveloperItem[])
    : EMPTY_ARRAY;
  const errorMessage = readFirstError(field.state.meta.errors);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: searchResults = [], isFetching } = useQuery({
    ...userGetBaseProfileByNameOrIdQueryOptions(debouncedTerm),
    enabled: debouncedTerm.length > 0,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const removeDeveloper = useCallback(
    (index: number) => {
      field.handleChange(developers.filter((_, i) => i !== index));
    },
    [field, developers],
  );

  const selectDeveloper = useCallback(
    (user: DevUser) => {
      if (!developers.some((dev) => dev.name === user.id)) {
        field.handleChange([
          ...developers,
          {
            name: user.id,
            _displayUsername: user.name?.trim() ? user.name : user.username,
            avatar: user.avatar,
          },
        ]);
      }
      setSearchTerm("");
      setIsDropdownOpen(false);
    },
    [field, developers],
  );

  return (
    <div className="space-y-4">
      <Label>開發者列表 *</Label>
      {developers.length === 0 ? (
        <p className="rounded-md border border-white/10 border-dashed px-3 py-3 text-[#b9bbbe] text-sm">
          尚未新增任何開發者。
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {developers.map((developer, index) => {
            const displayName = developer._displayUsername || developer.name;
            return (
              <div
                key={developer.name}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-[#2b2d31] py-1 pr-1 pl-3"
              >
                {developer.avatar ? (
                  <OptimizedImage
                    src={developer.avatar}
                    alt="avatar"
                    width={20}
                    height={20}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1e1f22]">
                    <Search className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <span className="font-medium text-sm">{displayName}</span>
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

      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {isDropdownOpen && searchTerm.length > 0 && (
          <div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-md border border-white/10 bg-[#2b2d31] p-1 shadow-lg">
            {isFetching ? (
              <div className="p-3 text-center text-[#b9bbbe] text-sm">搜尋中...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-3 text-center text-[#b9bbbe] text-sm">找不到使用者</div>
            ) : (
              searchResults.map((result: DevUser) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => selectDeveloper(result)}
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-[#404249]"
                >
                  {result.avatar ? (
                    <OptimizedImage
                      src={result.avatar}
                      alt="avatar"
                      width={32}
                      height={32}
                      className="shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e1f22]">
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm">
                      {result.name?.trim() ? result.name : result.username}
                    </span>
                    <span className="truncate text-[#b9bbbe] text-xs">{result.id}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
    </div>
  );
}

// ============================================================================
// Main Form Component
// ============================================================================

export default function BotForm({ mode = "create", defaultValues }: BotFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [media, setMedia] = useState<MediaState>(() => {
    if (!defaultValues) return { screenshots: [], banner: undefined };
    return {
      screenshots: defaultValues.screenshots?.map(buildScreenshotFromUrl) ?? [],
      banner: defaultValues.banner ? buildScreenshotFromUrl(defaultValues.banner) : undefined,
    };
  });
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Initial state hydration from localStorage (CSR only to avoid SSR mismatch)
  const [persistedValues] = useState<Partial<BotFormData>>(() => readPersistedFormValues());

  const { session } = useRouteContext({ from: "__root__" });

  const currentUser = session?.user;

  const initialDevelopers = currentUser
    ? [
        {
          name: currentUser.discordId,
          _displayUsername: currentUser.name || currentUser.username,
          avatar: currentUser.avatar,
        },
      ]
    : [];

  const finalDevelopers =
    persistedValues?.developers && persistedValues.developers.length > 0
      ? persistedValues.developers
      : defaultValues?.developers && defaultValues.developers.length > 0
        ? defaultValues.developers
        : initialDevelopers;

  useEffect(() => {
    // ✅ 1. 先把當下的 ref 參考抓出來
    const urlsToRevoke = objectUrlsRef.current;

    return () => {
      // ✅ 2. 在 cleanup 裡面使用剛剛抓出來的變數
      urlsToRevoke.forEach((url) => {
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
      commands: [],
      tags: [],
      secret: "",
      webhook_url: "",
      nsfw: false,
      customEmbed: {
        username: "Dchubs 投票通知",
        avatar_url:
          "https://cdn.discordapp.com/avatars/1324996138251583580/14bdbdc05d5e5bb8512b84e3019c7b65.webp?size=1024",
        content: "",
        color: "#5865F2",
        authorName: "",
        authorUrl: "",
        authorIconUrl: "",
        title: "",
        url: "",
        description: "",
        imageUrl: "",
        thumbnailUrl: "",
        footerText: "",
        footerIconUrl: "",
        fields: [],
      },
      ...defaultValues,
      ...persistedValues,
      developers: finalDevelopers,
    } as BotFormData,
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
      submitMutation.mutate({ value, media, mode });
    },
  });

  // Extracting mutation out of onSubmit for better React Query integration
  const submitMutation = useMutation({
    mutationFn: async ({
      value,
      media,
      mode,
    }: {
      value: BotFormData;
      media: MediaState;
      mode: "create" | "edit";
    }) => {
      const program = submitBotProgram({ media, mode, value });
      return Effect.runPromise(program);
    },
    onSuccess: async (response) => {
      if (!response.success) {
        await Swal.fire({
          icon: "error",
          title: "儲存失敗",
          text: getSubmitErrorMessage(response.error),
          confirmButtonText: "重新嘗試",
        });
        return;
      }

      window.localStorage.removeItem("bot_form_backup");

      if (mode === "create") {
        form.reset();
        setMedia({ screenshots: [], banner: undefined });
        queryClient.invalidateQueries({ queryKey: ["bots"] });

        await Swal.fire({
          icon: "success",
          title: "發布成功",
          text: "請等待審核，審核通過後機器人便會出現在列表中。",
          confirmButtonText: "前往個人頁面",
        });
        void navigate({ to: "/protected/profile", search: { tab: "bots" } });
      } else {
        queryClient.invalidateQueries({ queryKey: ["bot", response.botId] });
        await Swal.fire({
          icon: "success",
          title: "儲存成功",
          text: "機器人資料已成功儲存。",
          confirmButtonText: "前往機器人頁面",
        });
        void navigate({
          to: "/bots/$botId",
          params: { botId: response.botId },
        });
      }
    },
    onError: async (error) => {
      await Swal.fire({
        icon: "error",
        title: "系統錯誤",
        text: `發生非預期錯誤：${toErrorMessage(error)}`,
        confirmButtonText: "確定",
      });
    },
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotsFileInputRef = useRef<HTMLInputElement | null>(null);

  const longDescription = useSelector(form.store, (state) => state.values.botLongDescription);
  const customEmbedValues = useSelector(form.store, (state) => state.values.customEmbed);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const currentState = form.store.state;
      if (currentState.isDirty) {
        try {
          window.localStorage.setItem("bot_form_backup", JSON.stringify(currentState.values));
        } catch (error) {
          console.error("緊急備份失敗:", error);
        }
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form.store]);

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (textarea && preview) {
      const scrollRatio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
      preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
    }
  }, []);

  const handleMediaUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "screenshots" | "banner",
  ) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) return;

    const remainingSlots =
      kind === "banner" ? (media.banner ? 0 : 1) : Math.max(0, 5 - media.screenshots.length);
    if (remainingSlots <= 0) return;

    setIsUploadingMedia(true);

    // Catch both expected failures (catchAll) and unexpected defects
    // (catchAllDefect) inside the Effect pipeline itself, so there's no
    // need for an outer try/catch/finally in the component.
    const validFiles = await Effect.runPromise(
      validateFiles(files, remainingSlots).pipe(
        Effect.catchAllDefect((defect) => {
          console.error("Unexpected error during media upload:", defect);
          return Effect.succeed([] as File[]);
        }),
      ),
    );

    if (validFiles.length > 0) {
      const newItems: MediaItem[] = validFiles.map((file) => {
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.add(url);
        return { url, file };
      });

      if (kind === "banner") {
        if (media.banner?.file) {
          URL.revokeObjectURL(media.banner.url);
          objectUrlsRef.current.delete(media.banner.url);
        }
        setMedia((prev) => ({ ...prev, banner: newItems[0] }));
      } else {
        setMedia((prev) => ({
          ...prev,
          screenshots: [...prev.screenshots, ...newItems],
        }));
      }
    }

    setIsUploadingMedia(false);
  };

  const removeScreenshot = useCallback((index: number) => {
    setMedia((prev) => {
      const toDelete = prev.screenshots[index];
      if (!toDelete) return prev;

      if (toDelete.file) {
        URL.revokeObjectURL(toDelete.url);
        objectUrlsRef.current.delete(toDelete.url);
      } else if (toDelete.public_id) {
        void Effect.runPromise(
          deleteImage(toDelete.public_id).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
        );
      }
      return {
        ...prev,
        screenshots: prev.screenshots.filter((_, i) => i !== index),
      };
    });
  }, []);

  const removeBanner = useCallback(() => {
    setMedia((prev) => {
      const toDelete = prev.banner;
      if (!toDelete) return prev;

      if (toDelete.file) {
        URL.revokeObjectURL(toDelete.url);
        objectUrlsRef.current.delete(toDelete.url);
      } else if (toDelete.public_id) {
        void Effect.runPromise(
          deleteImage(toDelete.public_id).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
        );
      }
      return { ...prev, banner: undefined };
    });
  }, []);

  const sanitizedMarkdown = useMemo(
    () => longDescription || "詳細描述預覽 (支援Markdown)",
    [longDescription],
  );

  return (
    <div className="min-h-screen bg-[#1e1f22] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-2xl">
              {mode === "edit" ? "編輯" : "新增"}您的 Discord 機器人
            </h1>
          </div>
        </div>

        <form
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
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
            <h2 className="border-white/10 border-b pb-2 font-bold text-lg">基本資訊</h2>

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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="輸入您的機器人名稱"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
                  </div>
                );
              }}
            </form.Field>

            <form.Field
              name="botPrefix"
              validators={{ onChange: ({ value }) => validateBotPrefix(value) }}
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="例如：! 或 /"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="簡短描述您的機器人功能（最多 200 字）"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    <div className="flex items-center justify-between text-[#b9bbbe] text-xs">
                      <span>最多 200 字</span>
                      <span>{(field.state.value ?? "").length}/200</span>
                    </div>
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
                  </div>
                );
              }}
            </form.Field>

            <form.Field
              name="botLongDescription"
              validators={{
                onChangeAsyncDebounceMs: 500,
                onChangeAsync: async ({ value }) => validateBotLongDescription(value),
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="請輸入詳細描述 (支援Markdown)"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="nsfw" validators={{ onChange: ({ value }) => validateIsNsfw(value) }}>
              {(field) => {
                const errorMessage = readFirstError(field.state.meta.errors);
                return (
                  <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <Checkbox
                      id="nsfw"
                      checked={field.state.value ?? false}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                    />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor="nsfw" className="cursor-pointer">
                        NSFW 機器人
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        如果你的機器人包含成人或敏感內容，請勾選此項。
                      </p>
                      <div className="mt-2 flex max-w-sm items-start gap-2 rounded-md border border-yellow-400 bg-yellow-100 px-3 py-2 text-xs text-yellow-700">
                        <div className="relative z-20 cursor-pointer text-yellow-600 hover:text-yellow-500">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-semibold text-yellow-900">警告：誠實申報</p>
                          <p className="leading-relaxed">
                            未能如實標註您的機器人內容類型可能會導致嚴重後果。如果我們發現您的機器人未正確標註為
                            NSFW，可能會導致其遭到系統強制移除，並且不另行通知。請確保遵循相關社群準則。
                          </p>
                        </div>
                      </div>
                      {errorMessage && (
                        <p className="mt-1 text-[#ed4245] text-sm">{errorMessage}</p>
                      )}
                    </div>
                  </div>
                );
              }}
            </form.Field>

            <form.Field
              name="botInvite"
              validators={{ onChange: ({ value }) => validateBotInvite(value) }}
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="例如：https://discord.com/oauth2/authorize?client_id=..."
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
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
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="例如：https://example.com"
                        aria-invalid={Boolean(errorMessage)}
                      />
                      {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
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
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="例如：https://discord.gg/example"
                        aria-invalid={Boolean(errorMessage)}
                      />
                      {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
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
                onChange: ({ value }) => validateTags(value as readonly string[]),
              }}
            >
              {(field) => <TagField field={field} categories={botCategories} />}
            </form.Field>

            <form.Field
              name="commands"
              validators={{ onChange: ({ value }) => validateCommands(value) }}
            >
              {(field) => <CommandListField field={field} />}
            </form.Field>

            <h2 className="border-white/10 border-b pb-2 font-bold text-lg">投票通知</h2>

            <form.Field
              name="secret"
              validators={{ onChange: ({ value }) => validateSecret(value) }}
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="可選：Webhook 密鑰 (用於驗證來自自訂端點的 Webhook 請求)"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="可選：Discord Webhook 網址 或 自訂端點網址"
                      aria-invalid={Boolean(errorMessage)}
                    />
                    {errorMessage && <p className="text-[#ed4245] text-sm">{errorMessage}</p>}
                  </div>
                );
              }}
            </form.Field>

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

            <h2 className="border-white/10 border-b pb-2 font-bold text-lg">圖片上傳</h2>

            <div className="space-y-2">
              <Label htmlFor="bot-banner">機器人橫幅</Label>
              <input
                ref={bannerFileInputRef}
                id="bot-banner"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={isUploadingMedia || !!media.banner}
                onChange={(event) => handleMediaUpload(event, "banner")}
              />
              <Button
                type="button"
                className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
                disabled={isUploadingMedia || !!media.banner}
                onClick={() => bannerFileInputRef.current?.click()}
              >
                {isUploadingMedia ? "圖片上傳中..." : "選擇橫幅圖片"}
              </Button>
              <p className="text-[#b9bbbe] text-xs">
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
                disabled={isUploadingMedia || media.screenshots.length >= 5}
                onChange={(event) => handleMediaUpload(event, "screenshots")}
              />
              <Button
                type="button"
                className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
                disabled={isUploadingMedia || media.screenshots.length >= 5}
                onClick={() => screenshotsFileInputRef.current?.click()}
              >
                {isUploadingMedia ? "圖片上傳中..." : "選擇截圖"}
              </Button>
              <p className="text-[#b9bbbe] text-xs">
                上傳您機器人的截圖，展示機器人的功能和使用場景
              </p>
            </div>

            <div className="space-y-4 border-white/10 border-t pt-4">
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 text-[#5865f2]" />
                <p className="text-[#b9bbbe] text-sm">
                  {mode === "edit"
                    ? "保存後，變更可能需要一段時間才會套用。"
                    : "提交後，我們將審核您的機器人。審核通常需要 1-2 個工作日。"}
                </p>
              </div>

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
                      submitMutation.isPending ||
                      isUploadingMedia
                    }
                    className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#5865f2]/70"
                  >
                    {submitMutation.isPending || isSubmitting
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
            <div className="space-y-2">
              <Label>橫幅預覽</Label>
              <div className="h-40 overflow-hidden rounded-lg border border-white/10 bg-[#36393f]">
                {media.banner ? (
                  <div className="group relative h-full w-full">
                    <OptimizedImage
                      src={media.banner.url}
                      alt="Banner preview"
                      width={960}
                      height={360}
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
                  <div className="flex h-full items-center justify-center text-[#b9bbbe] text-sm">
                    沒有機器人橫幅
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>截圖預覽</Label>
              <div className="min-h-32 rounded-lg border border-white/10 bg-[#36393f] p-4">
                {media.screenshots.length > 0 ? (
                  <ScreenshotGrid
                    screenshotPreviews={media.screenshots.map((item) => item.url)}
                    removeScreenshot={removeScreenshot}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center pt-8 pb-8 text-[#b9bbbe] text-sm">
                    沒有機器人截圖
                  </div>
                )}
              </div>
            </div>

            <div className="flex h-0 flex-1 flex-col space-y-2">
              <Label>Markdown 預覽</Label>
              <div
                ref={previewRef}
                className="flex-1 overflow-y-auto rounded-lg border border-white/10 bg-[#1f2124] p-4"
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
                    data={(customEmbedValues ?? { fields: [] }) as CustomEmbedData}
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
