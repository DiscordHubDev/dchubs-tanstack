import type { AnyFieldApi } from "@tanstack/react-form";
import { X } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
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

export type ServerTagFieldProps = {
	field: AnyFieldApi;
	disabled?: boolean;
	maxTags?: number;
};

export function ServerTagField({
	field,
	disabled = false,
	maxTags = 8,
}: ServerTagFieldProps) {
	const [nextTag, setNextTag] = useState("");
	const tags = Array.isArray(field.state.value)
		? (field.state.value as string[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);

	const appendTag = (raw: string) => {
		if (disabled) {
			return;
		}

		const value = raw.trim();
		if (!value || tags.length >= maxTags) {
			return;
		}

		const duplicated = tags.some(
			(item) => item.toLocaleLowerCase() === value.toLocaleLowerCase(),
		);

		if (duplicated) {
			return;
		}

		field.handleChange([...tags, value]);
		setNextTag("");
	};

	const removeTag = (tag: string) => {
		field.handleChange(tags.filter((item) => item !== tag));
	};

	return (
		<div className="space-y-3">
			<Label>標籤</Label>

			<div className="flex gap-2">
				<Input
					value={nextTag}
					onBlur={field.handleBlur}
					onChange={(event) => setNextTag(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === ",") {
							event.preventDefault();
							appendTag(nextTag);
						}
					}}
					placeholder="輸入標籤後按 Enter"
					disabled={disabled || tags.length >= maxTags}
				/>
				<Button
					type="button"
					onClick={() => appendTag(nextTag)}
					disabled={disabled || !nextTag.trim() || tags.length >= maxTags}
					variant="outline"
				>
					加入
				</Button>
			</div>

			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<Badge key={tag} variant="secondary" className="gap-2">
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							disabled={disabled}
							className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-black/10 disabled:cursor-not-allowed"
						>
							<X className="h-3 w-3" />
						</button>
					</Badge>
				))}
			</div>

			<p className="text-xs text-[#b9bbbe]">最多 {maxTags} 個標籤</p>

			{errorMessage ? (
				<p className="text-sm text-[#ed4245]">{errorMessage}</p>
			) : null}
		</div>
	);
}
