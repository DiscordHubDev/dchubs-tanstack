import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, ScrollText } from "lucide-react";
import { useMemo } from "react";

const TABLE_OF_CONTENTS = [
  { id: "introduction", title: "簡介與同意條款" },
  { id: "account-auth", title: "帳號與 Discord 授權" },
  { id: "usage-rules", title: "平台使用與發布規範 (含 NSFW 移除條款)" },
  { id: "content-rights", title: "內容、版權與侵權處理" },
  { id: "disclaimer", title: "免責聲明與責任限制" },
  { id: "privacy", title: "隱私與資料蒐集" },
  { id: "changes", title: "條款修改與服務終止" },
];

export default function TermsPage() {
  const baseUrl =
    import.meta.env.VITE_SITE_URL ||
    process.env.SITE_URL ||
    process.import.meta.env.VITE_SITE_URL ||
    "http://localhost:3000";

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "DiscordHubs 服務條款",
      description: "DiscordHubs 平台的服務使用條款說明與規範。",
      url: `${baseUrl}/terms`,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "首頁",
            item: baseUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "服務條款",
            item: `${baseUrl}/terms`,
          },
        ],
      },
      isPartOf: {
        "@type": "WebSite",
        name: "DiscordHubs",
        url: baseUrl,
      },
    }),
    [baseUrl],
  );

  const jsonLdString = useMemo(() => JSON.stringify(jsonLd), [jsonLd]);

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLd
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />

      <div className="min-h-screen bg-[#1e1f22] pb-20 text-gray-300 selection:bg-[#5865f2] selection:text-white">
        <div className="border-[#1e1f22] border-b bg-[#2b2d31] py-12">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 flex justify-center">
              <ScrollText size={48} className="text-[#5865f2]" />
            </div>
            <h1 className="mb-4 font-bold text-3xl text-white md:text-4xl">
              服務條款 (Terms of Service)
            </h1>
            <p className="text-gray-400 text-lg">最後更新日期：2026 年 6 月 8 日</p>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="rounded-lg bg-[#2b2d31] p-6 shadow-lg md:p-8">
            {/* 溫馨提示卡片 */}
            <div className="mb-8 flex items-start gap-3 rounded-r-lg border-[#5865f2] border-l-4 bg-[#2b2d31] p-4">
              <AlertCircle className="mt-1 shrink-0 text-[#5865f2]" size={20} />
              <p className="text-gray-300 text-sm leading-relaxed">
                歡迎來到
                DiscordHubs！在使用我們的伺服器與機器人列表服務之前，請務必詳細閱讀以下條款。
                登入或使用本平台即表示您完全同意本文件所述之所有規範。
              </p>
            </div>

            {/* 目錄 */}
            <div className="mb-12 flex flex-col rounded-lg border border-[#36393f] bg-[#1e1f22] p-5">
              <h2 className="mb-4 font-bold text-white text-xl">目錄</h2>
              <ul className="flex flex-col gap-3">
                {TABLE_OF_CONTENTS.map((item, index) => (
                  <li key={item.id}>
                    <Link
                      to="."
                      hash={item.id}
                      className="group flex w-fit items-center text-gray-400 transition-colors duration-200 hover:text-[#5865f2]"
                    >
                      <ChevronRight
                        size={16}
                        className="mr-2 transition-transform group-hover:translate-x-1"
                      />
                      <span>
                        {index + 1}. {item.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* 條款具體內容 */}
            <div className="space-y-12">
              <section id="introduction" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  1. 簡介與同意條款
                </h3>
                <p className="leading-relaxed">
                  DiscordHubs（以下簡稱「本平台」）提供 Discord
                  伺服器與機器人的展示、搜索及列表服務。 當您透過瀏覽器存取、使用本平台或透過
                  Discord 授權登入時，即表示您已閱讀、理解並同意接受本服務條款的約束。
                  若您不同意本條款的任何部分，請立即停止使用本平台服務。
                </p>
              </section>

              <section id="account-auth" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  2. 帳號與 Discord 授權
                </h3>
                <ul className="list-disc space-y-3 pl-5">
                  <li>
                    <strong>API 授權：</strong> 本平台使用 Discord 官方 API 提供登入及獲取資料功能。
                    授權時，我們會取得您的基本公開資訊（如使用者 ID、名稱、頭像）及伺服器列表資訊。
                  </li>
                  <li>
                    <strong>帳號安全：</strong> 您有責任維護自身 Discord 帳號的安全性。
                    任何透過您帳號在本平台上進行的操作（如新增伺服器、發布機器人），皆視為您本人的行為。
                  </li>
                  <li>
                    <strong>授權撤銷：</strong> 您隨時可以至 Discord 的「使用者設定 &gt;
                    授權的應用程式」中撤銷 DiscordHubs 的存取權限，
                    但這可能導致您無法繼續使用本平台的部分或全部功能。
                  </li>
                </ul>
              </section>

              <section id="usage-rules" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  3. 平台使用與發布規範
                </h3>
                <p className="mb-3">
                  使用者在本平台上提交、宣傳的伺服器或機器人，必須嚴格遵守以下規範以及 Discord
                  官方的
                  <a
                    href="https://discord.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-1 text-[#5865f2] transition-colors hover:underline"
                  >
                    《服務條款》
                  </a>
                  與
                  <a
                    href="https://discord.com/guidelines"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-1 text-[#5865f2] transition-colors hover:underline"
                  >
                    《社群守則》
                  </a>
                  ：
                </p>
                <ul className="list-disc space-y-2 pl-5 text-gray-300">
                  <li>
                    <strong>禁止非法與惡意內容：</strong>{" "}
                    嚴禁發布涉及詐騙、惡意軟體、散佈仇恨言論、未成年人不當內容或任何違反法律的社群與機器人。
                  </li>
                  <li>
                    <strong>NSFW 誠實標註義務：</strong>{" "}
                    若您的伺服器或機器人包含任何成人、強烈暴力或其他不適宜工作場所（NSFW）之內容，
                    <strong>必須在提交時如實且明確地將其標註為 NSFW 類型</strong>
                    ，且嚴禁在我們平台上的預覽圖或公開簡介中展示露骨內容。
                  </li>
                  <li>
                    <strong>禁止濫發訊息（Spam）：</strong>{" "}
                    禁止利用自動化腳本洗版、惡意推廣或濫用平台的投票與收藏系統。
                  </li>
                  <li>
                    <strong>伺服器管理權限與編輯責任：</strong>{" "}
                    在本平台上發布、編輯或管理伺服器資訊之操作，
                    應由該伺服器之擁有者（Owner）或具備管理員權限（Administrator）之成員進行。
                    任何由上述人員對伺服器頁面所做出的更改、更新或移除行為，均視為代表該伺服器之有效授權行為。
                    若因管理員或擁有者的編輯操作（包含但不限於發布違規內容、修改為惡意連結、內部權限糾紛等）導致伺服器遭到本平台無預警下架、引起社群糾紛、或受到
                    Discord 官方懲處等任何後果，
                    <strong>本平台概不承擔任何連帶、賠償或法律責任</strong>
                    ，相關後果與損失須由該伺服器管理團隊自行承擔解決。
                  </li>
                  <li>
                    <strong>機器人開發者名單與團隊責任：</strong>{" "}
                    機器人發布者若利用平台功能將其他使用者加入「開發者列表」或設為共同協作者，
                    <strong>必須事先取得該使用者的明確同意</strong>
                    。一旦將其列入名單，該名單上任何成員對機器人頁面所進行的編輯、內容更新或狀態更改，均視為該機器人團隊的共同授權行為。
                    若因名單內任何成員之操作（如置換惡意連結、發布違規內容等）導致機器人遭本平台下架、強制移除或造成第三方損失，
                    <strong>發布者及該團隊須承擔完全之連帶責任</strong>
                    。本平台絕不介入開發團隊內部之所有權、權限或糾紛調解，亦不對團隊內部惡意破壞所衍生之後果負責。
                  </li>
                </ul>

                <p className="mt-4 border-[#ed4245] border-l-4 bg-[#232428] p-4 text-gray-300 text-sm leading-relaxed">
                  <AlertCircle size={16} className="mr-2 inline-block shrink-0 text-[#ed4245]" />
                  <strong className="text-white">【強制移除條款】</strong>
                  未能如實標註您的內容類型可能會導致嚴重後果。如果本平台管理團隊發現您的內容（如機器人或伺服器）未正確標註為
                  NSFW、試圖規避審查系統，或違反上述任何社群準則，
                  <strong className="text-[#ed4245]">
                    本平台保留在不另行通知的情況下，隨時強制將其從系統中移除、拒絕或永久刪除的權利
                  </strong>
                  。針對情節重大或重複違規者，我們得直接封鎖該使用者的帳號存取權限。
                </p>
              </section>

              <section id="content-rights" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  4. 內容與版權
                </h3>
                <p className="mb-4 leading-relaxed">
                  您提交至本平台的文字敘述、標誌、橫幅等內容，其智慧財產權仍歸您或原創作者所有。但當您將其發布至本平台時，
                  即代表您授予我們非專屬、全球性、免權利金的授權，允許我們在平台上展示、複製與推廣這些內容，以提供服務。
                  您必須確保您有權發布這些內容，且未侵犯第三方的著作權、商標或智慧財產權。
                </p>
                <p className="rounded bg-[#232428] p-3 text-gray-400 text-sm leading-relaxed">
                  <strong>侵權處理（DMCA 政策）：</strong> 本平台尊重他人智慧財產權。
                  若您為版權所有人，且發現本平台上的使用者內容侵犯了您的權利，請檢具相關證明聯繫本平台管理團隊，我們會依流程快速移除涉嫌侵權之內容。
                </p>
              </section>

              <section id="disclaimer" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  5. 免責聲明
                </h3>
                <ul className="list-disc space-y-3 pl-5">
                  <li>
                    <strong>非官方附屬聲明：</strong> DiscordHubs 是一個由社群開發者獨立營運的平台，
                    與 Discord, Inc. <strong>沒有任何官方合作、贊助或附屬關係</strong>。"Discord" 是
                    Discord, Inc. 的註冊商標。
                  </li>
                  <li>
                    <strong>第三方內容免責：</strong>{" "}
                    本平台僅提供目錄列表服務，平台上所有資料均由第三方使用者提供。
                    我們無法且不會保證使用者所加入的第三方伺服器安全性，亦不對第三方機器人的代碼安全、功能、穩定性、詐騙行為或內容品質負責。
                    您在邀請機器人或加入外部伺服器互動時，須自行承擔全數風險。若因此導致您的 Discord
                    帳號遭停權、伺服器毀損或數據遺失，本平台概不負責。
                  </li>
                  <li>
                    <strong>服務可用性：</strong> 平台依照「現況（As-is）」及「現有技術」提供服務。
                    我們不保證平台隨時無中斷、無延遲、無安全漏洞或無錯誤，且保留隨時修改、限制或中斷服務的權利。
                  </li>
                </ul>
              </section>

              <section id="privacy" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  6. 隱私與資料蒐集
                </h3>
                <p className="leading-relaxed">
                  我們尊重您的隱私。本平台僅會透過 Discord API
                  獲取維護帳號及顯示伺服器資訊所必須的資料。
                  我們承諾絕不會將您的個人資訊或伺服器數據出售給第三方廣告商。若要了解詳細的資料處理方式，請參閱我們的《隱私權政策》。
                </p>
              </section>

              <section id="changes" className="scroll-mt-8">
                <h3 className="mb-4 border-[#36393f] border-b pb-2 font-bold text-2xl text-white">
                  7. 條款修改與服務終止
                </h3>
                <p className="mb-4 leading-relaxed">
                  本平台保留隨時修改本服務條款的權利。任何重大變更將會在此頁面更新，並修改頂部的「最後更新日期」。
                  變更生效後繼續使用本平台，即視為您同意接受修改後的條款。
                </p>
                <p className="leading-relaxed">
                  <strong>管理權限與服務終止：</strong> 本平台保留隨時在 <strong>不另行通知</strong>{" "}
                  的情況下，
                  修改、變更、暫停、移除網站內特定功能、或終止營運本服務的權利。若您違反本條款、Discord
                  官方規範或任何社群守則，我們有權隨時終止您對平台的存取權。
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
