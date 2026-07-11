import { Cause, Effect, type Either, ParseResult, pipe, Schema } from "effect";

export interface ActionResult<T = void> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export function toErrorMessage(error: unknown): string {
  if (ParseResult.isParseError(error)) {
    return ParseResult.TreeFormatter.formatErrorSync(error);
  }

  // 攔截並解開 Effect 拋出的 FiberFailure
  if (
    error !== null &&
    typeof error === "object" &&
    "_id" in error &&
    error._id === "FiberFailure"
  ) {
    // squash 會攤平 Cause，回傳最根本的錯誤物件
    const squashed = Cause.squash((error as any).cause);
    return squashed instanceof Error ? squashed.message : String(squashed);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function toError(error: unknown, fallback: string): Error {
  return new Error(`${fallback}: ${toErrorMessage(error)}`);
}

export function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect);
}

export const fromDrizzle = <A>(query: () => Promise<A>) =>
  Effect.tryPromise({
    try: query,
    catch: (e) => new Error(e instanceof Error ? e.message : "資料庫操作失敗"),
  });

/**
 * 執行 Effect 並將結果轉換為 ActionResult 格式
 */
export const toResult = <A>(effect: Effect.Effect<A, Error>): Promise<ActionResult<A>> =>
  pipe(
    effect,
    Effect.match({
      onSuccess: (data) => ({ success: true as const, data }),
      onFailure: (e) => ({ success: false as const, error: e.message }),
    }),
    Effect.runPromise,
  );

export function runEffectSafe<A, E>(effect: Effect.Effect<A, E>): Promise<Either.Either<A, E>> {
  return Effect.runPromise(Effect.either(effect));
}

export function tryEffectPromise<A>(
  fallback: string,
  run: () => Promise<A>,
): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: run,
    catch: (e) => {
      console.error(fallback, e); // ← Add this
      // Also log if it's a Drizzle error
      if (e instanceof Error) {
        console.error("Raw error:", e.message, (e as any).stack);
      }
      return toError(e, fallback);
    },
  });
}

export function effectInputValidator<A, I>(schema: Schema.Schema<A, I, never>) {
  const decode = Schema.decodeUnknownSync(schema);

  return (value: unknown): A => {
    try {
      return decode(value);
    } catch (error) {
      throw toError(error, "Invalid input");
    }
  };
}

export function fetchJsonEffect(
  input: RequestInfo | URL,
  init?: RequestInit,
): Effect.Effect<unknown, Error> {
  const urlString =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  try {
    const parsedUrl = new URL(urlString);
    if (parsedUrl.protocol !== "https:") {
      return Effect.fail(new Error("Insecure fetch usage: Only HTTPS requests are allowed"));
    }
  } catch (error) {
    return Effect.fail(toError(error, "Invalid URL format"));
  }

  return tryEffectPromise("Request failed", () => fetch(input, init)).pipe(
    Effect.flatMap((response) => {
      if (!response.ok) {
        // 嘗試讀出 body 內容（Discord 錯誤通常是 JSON，但也可能是純文字）
        return tryEffectPromise("Failed to read error body", () => response.text()).pipe(
          Effect.flatMap((bodyText) =>
            Effect.fail(
              new Error(
                `Request failed with status ${response.status}: ${bodyText || "(empty body)"}`,
              ),
            ),
          ),
          // 就算讀 body 本身失敗，也不要吞掉原本的 status code 錯誤
          Effect.catchAll(() =>
            Effect.fail(new Error(`Request failed with status ${response.status}`)),
          ),
        );
      }

      return tryEffectPromise("Failed to parse JSON body", () => response.json());
    }),
  );
}
