"use client";

import type { ImgHTMLAttributes } from "react";
import * as React from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { OptimizedImage } from "./OptimizedImage";

type Props = {
  content: string;
};

// ==========================================
// 2. 輔助元件與函數
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
      <div className="rounded bg-gray-700 p-4 text-gray-300 text-sm">
        無法嵌入（只允許 http/https）。
        {src && (
          <div className="mt-2 break-all">
            <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
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
      className={`my-2 aspect-video w-full overflow-hidden rounded border border-gray-600 ${className || ""}`}
    >
      <iframe
        src={url.toString()}
        title={title || `Embedded content`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={sandbox || undefined}
        allow=""
        className="h-full w-full"
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
      <div className="rounded bg-gray-700 p-4 text-center text-gray-400">
        圖片載入失敗：缺少圖片來源
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded bg-gray-700 p-4 text-center text-gray-400">
        <div>圖片載入失敗</div>
        <div className="mt-1 break-all text-xs">{src}</div>
      </div>
    );
  }

  return (
    <div className="my-2 text-center">
      {isLoading && (
        <div className="animate-pulse rounded bg-gray-700 p-4 text-gray-400">載入圖片中...</div>
      )}
      <OptimizedImage
        {...props}
        src={src}
        alt={alt || "圖片"}
        width={800} // ✨ 提供寬度基準 (如 800)
        height={450} // ✨ 提供高度基準 (如 450，滿足 h-auto 的比例)
        className="h-auto max-w-full rounded shadow-lg"
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
const extractText = (node: React.ReactNode): string => {
  if (typeof node !== "string" && !Array.isArray(node) && !React.isValidElement(node)) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  return extractText((node.props as { children?: React.ReactNode }).children);
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

  // 🗑️ 直接把整個 componentDidUpdate 刪掉！

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-400/30 bg-red-950/20 p-4">
          <p className="mb-2 text-red-200 text-sm">Markdown 內容無法完整解析，已改為純文字顯示。</p>
          <pre className="wrap-break-word whitespace-pre-wrap text-gray-300 text-sm">
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
  const normalizedContent =
    typeof content.toWellFormed === "function" ? content.toWellFormed() : content;

  return (
    <div className="whitespace-normal text-gray-300">
      <MarkdownErrorBoundary content={normalizedContent}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[
            rehypeRaw,
            [
              rehypeSanitize,
              {
                ...defaultSchema,
                tagNames: [...(defaultSchema.tagNames || []), "iframe"],
                // 2. 設定各個標籤允許的屬性
                attributes: {
                  ...defaultSchema.attributes,
                  // 允許所有標籤帶有 className 和 id（供樣式與錨點使用）
                  "*": ["className", "id", "style"],
                  // 專門允許 iframe 擁有的安全屬性，這樣你的 SafeIframe 才能接到資料
                  iframe: [
                    "src",
                    "title",
                    "width",
                    "height",
                    "allow",
                    "loading",
                    "data-perms", // 你自訂的權限屬性
                  ],
                  // 允許超連結開啟新分頁
                  a: [...(defaultSchema.attributes?.a || []), "target", "rel"],
                },
              },
            ],
          ]}
          components={{
            img: ({ node: _node, ...props }) => <SafeImage {...(props as SafeImageProps)} />,

            iframe: ({ node: _node, ...props }) => <SafeIframe {...(props as SafeIframeProps)} />,
            h1: ({ children, ...props }) => (
              <h1
                id={customSlugify(extractText(children))}
                className="mt-3 mb-1 font-bold text-2xl"
                {...props}
              >
                {children}
              </h1>
            ),
            h2: ({ children, ...props }) => (
              <h2
                id={customSlugify(extractText(children))}
                className="mt-2 mb-1 font-semibold text-xl"
                {...props}
              >
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3
                id={customSlugify(extractText(children))}
                className="mt-2 mb-1 font-medium text-lg"
                {...props}
              >
                {children}
              </h3>
            ),
            ul: ({ children, ...props }) => (
              <ul className="my-2 list-disc space-y-1 pl-4" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="my-2 list-decimal space-y-1 pl-4" {...props}>
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
            hr: ({ ...props }) => <hr className="my-3 border-gray-600" {...props} />,
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
                  className="text-blue-400 underline transition-colors duration-200 hover:text-blue-600"
                  target={safeHref.startsWith("http") ? "_blank" : undefined}
                  rel={safeHref.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  {children}
                </a>
              );
            },
            pre: ({ children, ...props }) => (
              <pre
                className="my-2 overflow-hidden rounded-lg border border-gray-600 bg-gray-800 p-3"
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
                    className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-gray-200 text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={`${className} font-mono text-gray-200 text-sm`} {...props}>
                  {children}
                </code>
              );
            },
            table: ({ children, ...props }) => (
              <div className="my-2 overflow-hidden">
                <table className="min-w-full border border-gray-600 bg-gray-800" {...props}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children, ...props }) => (
              <th
                className="border border-gray-600 bg-gray-700 px-3 py-1.5 font-semibold"
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
                className="my-2 border-gray-400 border-l-4 py-0.5 pl-3 text-gray-300"
                {...props}
              >
                {children}
              </blockquote>
            ),
            strong: ({ children, ...props }) => (
              <strong className="font-bold text-white" {...props}>
                {children}
              </strong>
            ),
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    </div>
  );
}
