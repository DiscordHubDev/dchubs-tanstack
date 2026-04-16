import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle({
	connection: {
		connectionString: process.env.NEW_DATABASE_URL,
	},
});
