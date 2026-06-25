import type { PublicServer, ServerCategory } from "./servers.types";

export const ITEMS_PER_PAGE = 10;

export function sortServersByCategory(
  servers: PublicServer[],
  category: ServerCategory,
): PublicServer[] {
  const serversCopy = [...servers];

  if (category === "popular") {
    const now = Date.now();

    return serversCopy.sort((a, b) => {
      const isAPinned = !!a.pin && (!a.pinExpiry || new Date(a.pinExpiry).getTime() > now);
      const isBPinned = !!b.pin && (!b.pinExpiry || new Date(b.pinExpiry).getTime() > now);

      if (isAPinned !== isBPinned) {
        return isAPinned ? -1 : 1;
      }

      if (isAPinned && isBPinned) {
        const expireA = a.pinExpiry ? new Date(a.pinExpiry).getTime() : 0;
        const expireB = b.pinExpiry ? new Date(b.pinExpiry).getTime() : 0;
        if (expireA !== expireB) {
          return expireB - expireA;
        }
      }
      return b.members - a.members;
    });
  }

  if (category === "new") {
    return serversCopy.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  if (category === "featured") {
    return serversCopy
      .filter((server) => server.members >= 1000)
      .sort((a, b) => b.upvotes - a.upvotes || b.members - a.members);
  }

  if (category === "voted") {
    return serversCopy.sort((a, b) => b.upvotes - a.upvotes);
  }

  return serversCopy;
}

export function filterServersBySearch(servers: PublicServer[], query: string): PublicServer[] {
  if (!query.trim()) return servers;

  const q = query.toLowerCase();

  return servers.filter((server) => {
    return (
      server.name.toLowerCase().includes(q) ||
      server.description.toLowerCase().includes(q) ||
      server.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
}

export function paginateServers(servers: PublicServer[], page: number, pageSize: number) {
  const total = servers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    servers: servers.slice(startIndex, startIndex + pageSize),
    total,
    totalPages,
    page: safePage,
  };
}
