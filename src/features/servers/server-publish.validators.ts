import type { Schema } from "effect";
import { effectInputValidator, toErrorMessage } from "#/lib/effect-utils";

export type EffectValidatorMessages = {
  label?: string;
  required?: string;
  invalidType?: string;
  minLength?: {
    value: number;
    message?: string;
  };
  maxLength?: {
    value: number;
    message?: string;
  };
  fallback?: string;
};

function formatFallbackMessage(rawMessage: string, label?: string): string {
  if (rawMessage.includes("Expected string")) {
    return label ? `${label}格式不正確` : "輸入格式不正確";
  }

  if (
    rawMessage.includes("minLength(") ||
    rawMessage.includes("maxLength(") ||
    rawMessage.includes("From side refinement failure")
  ) {
    return label ? `${label}格式不正確` : "輸入格式不正確";
  }

  return rawMessage;
}

export function effectValidator<A, I>(
  schema: Schema.Schema<A, I, never>,
  messages: EffectValidatorMessages = {},
) {
  const decode = effectInputValidator(schema);

  return (value: unknown): string | undefined => {
    if (typeof value === "string") {
      if (messages.required && value.length === 0) {
        return messages.required;
      }

      if (messages.minLength && value.length < messages.minLength.value) {
        return (
          messages.minLength.message ??
          (messages.label
            ? `${messages.label}至少需要 ${messages.minLength.value} 個字元`
            : `至少需要 ${messages.minLength.value} 個字元`)
        );
      }

      if (messages.maxLength && value.length > messages.maxLength.value) {
        return (
          messages.maxLength.message ??
          (messages.label
            ? `${messages.label}最多只能 ${messages.maxLength.value} 個字元`
            : `最多只能 ${messages.maxLength.value} 個字元`)
        );
      }
    }

    if (
      messages.invalidType &&
      value !== null &&
      typeof value !== "string" &&
      !Array.isArray(value)
    ) {
      return messages.invalidType;
    }

    try {
      decode(value);
      return undefined;
    } catch (error) {
      if (messages.fallback) {
        return messages.fallback;
      }

      const rawMessage = toErrorMessage(error);
      return formatFallbackMessage(rawMessage, messages.label);
    }
  };
}
