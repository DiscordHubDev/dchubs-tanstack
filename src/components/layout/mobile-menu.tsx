import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { Button, buttonVariants } from "../ui/button";

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button variant="ghost" className="text-white" size="icon" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </Button>

      {isOpen && (
        <div className="absolute top-16 right-0 left-0 z-50 border-[#1e1f22] border-b bg-[#2b2d31] shadow-lg">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            <Link
              to="/"
              className={cn(
                buttonVariants({ variant: "ghost" }), // 🟢 帶入 ghost 變體
                "w-full justify-start text-white hover:bg-[#36393f]",
              )}
            >
              伺服器列表
            </Link>
            <Link
              to="/bots"
              className={cn(
                buttonVariants({ variant: "ghost" }), // 🟢 帶入 ghost 變體
                "w-full justify-start text-white hover:bg-[#36393f]",
              )}
            >
              機器人列表
            </Link>
            <Button variant="ghost" className="w-full justify-start text-white hover:bg-[#36393f]">
              新增伺服器
            </Button>
            <Button variant="ghost" className="w-full justify-start text-white hover:bg-[#36393f]">
              關於我們
            </Button>
            <Button className="mt-4 w-full bg-[#5865f2] text-white hover:bg-[#4752c4]">登入</Button>
          </div>
        </div>
      )}
    </div>
  );
}
