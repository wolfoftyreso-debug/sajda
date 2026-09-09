import { accountRequest } from "@/integrations/neon/auth";
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
  await accountRequest("/api/account/saved-domains", { ...scope, method: "POST", body: params });
}

export async function removeFromWatchlist(domain: string, scope: AccountRequestScope): Promise<void> {
  await accountRequest("/api/account/saved-domains", { ...scope, method: "DELETE", body: { domain } });
}
