import { createServerFn } from "@tanstack/react-start";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
  ServerBannerUploadSchema,
  ServerPublishInputSchema,
  ServerPublishSubmitSchema,
} from "./server-publish.schemas";
import {
  getServerPublishBundleById,
  uploadServerBanner,
  upsertServerPublish,
} from "./server-publish.server";

export const getServerPublishBundleFn = createServerFn({ method: "GET" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(ServerPublishInputSchema))
  .handler(async ({ data, context }) => {
    return getServerPublishBundleById(data.serverId, context.user);
  });

export const upsertServerPublishFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(ServerPublishSubmitSchema))
  .handler(async ({ data, context }) => {
    return upsertServerPublish(data, context.user);
  });

export const uploadServerBannerFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(ServerBannerUploadSchema))
  .handler(async ({ data, context }) => {
    return uploadServerBanner(data, context.user);
  });
