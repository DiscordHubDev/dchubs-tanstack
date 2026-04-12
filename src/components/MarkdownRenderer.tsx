"use client";

import type { ImgHTMLAttributes } from "react";
import * as React from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
	content: string;
};

// ==========================================
// 1. 字串與安全處理工具 (保留原本邏輯)
// ==========================================

const toWellFormedUtf16 = (input: string): string => {
	if (typeof input.toWellFormed === "function") {
		return input.toWellFormed();
	}

	let out = "";
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);

		if (code >= 0xd800 && code <= 0xdbff) {
			const next = input.charCodeAt(i + 1);
			if (i + 1 < input.length && next >= 0xdc00 && next <= 0xdfff) {
				out += input.charAt(i) + input.charAt(i + 1);
				i++;
			} else {
				out += "\uFFFD";
			}
			continue;
		}

		if (code >= 0xdc00 && code <= 0xdfff) {
			out += "\uFFFD";
			continue;
		}

		out += input.charAt(i);
	}

	return out;
};

const sanitizeSurrogateEntities = (input: string): string => {
	return input
		.replace(/&#(\d+);/g, (match, decimal) => {
			const value = Number(decimal);
			if (Number.isNaN(value)) return match;
			return value >= 0xd800 && value <= 0xdfff ? "&#xfffd;" : match;
		})
		.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
			const value = Number.parseInt(hex, 16);
			if (Number.isNaN(value)) return match;
			return value >= 0xd800 && value <= 0xdfff ? "&#xfffd;" : match;
		});
};

const stripScriptTags = (input: string) =>
	input.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/giu, "");

const removeUnsafeBlocks = (content: string): string => {
	let cleaned = content;
	const dangerousPatterns = [
		/<\s*script[\s\S]*?<\s*\/\s*script\s*>/giu,
		/<[^>]*\s+on\w+\s*=\s*[^>]*>/giu,
		/javascript\s*:[^\s\n]*/giu,
		/vbscript\s*:[^\s\n]*/giu,
		/livescript\s*:[^\s\n]*/giu,
		/<\s*object[\s\S]*?<\s*\/\s*object\s*>/giu,
		/<\s*embed[^>]*>/giu,
		/<\s*form[\s\S]*?<\s*\/\s*form\s*>/giu,
		/eval\s*\([^)]*\)/giu,
		/expression\s*\([^)]*\)/giu,
	];

	dangerousPatterns.forEach((pattern) => {
		cleaned = cleaned.replace(pattern, "");
	});

	return cleaned;
};

