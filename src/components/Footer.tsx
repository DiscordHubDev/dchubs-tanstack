import { Link } from "@tanstack/react-router";
import { FaDiscord, FaGithub, FaInstagram } from "react-icons/fa6";
import { cn } from "#/lib/utils";

export default function Footer({ className }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={cn("border-[#1e1f22] border-t bg-[#2b2d31] py-8", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 四欄內容 */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Logo/簡介 */}
          <div className="col-span-1">
            <h3 className="mb-4 font-semibold text-lg text-white">DiscordHubs</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              最佳的 Discord 伺服器和機器人列表平台，幫助您發現和加入有趣的社群，為伺服器增添功能。
            </p>
          </div>

          {/* 導覽連結 */}
          <div>
            <h4 className="mb-4 font-medium text-white">連結</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link to="/" className="transition-colors hover:text-white">
                  伺服器列表
                </Link>
              </li>
              <li>
                <Link to="/bots" className="transition-colors hover:text-white">
                  機器人列表
                </Link>
              </li>
              <li>
                <Link to="/protected/add-server" className="transition-colors hover:text-white">
                  新增伺服器
                </Link>
              </li>
              <li>
                <Link to="/protected/add-bot" className="transition-colors hover:text-white">
                  新增機器人
                </Link>
              </li>
            </ul>
          </div>

          {/* 資源連結 */}
          <div>
            <h4 className="mb-4 font-medium text-white">資源</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link to="/tutorial" className="transition-colors hover:text-white">
                  常見問題
                </Link>
              </li>
              <li>
                {/* TanStack Router 支援 hash 屬性，比原生 a 標籤更能保持狀態 */}
                <Link to="/tutorial" hash="faq" className="transition-colors hover:text-white">
                  使用指南
                </Link>
              </li>
              <li>
                {/* 外部連結在 TanStack Start 中同樣可以直接用 a 標籤 */}
                <a
                  href="https://docs.dchubs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  開發者文檔
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/b2NSGX2ADb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Discord 官方
                </a>
              </li>
            </ul>
          </div>

          {/* 規範 */}
          <div>
            <h4 className="mb-4 font-medium text-white">規範</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link to="/terms" className="transition-colors hover:text-white">
                  服務條款
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="transition-colors hover:text-white">
                  隱私政策
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 底部資訊 */}
        <div className="mt-8 flex flex-col items-center justify-between border-[#1e1f22] border-t pt-8 md:flex-row">
          <p className="text-center text-gray-400 text-sm md:text-left">
            © {currentYear} DiscordHubs. 保留所有權利。
          </p>
          <div className="mt-4 flex space-x-4 md:mt-0">
            {/* 社群圖標 */}
            <SocialIcon href="https://discord.gg/puQ9DPdG3M" title="Discord">
              <FaDiscord className="h-5 w-5" />
            </SocialIcon>
            <SocialIcon href="https://github.com/DiscordHubDev" title="GitHub">
              <FaGithub className="h-5 w-5" />
            </SocialIcon>
            <SocialIcon
              href="https://www.instagram.com/_dchubs_?igsh=OHJwMjNoanMzbndh"
              title="Instagram"
            >
              <FaInstagram className="h-5 w-5" />
            </SocialIcon>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-gray-400 transition-colors hover:text-white"
      aria-label={title}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
