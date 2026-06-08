import { Megaphone, X } from "lucide-react";
import { useState } from "react";

interface AnnouncementProps {
	content: string;
	linkText?: string;
	linkHref?: string;
	/** 可根據網站主題切換顏色，預設為 indigo 漸層 */
	theme?: "amber" | "indigo";
}

export function GlobalAnnouncement({
	content,
	linkText,
	linkHref,
	theme = "indigo",
}: AnnouncementProps) {
	const [isVisible, setIsVisible] = useState(true);
	const [isRendered, setIsRendered] = useState(true);

	// 處理平滑關閉動畫
	const handleClose = () => {
		setIsVisible(false);
		// 等待 Tailwind 轉場動畫結束後再將 DOM 移除 (300ms)
		setTimeout(() => setIsRendered(false), 300);
	};

	if (!isRendered) return null;

	// 主題配色設定
	const themeClasses = {
		amber:
			"bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 text-white",
		indigo:
			"bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 text-white",
	};

	return (
		<div
			className={`
        relative flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8 
        transition-all duration-300 ease-in-out z-50 sticky top-0 shadow-md overflow-hidden
        ${themeClasses[theme]}
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full"}
      `}
		>
			{/* 裝飾性背景光暈/雜訊 (可選) */}
			<div className="absolute inset-0 bg-white/10 mix-blend-overlay pointer-events-none" />

			{/* 公告內容區 */}
			<div className="flex flex-1 items-center justify-center gap-x-3 text-sm font-medium leading-6">
				<Megaphone
					className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-white/90"
					aria-hidden="true"
				/>
				<div className="flex flex-col sm:flex-row sm:items-center gap-x-2">
					<p>{content}</p>
					{linkText && linkHref && (
						<a
							href={linkHref}
							className="inline-flex items-center whitespace-nowrap font-semibold underline decoration-white/50 underline-offset-4 hover:decoration-white transition-all"
						>
							{linkText}{" "}
							<span aria-hidden="true" className="ml-1">
								&rarr;
							</span>
						</a>
					)}
				</div>
			</div>

			{/* 關閉按鈕 */}
			<div className="flex flex-shrink-0 items-center justify-end">
				<button
					type="button"
					onClick={handleClose}
					className="-m-1.5 p-1.5 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
					aria-label="Close announcement"
				>
					<X className="h-5 w-5 text-white" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
