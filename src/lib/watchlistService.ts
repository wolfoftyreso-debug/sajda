import { accountRequest } from "@/integrations/neon/auth";
import { throwIfCancelled } from "./abort";
import { collectAccountPages, type AccountRequestScope } from "@/lib/accountRequestScope";

export interface WatchlistItem {
  id: string;
  domain: string;
  registrar_price: number;
  estimated_value: number;
  confidence_score: number;
  rationale: string | null;
  created_at: string;
}

interface AddToWatchlistParams {
  domain: string;
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  rationale: string;
}

export async function getWatchlist(scope: AccountRequestScope): Promise<WatchlistItem[]> {
  return collectAccountPages<WatchlistItem>((cursor, owner) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return accountRequest(`/api/account/saved-domains${suffix}`, owner);
  }, scope);
}

export async function addToWatchlist(params: AddToWatchlistParams, scope: AccountRequestScope): Promise<void> {
  const expectedDomain = new URL(`https://${params.domain.trim()}`).hostname;
  const payload = await accountRequest<{ ok?: unknown; item?: { id?: unknown; domain?: unknown } }>(
    "/api/account/saved-domains", { ...scope, method: "POST", body: params },
  );
  throwIfCancelled(scope.signal);
  if (payload?.ok !== true || typeof payload.item?.id !== "string" || !/^[1-9][0-9]*$/u.test(payload.item.id) ||
      payload.item.domain !== expectedDomain) {
    throw Object.assign(new Error("Your save could not be confirmed. Retry safely or check Saved."), { code: "save_not_confirmed" });
  }
}

export async function removeFromWatchlist(domain: string, scope: AccountRequestScope): Promise<void> {
  const payload = await accountRequest<{ ok?: unknown }>("/api/account/saved-domains", { ...scope, method: "DELETE", body: { domain } });
  throwIfCancelled(scope.signal);
  if (payload?.ok !== true) throw Object.assign(new Error("Removal could not be confirmed. Retry safely or reload Saved."), { code: "remove_not_confirmed" });
}
