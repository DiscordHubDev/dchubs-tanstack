const usersRoot = ["users"] as const;
const serversRoot = ["servers"] as const;
const botsRoot = ["bots"] as const;
const adminRoot = ["admin"] as const;

export const queryKeys = {
  users: {
    all: usersRoot,
    current: () => [...usersRoot, "current"] as const,
    detail: (userId: string) => [...usersRoot, "detail", userId] as const,

    // --- 新增拆分後的 Query Keys ---
    profile: (userId: string) => [...usersRoot, "profile", userId] as const,
    profileByNameOrId: (query: string) => [...usersRoot, "profile-by-name-or-id", query] as const,
    servers: (userId: string) => [...usersRoot, "servers", userId] as const,
    bots: (userId: string) => [...usersRoot, "bots", userId] as const,
    favorites: (userId: string) => [...usersRoot, "favorites", userId] as const,
    settings: (userId: string) => [...usersRoot, "settings", userId] as const,
  },
  servers: {
    all: serversRoot,
    detail: (serverId: string) => [...serversRoot, "detail", serverId] as const,
    publish: (serverId: string) => [...serversRoot, "publish", serverId] as const,
    list: (input: {
      category: "popular" | "featured" | "new" | "voted";
      page: number;
      limit: number;
    }) => [...serversRoot, "list", input] as const,
    guilds: () => [...serversRoot, "guilds"] as const,
    filterBundle: () => [...serversRoot, "filter-bundle"] as const,
  },
  bots: {
    all: botsRoot,
    detail: (botId: string) => [...botsRoot, "detail", botId] as const,
    edit: (botId: string) => [...botsRoot, "edit", botId] as const,
    list: (input: {
      category: "popular" | "featured" | "new" | "verified" | "voted";
      page: number;
      limit: number;
    }) => [...botsRoot, "list", input] as const,
    filterBundle: () => [...botsRoot, "filter-bundle"] as const,
  },
  admin: {
    all: adminRoot,
    bots: () => [...adminRoot, "bots"] as const,
    servers: () => [...adminRoot, "servers"] as const,
    reports: () => [...adminRoot, "reports"] as const,
    dashboardCounts: () => [...adminRoot, "dashboard-counts"] as const,
    users: () => [...adminRoot, "users"] as const,
  },
} as const;
