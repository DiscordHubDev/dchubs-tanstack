import { createServerFn } from "@tanstack/react-start";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
  DeleteBotImageInputSchema,
  SubmitBotInputSchema,
  UploadBotImagesInputSchema,
} from "./bot-submit.schemas";
import { deleteBotImage, submitBot, uploadBotImages } from "./bot-submit.server";
import type {
  DeleteBotImageResult,
  SubmitBotResult,
  UploadBotImagesResult,
} from "./bot-submit.types";

export const submitBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(SubmitBotInputSchema))
  .handler(async ({ data }): Promise<SubmitBotResult> => {
    return submitBot(data);
  });

export const uploadBotImagesFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(UploadBotImagesInputSchema))
  .handler(async ({ data }): Promise<UploadBotImagesResult> => {
    return uploadBotImages(data);
  });

export const deleteBotImageFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(DeleteBotImageInputSchema))
  .handler(async ({ data }): Promise<DeleteBotImageResult> => {
    return deleteBotImage(data);
  });
