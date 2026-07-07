import { SubmitBotFailed } from "#/errors/bot-errors";
import { Effect } from "effect";

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getCloudinaryErrorDetails(error: unknown): {
  httpCode: number | null;
  message: string;
} {
  const topLevel = error as {
    http_code?: unknown;
    message?: unknown;
    error?: { http_code?: unknown; message?: unknown };
  };

  const nestedError = topLevel?.error;
  const httpCodeCandidate =
    typeof topLevel?.http_code === "number"
      ? topLevel.http_code
      : typeof nestedError?.http_code === "number"
        ? nestedError.http_code
        : null;

  const messageCandidate =
    typeof topLevel?.message === "string"
      ? topLevel.message
      : typeof nestedError?.message === "string"
        ? nestedError.message
        : null;

  if (messageCandidate) {
    return { httpCode: httpCodeCandidate, message: messageCandidate };
  }

  if (error instanceof Error && error.message) {
    return { httpCode: httpCodeCandidate, message: error.message };
  }

  try {
    return { httpCode: httpCodeCandidate, message: JSON.stringify(error) };
  } catch {
    return { httpCode: httpCodeCandidate, message: String(error) };
  }
}

export function getCloudinaryCredentialsEffect(): Effect.Effect<
  {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    uploadPreset: string | null;
  },
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
          message:
            "Cloudinary 環境變數未設定完整，請確認 CLOUDINARY_CLOUD_NAME、CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET",
        }),
      );
    }

    return {
      cloudName,
      apiKey,
      apiSecret,
      uploadPreset,
    };
  });
}
