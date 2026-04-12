import type { BotCategory, PublicBot } from "./bots.types";

export const ITEMS_PER_PAGE = 10;

export function sortBotsByCategory(
	bots: PublicBot[],
	category: BotCategory,
): PublicBot[] {
	const botsCopy = [...bots];

	if (category === "popular") {
		return botsCopy.sort((a, b) => {
			if (a.pin !== b.pin) {
				return a.pin ? -1 : 1;
			}

			const aPinExpiry = a.pinExpiry ? new Date(a.pinExpiry).getTime() : 0;
			const bPinExpiry = b.pinExpiry ? new Date(b.pinExpiry).getTime() : 0;

			return bPinExpiry - aPinExpiry;
		});
	}

	if (category === "new") {
		return botsCopy.sort((a, b) => {
			const aApprovedAt = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
			const bApprovedAt = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;

			return bApprovedAt - aApprovedAt;
		});
	}

	if (category === "featured") {
		return botsCopy
			.filter((item) => item.servers >= 1000)
			.sort((a, b) => b.upvotes - a.upvotes || b.servers - a.servers);
	}

	if (category === "verified") {
		return botsCopy
			.filter((item) => item.verified)
			.sort((a, b) => {
				const aApprovedAt = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
				const bApprovedAt = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;

				return bApprovedAt - aApprovedAt;
			});
	}

	if (category === "voted") {
		return botsCopy.sort((a, b) => b.upvotes - a.upvotes);
	}

	return botsCopy;
}

export function filterBotsBySearch(
	bots: PublicBot[],
	query: string,
): PublicBot[] {
	if (!query.trim()) return bots;

	const q = query.toLowerCase();

	return bots.filter((item) => {
		return (
			item.name.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.tags.some((tag) => tag.toLowerCase().includes(q))
		);
	});
}

export function paginateBots(
	bots: PublicBot[],
	page: number,
	pageSize: number,
) {
	const total = bots.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(Math.max(page, 1), totalPages);
	const startIndex = (safePage - 1) * pageSize;

	return {
		bots: bots.slice(startIndex, startIndex + pageSize),
		total,
		totalPages,
		page: safePage,
	};
}
