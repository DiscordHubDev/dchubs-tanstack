import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, Shield } from "lucide-react";

const TABLE_OF_CONTENTS = [
  { id: "introduction", title: "1. 簡介" },
  { id: "information", title: "2. 我們收集的資訊" },
  { id: "use", title: "3. 我們如何使用您的資訊" },
  { id: "sharing", title: "4. 資訊分享" },
  { id: "security", title: "5. 資料安全" },
  { id: "rights", title: "6. 您的權利" },
  { id: "cookies", title: "7. Cookie 和追蹤技術" },
  { id: "children", title: "8. 兒童隱私" },
  { id: "changes", title: "9. 政策變更" },
  { id: "contact", title: "10. 聯絡我們" },
];

const COLLECTED_INFO = [
  {
    title: "帳號資訊",
    content:
      "當您創建帳號時，我們會收集您的 Discord 用戶資訊，包括用戶名、頭像、電子郵件地址和 Discord ID。",
  },
  {
    title: "用戶內容",
    content: "您在我們平台上提交的任何內容，包括伺服器和機器人資訊、描述、圖片、評論和投票。",
  },
  {
    title: "使用資訊",
    content:
      "我們自動收集有關您如何使用我們服務的資訊，包括您訪問的頁面、點擊的連結、訪問時間和您使用的設備資訊。",
  },
  {
    title: "技術資訊",
    content: "我們可能會收集您的 IP 地址、瀏覽器類型、操作系統、設備識別碼和其他技術資訊。",
  },
];

