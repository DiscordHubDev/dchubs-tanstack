import { SubmitBotFailed } from "#/errors/bot-errors";
import { Effect } from "effect";

const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1";

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadPreset: string | null;
}

// ====================== 工具函式 ======================

export function getCloudinaryErrorDetails(error: unknown): {
  httpCode: number | null;
  message: string;
} {
  const topLevel = error as any;
  const nested = topLevel?.error;

  const httpCode =
    typeof topLevel?.http_code === "number"
      ? topLevel.http_code
      : typeof nested?.http_code === "number"
        ? nested.http_code
        : null;

  let message = topLevel?.message || nested?.message;

  if (!message && error instanceof Error) message = error.message;
  if (!message) {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }

  return { httpCode, message: message || "Unknown Cloudinary error" };
}

export function getCloudinaryCredentialsEffect(): Effect.Effect<
  CloudinaryCredentials,
  SubmitBotFailed
> {
  return Effect.gen(function* () {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = normalizeOptionalString(
      process.env.CLOUDINARY_UPLOAD_PRESET ?? process.env.UPLOAD_PRESET,
    );

    if (!cloudName || !apiKey || !apiSecret) {
      return yield* Effect.fail(
        new SubmitBotFailed({
          message: "Cloudinary 環境變數未設定完整",
        }),
      );
    }

    return { cloudName, apiKey, apiSecret, uploadPreset };
  });
}

// ====================== 上傳 ======================

// ====================== 上傳（修正版） ======================
export function uploadImageToCloudinary(
  dataUrl: string,
  credentials: CloudinaryCredentials,
  options: Record<string, any> = {},
): Effect.Effect<any, Error> {
  return Effect.tryPromise({
    try: async () => {
      const formData = new FormData();
      formData.append("file", dataUrl);

      const timestamp = Math.round(Date.now() / 1000);

      // 收集所有會送出的參數（file / api_key / signature 不參與簽名）
      const params: Record<string, string | number | boolean> = {
        timestamp,
      };

      if (options.public_id) params.public_id = options.public_id;
      if (options.folder) params.folder = options.folder;
      if (options.overwrite !== undefined) params.overwrite = options.overwrite;
      if (options.invalidate !== undefined) params.invalidate = options.invalidate;
      if (options.unique_filename !== undefined) params.unique_filename = options.unique_filename;

      if (options.context) {
        const contextStr = Object.entries(options.context)
          .map(([k, v]) => `${k}=${v}`)
          .join("|");
        params.context = contextStr;
      }

      const useSigned = Boolean(credentials.apiKey && credentials.apiSecret);

      if (useSigned) {
        // ========== Signed Upload（推薦） ==========
        const signature = await generateCloudinarySignature(params, credentials.apiSecret);

        formData.append("api_key", credentials.apiKey);
        formData.append("timestamp", String(timestamp));
        formData.append("signature", signature);

        for (const [key, value] of Object.entries(params)) {
          if (key === "timestamp") continue;
          formData.append(key, String(value));
        }
      } else {
        // ========== Unsigned Upload（fallback） ==========
        const preset = options.upload_preset ?? credentials.uploadPreset;
        if (!preset) {
          throw new Error(
            "Unsigned upload 需要 upload_preset。請設定 CLOUDINARY_UPLOAD_PRESET 或傳 options.upload_preset",
          );
        }
        formData.append("upload_preset", preset);

        // Unsigned 只允許有限參數
        if (options.public_id) formData.append("public_id", options.public_id);
        if (options.folder) formData.append("folder", options.folder);
        if (params.context) formData.append("context", String(params.context));
      }

      const response = await fetch(
        `${CLOUDINARY_UPLOAD_URL}/${credentials.cloudName}/image/upload`,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cloudinary upload failed: ${response.status} - ${text}`);
      }

      return response.json();
    },
    catch: (error) => {
      const details = getCloudinaryErrorDetails(error);
      return new Error(`Failed to upload to Cloudinary: ${details.message}`);
    },
  });
}

// ====================== 刪除 ======================

export function destroyCloudinaryImage(
  publicId: string,
  credentials: CloudinaryCredentials,
): Effect.Effect<void, SubmitBotFailed> {
  return Effect.tryPromise({
    try: async () => {
      const timestamp = Math.round(Date.now() / 1000);

      // ★ 關鍵：所有要送出的參數都要參與簽名
      const paramsToSign = {
        public_id: publicId,
        timestamp,
        invalidate: true, // 必須包含！
      };

      const signature = await generateCloudinarySignature(paramsToSign, credentials.apiSecret);

      const formData = new FormData();
      formData.append("public_id", publicId);
      formData.append("timestamp", timestamp.toString());
      formData.append("invalidate", "true");
      formData.append("api_key", credentials.apiKey);
      formData.append("signature", signature);

      const response = await fetch(
        `${CLOUDINARY_UPLOAD_URL}/${credentials.cloudName}/image/destroy`,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cloudinary destroy HTTP error: ${response.status} - ${text}`);
      }

      const result: any = await response.json();

      if (result?.result !== "ok") {
        throw new Error(`Delete failed: ${result?.result || JSON.stringify(result)}`);
      }
    },
    catch: (error) => {
      const details = getCloudinaryErrorDetails(error);
      return new SubmitBotFailed({
        message: `Cloudinary 圖片刪除失敗: ${details.message}`,
      });
    },
  });
}

async function generateCloudinarySignature(
  params: Record<string, string | number | boolean>,
  apiSecret: string,
): Promise<string> {
  const toSign = Object.entries(params)
    .filter(
      ([key]) => !["file", "api_key", "cloud_name", "resource_type", "signature"].includes(key),
    )
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const stringToSign = toSign.map(([k, v]) => `${k}=${v}`).join("&") + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ====================== 查詢現有資源 ======================

export function getExistingCloudinaryResource(
  publicId: string,
  credentials: CloudinaryCredentials,
): Effect.Effect<any, Error> {
  return Effect.tryPromise({
    try: async () => {
      const timestamp = Math.round(Date.now() / 1000);

      const paramsToSign = {
        public_id: publicId,
        timestamp,
        // 如果有加 context=true、type 等，都要放進來
      };
      const signature = await generateCloudinarySignature(paramsToSign, credentials.apiSecret);

      const params = new URLSearchParams({
        public_id: publicId,
        timestamp: timestamp.toString(),
        api_key: credentials.apiKey,
        signature,
        // context: "true", // 需要的話再加，並同步放進 paramsToSign
      });

      const response = await fetch(
        `${CLOUDINARY_UPLOAD_URL}/${credentials.cloudName}/resources/image/upload/${encodeURIComponent(publicId)}?${params.toString()}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 404) throw new Error("Not found");
        throw new Error(`Cloudinary resource fetch failed: ${response.status} - ${text}`);
      }

      return response.json();
    },
    catch: (error) => {
      const details = getCloudinaryErrorDetails(error);
      return new Error(`Failed to fetch existing resource: ${details.message}`);
    },
  });
}
