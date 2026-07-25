import { Effect } from "effect";
import { getCloudinaryCredentialsEffect, uploadImageToCloudinary } from "#/lib/cloudinary";

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
    const credentials = yield* getCloudinaryCredentialsEffect();

    const publicId = `reports/${reportId}/${crypto.randomUUID()}`;

    const uploadResult = yield* uploadImageToCloudinary(input.dataUrl, credentials, {
      public_id: publicId,
      overwrite: false,
      unique_filename: false,
      ...(credentials.uploadPreset && { upload_preset: credentials.uploadPreset }),
      context: {
        file_name: input.fileName,
        report_id: reportId,
      },
      ...(credentials.uploadPreset && { upload_preset: credentials.uploadPreset }),
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