const USER_RIGHTS = [
  { title: "訪問權", content: "您有權要求訪問我們持有的關於您的個人資訊。" },
  { title: "更正權", content: "您有權要求更正不準確或不完整的個人資訊。" },
  { title: "刪除權", content: "在某些情況下，您有權要求刪除您的個人資訊。" },
  {
    title: "拒絕權",
    content: "您有權拒絕接收我們發送的營銷性質的通信，例如促銷郵件、主動通知等。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-white">
      <div className="border-[#1e1f22] border-b bg-[#2b2d31] py-12">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 flex justify-center">
            <Shield size={48} className="text-[#5865f2]" />
          </div>
          <h1 className="mb-4 font-bold text-3xl text-white md:text-4xl">隱私權政策</h1>
          <p className="text-gray-300 text-lg">最後更新日期：2025 年 4 月 16 日</p>
        </div>
      </div>

      {/* 主要內容 */}
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg bg-[#2b2d31] p-6 shadow-lg md:p-8">
          <div className="mb-8 flex items-start gap-3 rounded-r-lg border-[#5865f2] border-l-4 bg-[#2b2d31] p-4">
            <AlertCircle className="mt-1 shrink-0 text-[#5865f2]" size={20} />
            <p className="text-gray-300 text-sm leading-relaxed">
              歡迎來到
              DiscordHubs！在使用我們的伺服器與機器人列表服務之前，請務必詳細閱讀以下條款。登入或使用本平台即表示您完全同意本文件所述之所有規範。
            </p>
          </div>
          <div className="mb-12 flex flex-col rounded-lg border border-[#36393f] bg-[#1e1f22] p-5">
            <h2 className="mb-4 font-bold text-white text-xl">目錄</h2>
            <ul className="flex flex-col gap-3">
              {TABLE_OF_CONTENTS.map((item) => (
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
                    <span>{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 隱私條款 */}
          <div className="space-y-8 text-gray-300">
            <section id="introduction">
              <h2 className="mb-4 font-bold text-2xl text-white">1. 簡介</h2>
              <p className="mb-4">
                歡迎使用
                DiscordHubs（以下簡稱「我們」、「本服務」或「本平台」）重視您的隱私。本隱私權政策說明我們如何收集、使用、披露和保護您的個人資訊。
                而用戶（簡稱「您」、「你」） 本網站由 DiscordHubs 團隊運營和維護。
              </p>
              <p>
                使用我們的服務，即表示您同意本隱私權政策中描述的做法。如果您不同意本政策的任何部分，請勿使用我們的服務。
              </p>
              <p>
                我們保留隨時修改這些條款的權利。修改後的條款將在本頁面上發布。您繼續使用本服務將被視為接受修改後的條款。
              </p>
            </section>

            <section id="information">
              <h2 className="mb-4 font-bold text-2xl text-white">2. 我們收集的資訊</h2>
              <p className="mb-4">我們可能會收集以下類型的資訊：</p>
              <div className="space-y-4">
                {/* 優化：使用 map 減少重複的卡片 UI */}
                {COLLECTED_INFO.map((info) => (
                  <div
                    key={info.title}
                    className="rounded-lg border border-[#1e1f22] bg-[#36393f] p-4"
                  >
                    <h3 className="mb-2 font-medium text-white">{info.title}</h3>
                    <p>{info.content}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="use">
              <h2 className="mb-4 font-bold text-2xl text-white">3. 我們如何使用您的資訊</h2>
              <p className="mb-4">我們使用收集的資訊用於以下目的：</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>提供、維護和改進我們的服務</li>
                <li>創建和管理您的帳號</li>
                <li>處理您的請求和回應您的問題</li>
                <li>發送服務相關通知和更新</li>
                <li>防止欺詐和濫用行為</li>
                <li>分析和監控服務的使用情況</li>
                <li>遵守法律義務</li>
              </ul>
            </section>

            <section id="sharing">
              <h2 className="mb-4 font-bold text-2xl text-white">4. 資訊分享</h2>
              <p className="mb-4">
                我們不會出售您的個人資訊。但在以下情況下，我們可能會分享您的資訊：
              </p>
              <ul className="mb-4 list-disc space-y-2 pl-6">
                <li>
                  <span className="font-medium text-white">服務提供商：</span>{" "}
                  我們可能與幫助我們提供服務的第三方服務提供商分享資訊，如雲端儲存提供商和分析服務。
                </li>
                <li>
                  <span className="font-medium text-white">法律要求：</span>{" "}
                  如果法律要求或為了回應合法請求（如搜查令或法院命令），我們可能會披露您的資訊。
                </li>
                <li>
                  <span className="font-medium text-white">保護權利：</span>{" "}
                  我們可能會分享資訊以保護我們的權利、財產或安全，以及我們的用戶或公眾的權利、財產或安全。
                </li>
                <li>
                  <span className="font-medium text-white">業務轉讓：</span>{" "}
                  如果我們參與合併、收購或資產出售或與其他平台等合作，您的資訊可能會作為交易的一部分被轉讓或使用。
                </li>
                <li>
                  <span className="font-medium text-white">公開資訊：</span>{" "}
                  您在我們平台上公開發布的任何資訊都可能被其他用戶和公眾看到。
                </li>
              </ul>
              <p>在所有情況下，我們會採取合理措施確保您的資訊得到適當保護。</p>
            </section>

            <section id="security">
              <h2 className="mb-4 font-bold text-2xl text-white">5. 資料安全</h2>
              <p className="mb-4">
                我們實施適當的技術和組織措施，以保護您的個人資訊免受意外丟失、未經授權的訪問、使用、更改或披露。
              </p>
              <p className="mb-4">
                然而，沒有任何網絡傳輸或電子存儲方法是 100%
                安全的。因此，雖然我們努力使用商業上可接受的方式保護您的個人資訊，但我們不能保證其絕對安全。
              </p>
              <div className="rounded-lg border border-[#1e1f22] bg-[#36393f] p-4">
                <h3 className="mb-2 font-medium text-white">我們的安全措施包括：</h3>
                <ul className="list-disc space-y-1 pl-6">
                  <li>使用加密技術保護數據傳輸</li>
                  <li>實施訪問控制機制</li>
                  <li>定期安全審核</li>
                  <li>安全培訓</li>
                </ul>
              </div>
            </section>

            <section id="rights">
              <h2 className="mb-4 font-bold text-2xl text-white">6. 您的權利</h2>
              <p className="mb-4">根據您所在地區的適用法律，您可能擁有以下權利：</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {USER_RIGHTS.map((right) => (
                  <div
                    key={right.title}
                    className="rounded-lg border border-[#1e1f22] bg-[#36393f] p-4"
                  >
                    <h3 className="mb-2 font-medium text-white">{right.title}</h3>
                    <p>{right.content}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4">
                如果您想行使這些權利，請通過本政策末尾提供的聯繫方式與我們聯繫。我們將在適用法律規定的時間內回應您的請求。
              </p>
            </section>

            <section id="cookies">
              <h2 className="mb-4 font-bold text-2xl text-white">7. Cookie 和追蹤技術</h2>
              <p className="mb-4">
                我們使用 Cookie 和類似的追蹤技術來收集和存儲有關您使用我們服務的資訊。Cookie
                是存儲在您設備上的小型數據文件。
              </p>
              <p className="mb-4">我們使用 Cookie 來：</p>
              <ul className="mb-4 list-disc space-y-2 pl-6">
                <li>記住您的登入狀態和偏好設置</li>
                <li>了解和保存您的使用偏好，以便在您返回時提供更好的體驗</li>
                <li>收集有關網站流量和互動的資訊</li>
                <li>監控和分析我們服務的使用情況</li>
              </ul>
              <p>
                您可以通過更改瀏覽器設置來控制 Cookie。但請注意，禁用 Cookie
                可能會影響我們服務的某些功能。
              </p>
            </section>

            <section id="children">
              <h2 className="mb-4 font-bold text-2xl text-white">8. 兒童隱私</h2>
              <p className="mb-4">
                我們的服務不面向 13 歲以下的兒童。我們不會故意收集 13
                歲以下兒童的個人資訊。如果您是父母或監護人，並且您認為您的孩子向我們提供了個人資訊，請聯繫我們，我們將採取措施從我們的系統中刪除這些資訊。
              </p>
              <div className="rounded-lg border border-[#1e1f22] bg-[#36393f] p-4">
                <p className="text-sm">
                  <span className="font-medium text-white">注意：</span> 根據 Discord
                  的服務條款，用戶必須年滿 13 歲才能使用 Discord。由於我們的服務與 Discord
                  集成，我們假設所有用戶都符合這一年齡要求。
                </p>
              </div>
            </section>

            <section id="changes">
              <h2 className="mb-4 font-bold text-2xl text-white">9. 政策變更</h2>
              <p className="mb-4">
                我們可能會不時更新本隱私權政策。我們會在本頁面上發布任何變更，並在進行重大變更時通過電子郵件或網站通知通知您。
              </p>
              <p>
                我們鼓勵您定期查看本隱私權政策，以了解我們如何保護您的資訊。您繼續使用我們的服務將被視為接受這些變更。
              </p>
            </section>

            <section id="contact">
              <h2 className="mb-4 font-bold text-2xl text-white">10. 聯絡我們</h2>
              <p className="mb-4">如果您對這些使用條款有任何問題或意見，請通過以下方式聯繫我們：</p>
              <div className="rounded-lg border border-[#1e1f22] bg-[#36393f] p-4">
                <p className="mb-2">
                  <a href="https://discord.gg/puQ9DPdG3M" target="_blank" rel="noopener noreferrer">
                    Discord群組：https://discord.gg/puQ9DPdG3M
                  </a>
                </p>
                <a href="mailto:support@dchubs.org">
                  <p className="mb-2">電子郵件：support@dchubs.org</p>
                </a>
              </div>
            </section>
          </div>

          {/* 最後更新 */}
          <div className="mt-12 border-[#1e1f22] border-t pt-6 text-center">
            <p className="text-gray-400 text-sm">本隱私權政策最後更新於 2026 年 6 月 4 日</p>
          </div>
        </div>
      </div>
    </div>
  );
}
