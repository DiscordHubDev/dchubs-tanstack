import type { AnyFieldApi } from "@tanstack/react-form";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { CategoryType } from "#/lib/types";

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
	categories?: CategoryType[];
	maxTags?: number;
};

export function ServerTagField({
	field,
	categories = [],
	maxTags = 8,
}: ServerTagFieldProps) {
	const [nextTag, setNextTag] = useState("");
	const tags = Array.isArray(field.state.value)
		? (field.state.value as string[])
		: [];
	const errorMessage = readFirstError(field.state.meta.errors);

	const addTag = (raw: string) => {
		const value = raw.trim();
		if (!value || tags.length >= maxTags) return;
		if (tags.some((item) => item.toLowerCase() === value.toLowerCase())) return;

		// 新增標籤並觸發欄位更新（這會觸發你的表單驗證）
		field.handleChange([...tags, value]);
		setNextTag("");
	};

	const removeTag = (value: string) => {
		// 移除標籤並觸發欄位更新（若移除到 0 個，驗證機制會自動跳出錯誤）
		field.handleChange(tags.filter((item) => item !== value));
	};

	return (
		<div className="space-y-3 text-[#dcddde]">
			<Label className="font-medium text-[#eee] text-sm">標籤 *</Label>

			<div className="flex gap-2">
				<Input
					value={nextTag}
					onBlur={field.handleBlur}
					onChange={(event) => setNextTag(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === ",") {
							event.preventDefault();
							addTag(nextTag);
						}
					}}
					placeholder="輸入標籤後按 Enter"
					disabled={tags.length >= maxTags}
					className="border-[#18191c] bg-[#202225] text-white transition-colors duration-200 placeholder:text-[#72767d] focus-visible:border-[#5865f2] focus-visible:ring-1 focus-visible:ring-[#5865f2] disabled:bg-[#2f3136] disabled:opacity-50"
				/>
				<Button
					type="button"
					onClick={() => addTag(nextTag)}
					disabled={!nextTag.trim() || tags.length >= maxTags}
					className="cursor-pointer border-transparent bg-discord text-white shadow-sm transition-all duration-200 hover:bg-discord-hover active:bg-discord disabled:cursor-not-allowed disabled:bg-[#3c45a5]/50 disabled:opacity-50"
				>
					加入
				</Button>
			</div>

			{categories.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{categories.map((category) => (
						<button
							key={category.id}
							type="button"
							onClick={() => addTag(category.name)}
							disabled={tags.length >= maxTags}
							// 按鈕本體改為深色 Discord 風格，hover 時稍微亮一點
							className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#202225] bg-[#2f3136] px-3 py-1 font-medium text-[#b9bbbe] text-xs shadow-sm transition-all duration-150 hover:scale-105 hover:bg-[#35383e] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
						>
							{/* 顏色小點點 */}
							<span
								className={`h-2 w-2 shrink-0 rounded-full ${category.color}`}
							/>

							{/* 分類文字 */}
							<span>{category.name}</span>
						</button>
					))}
				</div>
			) : null}

			{/* 標籤顯示區域 */}
			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<span
						key={tag}
						className="inline-flex items-center gap-1.5 rounded-full border border-[#202225] bg-[#2f3136] px-3 py-1 text-[#b9bbbe] text-xs transition-all duration-150 hover:bg-[#35383e] hover:text-white"
					>
						{tag}
						<button
							type="button"
							onClick={() => removeTag(tag)}
							className="group cursor-pointer rounded-full p-0.5 transition-all duration-200 hover:bg-[#ed4245]/20"
						>
							<X className="h-3 w-3 text-[#b9bbbe] transition-transform group-hover:scale-110 group-hover:text-[#ed4245]" />
						</button>
					</span>
				))}
			</div>

			{/* 修改：動態提示文字，未滿 1 個時用黃色/紅色提醒 */}
			<p
				className={`text-xs ${tags.length === 0 ? "text-[#f1c40f]" : "text-[#b9bbbe]"}`}
			>
				目前已有 {tags.length} 個標籤（最少 1 個，最多 {maxTags} 個）
			</p>

			{/* 錯誤訊息：當 tags.length === 0 且表單被觸碰（touched）或送出時，這裡會顯示最少 1 個的錯誤 */}
			{errorMessage ? (
				<p className="animate-pulse font-medium text-[#ed4245] text-sm">
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
