import { z } from "zod";
import { accountRequest } from "@/integrations/neon/auth";
import type { AccountRequestScope } from "@/lib/accountRequestScope";

const timestamp = z.string().datetime({ offset: true });
const appSessionSchema = z.object({ id: z.string().uuid(), createdAt: timestamp, expiresAt: timestamp }).strict();
const pageSchema = z.object({
  accountId: z.string().min(1).max(200), items: z.array(appSessionSchema).max(25),
  nextCursor: z.string().min(1).max(512).nullable(), currentSessionId: z.string().uuid().nullable(),
  requestId: z.string().max(200),
});
export type AppSession = z.infer<typeof appSessionSchema>;
export type AppSessionPage = z.infer<typeof pageSchema>;

export async function listAppSessions(scope: AccountRequestScope, cursor: string | null = null): Promise<AppSessionPage> {
  const result = pageSchema.parse(await accountRequest<unknown>(`/api/account/app-sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, scope));
  if (result.accountId !== scope.accountId || new Set(result.items.map(item => item.id)).size !== result.items.length
    || (result.nextCursor !== null && result.items.length === 0)) throw new Error("App sessions could not be verified.");
  return result;
}

export async function revokeAppSession(id: string, scope: AccountRequestScope): Promise<void> {
  z.string().uuid().parse(id);
  const value = z.object({ ok: z.literal(true), accountId: z.string(), requestId: z.string().max(200) })
    .parse(await accountRequest<unknown>("/api/account/app-sessions", { ...scope, method: "DELETE", body: { id } }));
  if (value.accountId !== scope.accountId) throw new Error("App session revocation could not be verified.");
}
