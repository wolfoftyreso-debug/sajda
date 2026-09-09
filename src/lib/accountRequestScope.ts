export interface AccountRequestScope {
  accountId: string;
  signal?: AbortSignal;
}

/** Client-side race protection only. The API must still verify its own cookie. */
export function assertAccountSessionOwner(currentAccountId: unknown, accountId: string): void {
  if (!accountId || currentAccountId !== accountId) {
    const error = new Error("Your account changed. Reload your saved domains before trying again.");
    Object.assign(error, { code: "account_changed" });
    throw error;
  }
}

/** An immutable owner scope is carried through every page, including retries. */
export async function collectAccountPages<T>(
  request: (cursor: string | null, scope: AccountRequestScope) => Promise<{ items: T[]; nextCursor: string | null }>,
  options: AccountRequestScope,
): Promise<T[]> {
  const scope = { accountId: options.accountId, signal: options.signal };
  if (!scope.accountId) throw new Error("Sign in to load your saved domains.");
  const items: T[] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    scope.signal?.throwIfAborted();
    const page = await request(cursor, scope);
    scope.signal?.throwIfAborted();
    if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== "string")) {
      throw new Error("Your saved domains could not be loaded. Try again.");
    }
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      if (visited.has(cursor)) throw new Error("Your saved domains could not be loaded. Try again.");
      visited.add(cursor);
    }
  } while (cursor);
  return items;
}
