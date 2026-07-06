"use client";

import type { ImgHTMLAttributes } from "react";
import * as React from "react";
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeExternalLinks from "rehype-external-links";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { OptimizedImage } from "./OptimizedImage";

type Props = {
  content: string;
};

// ==========================================
// 1. 輔助元件與函數 (SafeIframe, SafeImage)
// ==========================================

const parseSafeUrl = (raw?: string) => {
  if (!raw) return null;
  try {
    const u = new URL(
      raw,
      typeof window !== "undefined" ? window.location.origin : "https://example.com",
    );
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
};

const mapPerms = (perms?: string) => {
  const set = new Set(
    (perms || "").split(/[,\s]+/).flatMap((s) => {
      const trimmed = s.trim().toLowerCase();
      return trimmed ? [trimmed] : [];
    }),
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
      <div className="rounded bg-black/20 p-4 text-sm text-gray-300">
        無法嵌入（只允許 http/https）。
        {src && (
          <div className="mt-2 break-all">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
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
      className={`my-4 aspect-video w-full overflow-hidden rounded-lg border border-white/10 ${className || ""}`}
    >
      <iframe
        src={url.toString()}
        title={title || `Embedded content`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={sandbox || undefined}
        allow=""
        className="h-full w-full border-0"
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
      <div className="rounded bg-black/20 p-4 text-center text-gray-400">
        圖片載入失敗：缺少圖片來源
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded bg-black/20 p-4 text-center text-gray-400">
        <div>圖片載入失敗</div>
        <div className="mt-1 break-all text-xs text-gray-500">{src}</div>
      </div>
    );
  }

  return (
    <div className="my-4 text-center">
      {isLoading && (
        <div className="animate-pulse rounded bg-black/20 p-4 text-gray-400">載入圖片中...</div>
      )}
      <OptimizedImage
        {...props}
        src={src}
        alt={alt || "圖片"}
        width={800}
        height={450}
        className="mx-auto h-auto max-w-full rounded shadow-lg"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        style={{ display: isLoading ? "none" : "block" }}
      />
    </div>
  );
};

// 帶有複製按鈕的程式碼區塊元件
const PreWithCopy = ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = () => {
    if (preRef.current) {
      navigator.clipboard.writeText(preRef.current.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group relative my-4">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded bg-black/40 px-2 py-1 text-xs text-gray-300 opacity-0 transition-opacity hover:bg-black/60 hover:text-white group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  );
};

// ==========================================
// 2. Error Boundary
// ==========================================

class MarkdownErrorBoundary extends React.Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <p className="mb-2 text-sm text-red-300">Markdown 內容無法完整解析，已改為純文字顯示。</p>
          <pre className="whitespace-pre-wrap break-words text-sm text-gray-300">
            {this.props.content}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==========================================
// 3. 主渲染元件
// ==========================================

export default function MarkdownRenderer({ content }: Props) {
  const normalizedContent =
    typeof (content as any).toWellFormed === "function" ? (content as any).toWellFormed() : content;

  // 定義 rehype-sanitize 允許的白名單（補上 checkbox 與 iframe 權限）
  const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "iframe", "input"],
    attributes: {
      ...defaultSchema.attributes,
      "*": ["className", "id", "style"],
      a: [...(defaultSchema.attributes?.a || []), "target", "rel"],
      iframe: ["src", "title", "width", "height", "allow", "loading", "data-perms"],
      input: ["type", "checked", "disabled"],
      li: [...(defaultSchema.attributes?.li || []), "className"],
    },
  };

  return (
    // 使用 Tailwind Typography (prose) 來接管大部分的排版，搭配 modifiers 微調深色模式細節
    <div
      className="
        prose
        prose-invert max-w-none text-base text-gray-300
        prose-headings:scroll-mt-20 
        prose-p:break-words prose-td:break-words prose-li:break-words
        prose-pre:overflow-x-auto prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/20
        prose-code:rounded prose-code:bg-black/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
      "
    >
      <MarkdownErrorBoundary content={normalizedContent}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[
            rehypeRaw,
            rehypeSlug,
            [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
            [rehypeSanitize, sanitizeSchema],
          ]}
          components={{
            img: ({ node: _node, ...props }) => <SafeImage {...(props as SafeImageProps)} />,
            iframe: ({ node: _node, ...props }) => <SafeIframe {...(props as SafeIframeProps)} />,

            a: ({ node: _node, children, ...props }) => (
              <a
                className="text-xl font-bold text-blue-400 underline decoration-blue-400/40 underline-offset-4 transition-colors hover:text-blue-300 hover:decoration-blue-300"
                {...props}
              >
                {children}
              </a>
            ),

            // 拷貝按鈕的程式碼區塊
            pre: ({ children, ...props }) => <PreWithCopy {...props}>{children}</PreWithCopy>,

            // 處理 GFM 任務清單的 li 排版
            li: ({ className, children, ...props }) => {
              const isTask = className?.includes("task-list-item");
              return (
                <li
                  className={`${className || ""} ${isTask ? "list-none flex items-start gap-2 ml-[-1.5em]" : ""}`}
                  {...props}
                >
                  {children}
                </li>
              );
            },

            // 處理 GFM 任務清單的 checkbox 樣式 (融合 Discord 風格)
            input: ({ type, className, ...props }) => {
              if (type === "checkbox") {
                return (
                  <input
                    type="checkbox"
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-white/20 bg-black/20 text-blue-500 focus:ring-blue-500 focus:ring-offset-transparent"
                    {...props}
                  />
                );
              }
              return <input type={type} className={className} {...props} />;
            },

            // =============== 專為 bg-[#2b2d31] 打造的絕佳表格樣式 ===============
            table: ({ children, ...props }) => (
              <div className="not-prose my-6 w-full overflow-x-auto rounded-lg border border-white/10 bg-black/10 shadow-sm">
                <table
                  className="w-full min-w-[500px] border-collapse text-sm text-gray-300"
                  {...props}
                >
                  {children}
                </table>
              </div>
            ),
            thead: ({ children, ...props }) => (
              <thead className="bg-black/20 text-gray-200" {...props}>
                {children}
              </thead>
            ),
            tbody: ({ children, ...props }) => (
              <tbody className="divide-y divide-white/5" {...props}>
                {children}
              </tbody>
            ),
            tr: ({ children, ...props }) => (
              <tr className="transition-colors hover:bg-white/[0.03]" {...props}>
                {children}
              </tr>
            ),
            th: ({ children, ...props }) => (
              <th className="px-4 py-3 text-left font-semibold tracking-wide" {...props}>
                {children}
              </th>
            ),
            td: ({ children, ...props }) => (
              <td className="px-4 py-3 align-top leading-relaxed" {...props}>
                {children}
              </td>
            ),
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    </div>
  );
}
