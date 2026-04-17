import { createEnv } from "@t3-oss/env-core";
import { Schema } from "effect";

const UrlString = Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/));
const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const env = createEnv({
	server: {
		SERVER_URL: Schema.standardSchemaV1(Schema.UndefinedOr(UrlString)),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: Schema.standardSchemaV1(Schema.UndefinedOr(NonEmptyString)),
	},

	/**
	 * What object holds the environment variables at runtime. This is usually
	 * `process.env` or `import.meta.env`.
	 */
	runtimeEnv: import.meta.env,

	/**
	 * By default, this library will feed the environment variables directly to
	 * the configured validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), validation may flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
});
