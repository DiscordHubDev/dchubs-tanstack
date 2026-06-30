import { Data } from "effect";

export class InvalidInviteUrl extends Data.TaggedError("InvalidInviteUrl")<{
  url: string;
}> {}

export class BotAlreadyExists extends Data.TaggedError("BotAlreadyExists")<{
  id: string;
}> {}

export class DiscordRpcFailed extends Data.TaggedError("DiscordRpcFailed")<{
  status: number;
}> {}

export class SubmitBotFailed extends Data.TaggedError("SubmitBotFailed")<{
  message: string;
}> {}

export class NotificationFailed extends Data.TaggedError("NotificationFailed")<{
  readonly message: string;
}> {}

export class ImageUploadFailed extends Data.TaggedError("ImageUploadFailed")<{
  filename: string;
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  message: string;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  cause: unknown;
}> {}
export class BotNotFoundError extends Data.TaggedError("BotNotFoundError")<{
  botName: string;
}> {}
export class InvalidJsonError extends Data.TaggedError("InvalidJsonError")<{
  cause: unknown;
}> {}