const sanitizeContent = (content: string): string => {
	let s = content
		.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/giu, "")
		.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/giu, "")
		.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
		.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*')/giu, "")
		.replace(
			/((?:href|src)\s*=\s*["']?)\s*(?:javascript|vbscript|livescript)\s*:/giu,
			"$1unsafe:",
		)
		.replace(
			/((?:href|src)\s*=\s*["']?)\s*data\s*:\s*text\/html/giu,
			"$1unsafe:text/html",
		);

	s = s.replace(/([^\n])\n(?!\n)/gu, "$1  \n");
	return s;
};

// ==========================================
// 2. 輔助元件與函數
// ==========================================

const parseSafeUrl = (raw?: string) => {
	if (!raw) return null;
	try {
		const u = new URL(
			raw,
			typeof window !== "undefined"
				? window.location.origin
				: "https://example.com",
		);
		if (!["http:", "https:"].includes(u.protocol)) return null;
		return u;
	} catch {
		return null;
	}
};

const mapPerms = (perms?: string) => {
	const set = new Set(
		(perms || "")
			.split(/[,\s]+/)
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);

	const SBOX: Record<string, string> = {
		scripts: "allow-scripts",
		forms: "allow-forms",
		popups: "allow-popups",
		presentation: "allow-presentation",
		topnav: "allow-top-navigation-by-user-activation",
	};

	const tokens = [""];
	for (const k of set) if (SBOX[k]) tokens.push(SBOX[k]);
	return tokens.join(" ").trim();
};

type SafeIframeProps = {
	src?: string;
	title?: string;
	"data-perms"?: string;
	className?: string;
};

const SafeIframe = ({ src, title, className, ...rest }: SafeIframeProps) => {
	const url = parseSafeUrl(src);

	if (!url) {
		return (
			<div className="bg-gray-700 p-4 rounded text-gray-300 text-sm">
				無法嵌入（只允許 http/https）。
				{src && (
					<div className="mt-2 break-all">
						<a
							href={src}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							{src}
						</a>
					</div>
				)}
			</div>
		);
	}

	const sandbox = mapPerms(rest["data-perms"]);

	return (
		<div
			className={`aspect-video w-full my-2 rounded overflow-hidden border border-gray-600 ${className || ""}`}
		>
			<iframe
				src={url.toString()}
				title={title || `Embedded content`}
				loading="lazy"
				referrerPolicy="strict-origin-when-cross-origin"
				sandbox={sandbox || undefined}
				allow=""
				allowFullScreen
				className="w-full h-full"
			/>
		</div>
	);
};

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement>;

const SafeImage = ({ src, alt, ...props }: SafeImageProps) => {
	const [hasError, setHasError] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	if (!src) {
		return (
			<div className="bg-gray-700 p-4 rounded text-gray-400 text-center">
				圖片載入失敗：缺少圖片來源
			</div>
		);
	}

	if (hasError) {
		return (
			<div className="bg-gray-700 p-4 rounded text-gray-400 text-center">
				<div>圖片載入失敗</div>
				<div className="text-xs mt-1 break-all">{src}</div>
			</div>
		);
	}

	return (
		<div className="my-2 text-center">
			{isLoading && (
				<div className="bg-gray-700 p-4 rounded text-gray-400 animate-pulse">
					載入圖片中...
				</div>
			)}
			<img
				{...props}
				src={src}
				alt={alt || "圖片"}
				className="max-w-full h-auto rounded shadow-lg"
				onLoad={() => setIsLoading(false)}
				onError={() => {
					setIsLoading(false);
					setHasError(true);
				}}
				style={{ display: isLoading ? "none" : "block", margin: "0 auto" }}
			/>
		</div>
	);
};

// 從 React Node 中提取純文字以產生 Slug ID
const extractText = (children: React.ReactNode): string => {
	if (typeof children === "string") return children;
	if (Array.isArray(children)) return children.map(extractText).join("");
	if (React.isValidElement(children))
		return extractText(
			(children.props as { children?: React.ReactNode }).children,
		);
	return "";
};

const customSlugify = (str: string) => {
	try {
		return encodeURIComponent(str).toLowerCase();
	} catch {
		return str.replace(/[^\w-]/gu, "").toLowerCase() || "heading";
	}
};

// ==========================================
// 3. Error Boundary
// ==========================================

type MarkdownErrorBoundaryProps = {
	content: string;
	children: React.ReactNode;
};

type MarkdownErrorBoundaryState = {
	hasError: boolean;
};

class MarkdownErrorBoundary extends React.Component<
	MarkdownErrorBoundaryProps,
	MarkdownErrorBoundaryState
> {
	state: MarkdownErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): MarkdownErrorBoundaryState {
		return { hasError: true };
	}

	componentDidUpdate(prevProps: MarkdownErrorBoundaryProps): void {
		if (this.state.hasError && prevProps.content !== this.props.content) {
			this.setState({ hasError: false });
		}
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="rounded-lg border border-red-400/30 bg-red-950/20 p-4">
					<p className="mb-2 text-sm text-red-200">
						Markdown 內容無法完整解析，已改為純文字顯示。
					</p>
					<pre className="whitespace-pre-wrap wrap-break-word text-sm text-gray-300">
						{this.props.content}
					</pre>
				</div>
			);
		}
		return this.props.children;
	}
}

// ==========================================
// 4. 主渲染元件
// ==========================================

