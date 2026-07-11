#!/usr/bin/env bash
# check-db-imports.sh
# Detect DB imports that leak outside server-only files.
#
# "Server-only" = any of:
#   • *.server.ts / *.server.tsx
#   • src/server/**
#   • src/api/**  (TanStack Start API routes)
#   • src/drizzle/** (the DB layer itself)

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
SRC_DIR="${1:-src}"   # pass a different dir as $1 if needed

# Import patterns considered "DB access"
DB_PATTERNS=(
  '~/drizzle/db'
  '@/drizzle/db'
  '#/drizzle/db'
  'drizzle-orm/bun-sql'
  '"bun"'
  "'bun'"
)

# Glob patterns for files that ARE allowed to import DB
SAFE_GLOBS=(
  '!**/*.server.ts'
  '!**/*.server.tsx'
  "!**/${SRC_DIR}/server/**"
  "!**/${SRC_DIR}/api/**"
  "!**/${SRC_DIR}/drizzle/**"
)

# ── Run ───────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${CYAN}🔍  DB import leak detector${RESET}"
echo -e "    Source : ${SRC_DIR}"
echo -e "    Patterns: ${DB_PATTERNS[*]}\n"

TOTAL=0

for pattern in "${DB_PATTERNS[@]}"; do
  # Build one rg call per pattern; exclude safe globs
  results=$(
    rg \
      --type-add 'ts:*.{ts,tsx}' \
      --type ts \
      "${SAFE_GLOBS[@]/#/--glob }" \
      --with-filename \
      --line-number \
      --no-heading \
      --color never \
      "$pattern" \
      "$SRC_DIR" 2>/dev/null || true
  )

  if [[ -n "$results" ]]; then
    echo -e "${YELLOW}  pattern: ${BOLD}${pattern}${RESET}"
    while IFS= read -r line; do
      # file:lineno:content
      file=$(echo "$line" | cut -d: -f1)
      lineno=$(echo "$line" | cut -d: -f2)
      code=$(echo "$line" | cut -d: -f3- | sed 's/^ *//')
      echo -e "  ${RED}✗${RESET}  ${file}:${lineno}"
      echo -e "       ${CYAN}${code}${RESET}"
      (( TOTAL++ )) || true
    done <<< "$results"
    echo
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
if (( TOTAL == 0 )); then
  echo -e "${GREEN}${BOLD}✅  No unsafe DB imports found.${RESET}\n"
  exit 0
else
  echo -e "${RED}${BOLD}❌  Found ${TOTAL} unsafe DB import(s).${RESET}"
  echo -e "    Move them into ${CYAN}createServerFn()${RESET} or a ${CYAN}*.server.ts${RESET} file.\n"
  exit 1
fi