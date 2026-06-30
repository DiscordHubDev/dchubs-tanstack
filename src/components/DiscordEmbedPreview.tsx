import { useState } from "react";
import { Image } from "@unpic/react";
import type { CustomEmbedData } from "#/types/custom_embed";

function getInitialTimeString(): string {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `今天 ${time}`;
}

export default function DiscordEmbedPreview({ data }: { data: CustomEmbedData }) {
  const [timeString] = useState<string>(getInitialTimeString);

  return (
    <div className="flex w-full cursor-default flex-col rounded-lg bg-[#313338] py-4 text-left font-['gg_sans','Noto_Sans','Helvetica_Neue',Helvetica,Arial,sans-serif] antialiased">
      {/* 模擬單則 Discord 訊息 */}
      <div className="group relative flex px-4 py-0.5 hover:bg-[#2e3035]">
        {/* 左側大頭貼 */}
        <div className="mt-0.5 mr-4 shrink-0 cursor-pointer">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#5865F2]">
            <Image
              src={
                data.avatar_url ||
                "https://cdn.discordapp.com/avatars/1324996138251583580/14bdbdc05d5e5bb8512b84e3019c7b65.png"
              }
              alt={`${data.username || "Bot"} Icon`}
              width={40}
              height={40}
              layout="fixed"
              className="rounded-full object-cover"
            />
          </div>
        </div>

        {/* 右側訊息內容區 */}
        <div className="flex w-full min-w-0 flex-col">
          {/* 發送者與時間頭部 */}
          <div className="mb-1 flex items-center leading-[1.375rem]">
            <span className="mr-1 cursor-pointer font-medium text-[#f2f3f5] text-base hover:underline">
              {data.username || "DcHubs 投票通知"}
            </span>

            <span className="font-medium flex items-center h-[0.9375rem] rounded-[0.1875rem] bg-[#5865f2] px-[0.275rem] text-[0.625em] uppercase text-white leading-none ml-[4px] mt-[0.075em]">
              應用
            </span>

            <span className="ml-2 font-medium text-[#949ba4] text-xs">{timeString}</span>
          </div>

          {/* 訊息本體 (Message Content) */}
          {data.content && (
            <div className="mb-2 cursor-text whitespace-pre-wrap break-words text-[#dbdee1] text-[1rem] leading-[1.375rem]">
              {data.content}
            </div>
          )}

          {/* Embed 卡片 (無條件渲染，空狀態即為空 Embed) */}
          <div className="mt-1 flex max-w-[520px] overflow-hidden rounded-[4px] bg-[#2b2d31]">
            {/* 左側顏色條 */}
            <div className="w-1 shrink-0" style={{ backgroundColor: data.color || "#1e2222" }} />

            {/* py-3 確保了即使裡面沒有任何內容，空 Embed 依然會有基本的高度 */}
            <div className="flex w-full flex-col px-4 py-3">
              <div className="flex gap-4">
                <div className="flex w-full flex-col">
                  {/* Embed Author */}
                  {data.authorName && (
                    <div className="mt-1 mb-2 flex items-center space-x-2">
                      {data.authorIconUrl && (
                        <Image
                          src={data.authorIconUrl}
                          alt="author"
                          width={20}
                          height={20}
                          layout="fixed"
                          className="cursor-pointer rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "https://cdn.discordapp.com/embed/avatars/0.png";
                          }}
                        />
                      )}
                      <span className="cursor-pointer font-semibold text-[#f2f3f5] text-sm hover:underline">
                        {data.authorName}
                      </span>
                    </div>
                  )}

                  {/* Embed Title */}
                  {data.title && (
                    <div className="mt-1 mb-1">
                      <span
                        className={`font-bold text-base ${
                          data.url
                            ? "cursor-pointer text-[#00a8fc] hover:underline"
                            : "cursor-text text-[#f2f3f5]"
                        }`}
                      >
                        {data.title}
                      </span>
                    </div>
                  )}

                  {/* Embed Description */}
                  {data.description && (
                    <div className="mb-2 cursor-text whitespace-pre-wrap text-[#dbdee1] text-[14px] leading-[1.125rem]">
                      {data.description}
                    </div>
                  )}

                  {/* Embed Fields */}
                  {data.fields && data.fields.length > 0 && (
                    <div className="mt-2 mb-2 flex flex-wrap gap-x-4 gap-y-2">
                      {data.fields.map((field, i) => (
                        <div
                          // biome-ignore lint/suspicious/noArrayIndexKey: yeah
                          key={i}
                          className={field.inline ? "min-w-[120px] flex-1" : "w-full"}
                        >
                          <div className="mb-0.5 cursor-text font-bold text-[#f2f3f5] text-[14px]">
                            {field.name || "​"}
                          </div>
                          <div className="cursor-text text-[#dbdee1] text-[14px] leading-[1.125rem]">
                            {field.value || "​"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Embed Image */}
                  {data.imageUrl && (
                    <div className="mt-4">
                      <Image
                        src={data.imageUrl}
                        alt="embed"
                        width={600}
                        height={300}
                        layout="constrained"
                        className="max-h-[300px] cursor-pointer rounded-[4px] object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Embed Thumbnail */}
                {data.thumbnailUrl && (
                  <div className="mt-1 shrink-0">
                    <Image
                      src={data.thumbnailUrl}
                      alt="thumbnail"
                      width={80}
                      height={80}
                      layout="fixed"
                      className="cursor-pointer rounded-[4px] object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Embed Footer */}
              {data.footerText && (
                <div className="mt-3 flex items-center space-x-2">
                  {data.footerIconUrl && (
                    <Image
                      src={data.footerIconUrl}
                      alt="footer"
                      width={20}
                      height={20}
                      layout="fixed"
                      className="rounded-full object-cover"
                    />
                  )}
                  <span className="cursor-text font-medium text-[#dbdee1] text-[12px]">
                    {data.footerText}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
