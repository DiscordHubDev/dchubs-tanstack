import { Data } from "effect";

type EmptyPayload = Record<string, never>;

export class ServerNotFoundError extends Data.TaggedError(
	"ServerNotFoundError",
)<EmptyPayload> {}
