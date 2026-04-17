type RuntimeModule = typeof import("@/lib/auth.runtime");
type AuthInstance = Awaited<ReturnType<RuntimeModule["createAuth"]>>;

let authPromise: Promise<AuthInstance> | undefined;

export async function getAuth(): Promise<AuthInstance> {
	if (!authPromise) {
		authPromise = import("@/lib/auth.runtime").then(({ createAuth }) =>
			createAuth(),
		);
	}

	return authPromise;
}
