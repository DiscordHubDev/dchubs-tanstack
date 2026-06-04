#!/bin/bash

# 確保遇到錯誤時立即停止執行
set -e

echo "⏳ 正在讀取環境變數..."
if [ -f .env ]; then
  # 支援包含特殊字元的環境變數讀取
  export $(dotenv_config 2>/dev/null || grep -v '^#' .env | xargs -d '\n')
fi

# 檢查 DATABASE_URL 是否存在
if [ -z "$DATABASE_URL" ]; then
  echo "❌ 錯誤: 未偵測到 DATABASE_URL 環境變數。"
  exit 1
fi

echo "📦 1. 開始比對 Schema 並產生 Migration 檔案 (drizzle-kit)..."
bunx drizzle-kit generate

echo "🚀 2. 使用自訂腳本將 Migration 同步至遠端資料庫 (Bun)..."
bun ./src/scripts/migrate-debug.ts

echo "✅ 所有同步操作已成功完成！"