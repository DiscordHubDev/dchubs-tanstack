import type { AnyFieldApi } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import type { EmbedFieldType } from "#/types/custom_embed";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function EmbedFieldsListField({
	field,
}: {
	field: AnyFieldApi;
}) {
	const fields = Array.isArray(field.state.value)
		? (field.state.value as EmbedFieldType[])
		: [];
	const [fieldKeys, setFieldKeys] = useState<string[]>(() =>
		fields.map(() => crypto.randomUUID()),
	);

	const addField = () => {
		if (fields.length >= 25) return toast.warn("Discord 限制最多 25 個欄位！");
		field.handleChange([...fields, { name: "", value: "", inline: false }]);
		setFieldKeys((prev) => [...prev, crypto.randomUUID()]);
	};

	const updateField = (index: number, patch: Partial<EmbedFieldType>) => {
		field.handleChange(
			fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
		);
	};

	const removeField = (index: number) => {
		field.handleChange(fields.filter((_, i) => i !== index));
		setFieldKeys((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>Fields (欄位)</Label>
				<Button
					type="button"
					onClick={addField}
					size="sm"
					className="bg-discord text-white hover:bg-discord-hover"
				>
					<Plus className="mr-1 h-4 w-4" /> 新增 Field
				</Button>
			</div>
			{fields.length === 0 ? (
				<p className="rounded-md border border-white/10 border-dashed p-3 text-[#b9bbbe] text-sm">
					尚未新增任何欄位。
				</p>
			) : (
				<div className="space-y-4">
					{fields.map((f, index) => (
						<div
							key={fieldKeys[index]}
							className="group relative space-y-3 rounded-lg border border-white/10 p-4"
						>
							<button
								type="button"
								onClick={() => removeField(index)}
								className="absolute top-2 right-2 rounded-full p-1.5 text-[#b9bbbe] transition-colors hover:bg-[#ed4245] hover:text-white"
							>
								<Trash2 size={14} />
							</button>
							<div className="grid gap-3 md:grid-cols-2">
								<div className="space-y-2">
									<Label>名稱 (Name)</Label>
									<Input
										value={f.name}
										onChange={(e) =>
											updateField(index, { name: e.target.value })
										}
										placeholder="欄位名稱"
									/>
								</div>
								<div className="space-y-2">
									<Label>數值 (Value)</Label>
									<Input
										value={f.value}
										onChange={(e) =>
											updateField(index, { value: e.target.value })
										}
										placeholder="欄位數值"
									/>
								</div>
							</div>
							<div className="flex items-center space-x-2">
								<Checkbox
									id={`inline-${index}`}
									checked={f.inline}
									onCheckedChange={(c) =>
										updateField(index, { inline: c === true })
									}
								/>
								<Label
									htmlFor={`inline-${index}`}
									className="cursor-pointer font-normal text-[#b9bbbe]"
								>
									Inline (同行顯示)
								</Label>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
