export default function BotLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-[#1e1f22] text-white">
      <div className="h-12 w-12 animate-spin rounded-full border-[#5865f2] border-t-2 border-b-2"></div>
      <p className="animate-breath text-gray-400 text-sm">
        正在從茫茫大海中獲取ㄐ器人的資訊，請稍候...
      </p>
    </div>
  );
}
