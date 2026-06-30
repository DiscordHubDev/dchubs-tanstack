import type { AnyFieldApi } from "@tanstack/react-form";
import { Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

function readFirstError(errors: unknown[] | undefined): string | null {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  const first = errors[0];
  if (typeof first === "string") {
    return first;
  }

  if (first instanceof Error) {
    return first.message;
  }

  return String(first);
}

export type RulesFieldProps = {
  field: AnyFieldApi;
  disabled?: boolean;
  maxRules?: number;
};

export function RulesField({ field, disabled = false, maxRules = 10 }: RulesFieldProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const rules = Array.isArray(field.state.value) ? (field.state.value as string[]) : [];
  const errorMessage = readFirstError(field.state.meta.errors);
  const canAddRule = !disabled && rules.length < maxRules;

  const focusRuleInput = (index: number) => {
    setTimeout(() => {
      inputRefs.current[index]?.focus();
    }, 0);
  };

  const addRule = () => {
    if (!canAddRule) {
      return;
    }

    field.handleChange([...rules, ""]);
    focusRuleInput(rules.length);
  };

  const insertRuleAfter = (index: number) => {
    if (!canAddRule) {
      return;
    }

    const nextRules = [...rules.slice(0, index + 1), "", ...rules.slice(index + 1)];
    field.handleChange(nextRules);
    focusRuleInput(index + 1);
  };

  const updateRule = (index: number, value: string) => {
    field.handleChange(rules.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const removeRule = (index: number) => {
    const nextRules = rules.filter((_, itemIndex) => itemIndex !== index);
    field.handleChange(nextRules);

    if (nextRules.length === 0) {
      return;
    }

    focusRuleInput(Math.min(index, nextRules.length - 1));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>伺服器規則</Label>
        <Button
          type="button"
          onClick={addRule}
          disabled={!canAddRule}
          size="sm"
          className="cursor-pointer bg-discord text-white hover:bg-discord-hover disabled:cursor-not-allowed disabled:bg-discord/50 disabled:opacity-50"
        >
          新增規則
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-md border border-white/20 border-dashed px-3 py-3 text-[#b9bbbe] text-sm">
          尚未新增任何規則。
        </p>
      ) : (
        rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              value={rule}
              onBlur={field.handleBlur}
              onChange={(event) => updateRule(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertRuleAfter(index);
                }

                if (event.key === "Backspace" && rule.length === 0 && rules.length > 1) {
                  event.preventDefault();
                  removeRule(index);
                }
              }}
              placeholder={`規則 ${index + 1}`}
              disabled={disabled}
            />
            <Button
              type="button"
              onClick={() => removeRule(index)}
              className="bg-[#ed4245] text-white hover:bg-[#c93b3e]"
              size="icon"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}

      <p className="text-[#b9bbbe] text-xs">
        已新增 {rules.length}/{maxRules} 條規則
      </p>

      {errorMessage ? <p className="text-[#ed4245] text-sm">{errorMessage}</p> : null}
    </div>
  );
}
