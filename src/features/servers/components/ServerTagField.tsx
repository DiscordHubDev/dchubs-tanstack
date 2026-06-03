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
		<div className="space-y-3 text-[#dcddde]">
			<Label className="text-sm font-medium text-[#eee]">標籤</Label>

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
					className="bg-[#202225] border-[#18191c] text-white transition-colors duration-200 placeholder:text-[#72767d] focus-visible:border-[#5865f2] focus-visible:ring-1 focus-visible:ring-[#5865f2] disabled:opacity-50 disabled:bg-[#2f3136]"
				/>

				<Button
					type="button"
					onClick={() => appendTag(nextTag)}
					disabled={disabled || !nextTag.trim() || tags.length >= maxTags}
					className="bg-discord text-white border-transparent hover:bg-discord-hover active:bg-discord transition-all duration-200 shadow-sm disabled:bg-discord/50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
				>
					加入
				</Button>
			</div>

			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<Badge
						key={tag}
						variant="secondary"
						className="gap-1.5 bg-[#2f3136] hover:bg-[#35383e] text-[#b9bbbe] border border-[#202225] px-2.5 py-1 text-xs font-normal transition-all duration-150 hover:text-white"
					>
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							disabled={disabled}
							className="group cursor-pointer rounded-full p-0.5 transition-all duration-200 hover:bg-[#ed4245]/20 disabled:cursor-not-allowed"
						>
							<X className="h-3 w-3 text-[#b9bbbe] group-hover:text-[#ed4245] group-hover:scale-110 transition-transform" />
						</button>
					</Badge>
				))}
			</div>

			<p className="text-xs text-[#b9bbbe]">最多 {maxTags} 個標籤</p>

			{errorMessage ? (
				<p className="text-sm text-[#ed4245] font-medium animate-pulse">
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
