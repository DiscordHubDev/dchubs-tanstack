import { Link, useLocation } from "@tanstack/react-router"; // 1. 改引入 Link
import type { LucideIcon } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

export function NavItem({
  items,
  onSelect,
}: {
  items: {
    title: string;
    url: string; // 如果想享用 TanStack 的絕對型別安全，這裡通常會改用 FileRoutesByPath 的型別，但保持 string 最有彈性
    icon: LucideIcon;
    isActive?: boolean;
    badge?: string;
  }[];
  onSelect?: (title: string) => void;
}) {
  const { pathname } = useLocation();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const badgeDisplay =
          item.badge && !Number.isNaN(Number(item.badge)) && Number(item.badge) > 99
            ? "99+"
            : item.badge;

        const isExternal = /^https?:\/\//.test(item.url);

        // 處理點擊事件（主要給通知或 callback 使用）
        const handleSelect = () => {
          onSelect?.(item.title);
          if (pathname === item.url) {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        };

        return (
          <SidebarMenuItem className="text-nowrap px-2" key={item.title}>
            <SidebarMenuButton asChild isActive={item.isActive} className="cursor-pointer">
              {isExternal ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={handleSelect}>
                  <span className="relative flex shrink-0 items-center justify-center bg-transparent">
                    <item.icon size={16} />
                    {badgeDisplay && (
                      <span className="absolute -top-1 -right-1 min-w-4 rounded-md bg-red-500 px-1 text-center text-white text-xs">
                        {badgeDisplay}
                      </span>
                    )}
                  </span>
                  <span className="bg-transparent">{item.title}</span>
                </a>
              ) : (
                <Link to={item.url} onClick={handleSelect}>
                  <span className="relative flex shrink-0 items-center justify-center bg-transparent">
                    <item.icon size={16} />
                    {badgeDisplay && (
                      <span className="absolute -top-1 -right-1 min-w-4 rounded-md bg-red-500 px-1 text-center text-white text-xs">
                        {badgeDisplay}
                      </span>
                    )}
                  </span>
                  <span className="bg-transparent">{item.title}</span>
                </Link>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