export default function MarkdownRenderer({ content }: Props) {
	const normalizedContent = toWellFormedUtf16(content);
	const entitySafeContent = sanitizeSurrogateEntities(normalizedContent);
	const contentWithoutScript = stripScriptTags(entitySafeContent);
	const cleanedContent = removeUnsafeBlocks(contentWithoutScript);
	const formattedContent = sanitizeContent(cleanedContent);

	return (
		<div className="text-gray-300 whitespace-normal">
			<MarkdownErrorBoundary content={formattedContent}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						img: ({ node, ...props }) => (
							<SafeImage {...(props as SafeImageProps)} />
						),

						iframe: ({ node, ...props }) => (
							<SafeIframe {...(props as SafeIframeProps)} />
						),
						h1: ({ children, ...props }) => (
							<h1
								id={customSlugify(extractText(children))}
								className="text-2xl font-bold mt-3 mb-1"
								{...props}
							>
								{children}
							</h1>
						),
						h2: ({ children, ...props }) => (
							<h2
								id={customSlugify(extractText(children))}
								className="text-xl font-semibold mt-2 mb-1"
								{...props}
							>
								{children}
							</h2>
						),
						h3: ({ children, ...props }) => (
							<h3
								id={customSlugify(extractText(children))}
								className="text-lg font-medium mt-2 mb-1"
								{...props}
							>
								{children}
							</h3>
						),
						ul: ({ children, ...props }) => (
							<ul className="list-disc pl-4 space-y-1 my-2" {...props}>
								{children}
							</ul>
						),
						ol: ({ children, ...props }) => (
							<ol className="list-decimal pl-4 space-y-1 my-2" {...props}>
								{children}
							</ol>
						),
						li: ({ children, ...props }) => (
							<li className="text-sm leading-normal" {...props}>
								{children}
							</li>
						),
						p: ({ children, ...props }) => (
							<p className="mb-2 leading-normal" {...props}>
								{children}
							</p>
						),
						hr: ({ ...props }) => (
							<hr className="my-3 border-gray-600" {...props} />
						),
						a: ({ children, href, ...props }) => {
							const safeHref =
								href &&
								(href.startsWith("http://") ||
									href.startsWith("https://") ||
									href.startsWith("mailto:") ||
									href.startsWith("#") ||
									href.startsWith("/"))
									? href
									: "#";

							return (
								<a
									{...props}
									href={safeHref}
									className="text-blue-400 hover:text-blue-600 underline transition-colors duration-200"
									target={safeHref.startsWith("http") ? "_blank" : undefined}
									rel={
										safeHref.startsWith("http")
											? "noopener noreferrer"
											: undefined
									}
								>
									{children}
								</a>
							);
						},
						pre: ({ children, ...props }) => (
							<pre
								className="bg-gray-800 p-3 rounded-lg overflow-x-auto my-2 border border-gray-600"
								{...props}
							>
								{children}
							</pre>
						),
						code: ({ className, children, ...props }) => {
							const isInline = !className;
							if (isInline) {
								return (
									<code
										className="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-gray-200"
										{...props}
									>
										{children}
									</code>
								);
							}
							return (
								<code
									className={`${className} text-gray-200 font-mono text-sm`}
									{...props}
								>
									{children}
								</code>
							);
						},
						table: ({ children, ...props }) => (
							<div className="overflow-x-auto my-2">
								<table
									className="min-w-full border border-gray-600 bg-gray-800"
									{...props}
								>
									{children}
								</table>
							</div>
						),
						th: ({ children, ...props }) => (
							<th
								className="border border-gray-600 px-3 py-1.5 bg-gray-700 font-semibold"
								{...props}
							>
								{children}
							</th>
						),
						td: ({ children, ...props }) => (
							<td className="border border-gray-600 px-3 py-1.5" {...props}>
								{children}
							</td>
						),
						blockquote: ({ children, ...props }) => (
							<blockquote
								className="border-l-4 border-gray-400 pl-3 my-2 text-gray-300 py-0.5"
								{...props}
							>
								{children}
							</blockquote>
						),
					}}
				>
					{formattedContent}
				</ReactMarkdown>
			</MarkdownErrorBoundary>
		</div>
	);
}
