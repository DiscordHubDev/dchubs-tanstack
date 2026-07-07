import { Effect } from "effect";
import { getCloudinaryCredentialsEffect, getCloudinaryErrorDetails } from "#/lib/cloudinary";
import { v2 as cloudinary } from "cloudinary";

type ReportAttachmentUploadInput = {
  dataUrl: string;
  fileName: string;
};

type ReportAttachmentUploadResult = {
  url: string;
  fileName: string;
};

export function uploadReportAttachmentEffect(
  input: ReportAttachmentUploadInput,
  reportId: string,
): Effect.Effect<ReportAttachmentUploadResult, Error> {
  return Effect.gen(function* () {
    const { cloudName, apiKey, apiSecret, uploadPreset } = yield* getCloudinaryCredentialsEffect();

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    // 每張圖給獨立 public_id，避免互相覆蓋
    const publicId = `reports/${reportId}/${crypto.randomUUID()}`;

    const uploadResult = yield* Effect.tryPromise({
      try: () =>
        cloudinary.uploader.upload(input.dataUrl, {
          resource_type: "image",
          public_id: publicId,
          overwrite: false,
          unique_filename: false,
          use_filename: false,
          ...(uploadPreset ? { upload_preset: uploadPreset } : {}),
          context: {
            file_name: input.fileName,
            report_id: reportId,
          },
        }),
      catch: (error) => {
        const details = getCloudinaryErrorDetails(error);
        return new Error(`Failed to upload report attachment to Cloudinary: ${details.message}`);
      },
    });

    if (!uploadResult.secure_url) {
      return yield* Effect.fail(new Error("Cloudinary 未回傳有效的附件 URL"));
    }

    return {
      url: uploadResult.secure_url,
      fileName: input.fileName,
    };
  });
}

export function uploadReportAttachmentsEffect(
  inputs: ReportAttachmentUploadInput[],
  reportId: string,
): Effect.Effect<ReportAttachmentUploadResult[], Error> {
  return Effect.all(
    inputs.map((input) => uploadReportAttachmentEffect(input, reportId)),
    { concurrency: 3 }, // 避免同時打太多 Cloudinary 請求
  );
}
