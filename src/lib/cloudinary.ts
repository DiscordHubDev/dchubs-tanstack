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

export function uploadImageToCloudinary(
  dataUrl: string,
  cloudName: string,
  options: Record<string, any> = {},
): Effect.Effect<any, Error> {
  return Effect.tryPromise({
    try: async () => {
      const formData = new FormData();
      formData.append("file", dataUrl);

      if (options.upload_preset) formData.append("upload_preset", options.upload_preset);
      if (options.public_id) formData.append("public_id", options.public_id);
      if (options.folder) formData.append("folder", options.folder);
      if (options.overwrite !== undefined) formData.append("overwrite", String(options.overwrite));
      if (options.invalidate !== undefined)
        formData.append("invalidate", String(options.invalidate));
      if (options.unique_filename !== undefined)
        formData.append("unique_filename", String(options.unique_filename));

      if (options.context) {
        const contextStr = Object.entries(options.context)
          .map(([k, v]) => `${k}=${v}`)
          .join("|");
        formData.append("context", contextStr);
      }

      const response = await fetch(`${CLOUDINARY_UPLOAD_URL}/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });

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
  // ← 改成 SubmitBotFailed
  return Effect.tryPromise({
    try: async () => {
      const timestamp = Math.round(Date.now() / 1000);
      const signature = await generateCloudinarySignature(
        publicId,
        timestamp,
        credentials.apiSecret,
      );

      const formData = new FormData();
      formData.append("public_id", publicId);
      formData.append("signature", signature);
      formData.append("api_key", credentials.apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("invalidate", "true");

      const response = await fetch(
        `${CLOUDINARY_UPLOAD_URL}/${credentials.cloudName}/image/destroy`,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cloudinary destroy HTTP error: ${response.status} - ${text}`);
      }

      const result: unknown = await response.json();

      if (typeof result === "object" && result !== null && "result" in result) {
        const res = result as { result: string };
        if (res.result !== "ok") {
          throw new Error(`Delete failed: ${res.result || JSON.stringify(result)}`);
        }
      } else {
        throw new Error("Invalid response from Cloudinary destroy");
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
  publicId: string,
  timestamp: number,
  apiSecret: string,
): Promise<string> {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  // Use Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);

  // Convert buffer to hex string
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
      const signature = await generateCloudinarySignatureForResource(
        publicId,
        timestamp,
        credentials.apiSecret,
      );

      const params = new URLSearchParams({
        public_id: publicId,
        type: "upload",
        resource_type: "image",
        context: "true",
        api_key: credentials.apiKey,
        timestamp: timestamp.toString(),
        signature: signature,
      });

      const response = await fetch(
        `${CLOUDINARY_UPLOAD_URL}/${credentials.cloudName}/resources/image?${params.toString()}`,
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

async function generateCloudinarySignatureForResource(
  publicId: string,
  timestamp: number,
  apiSecret: string,
): Promise<string> {
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  // Use Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);

  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
