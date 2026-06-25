import type { Schema } from "effect";
import type {
  ServerBannerUploadResultSchema,
  ServerBannerUploadSchema,
  ServerFormSchema,
  ServerPublishSubmitSchema,
} from "./server-publish.schemas";

export type ServerPublishFormValues = Schema.Schema.Type<typeof ServerFormSchema>;

export type ServerPublishSubmitInput = Schema.Schema.Type<typeof ServerPublishSubmitSchema>;

export type ServerBannerUploadInput = Schema.Schema.Type<typeof ServerBannerUploadSchema>;

export type ServerBannerUploadResult = Schema.Schema.Type<typeof ServerBannerUploadResultSchema>;

export type ServerPublishBundle = {
  serverId: string;
  isPublished: boolean;
  iconUrl: string | null;
  bannerUrl: string | null;
  formValues: ServerPublishFormValues;
};

export type ServerPublishResult = {
  success: boolean;
  message: string;
  serverId: string;
};
