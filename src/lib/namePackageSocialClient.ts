import { z } from "zod";
import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "./accountRequestScope";
import { throwIfCancelled } from "./abort";
import { socialObservationSchema, type SocialObservation } from "../../shared/name-packages";

const envelope = z.object({accountId:z.string().min(1).max(200),observations:z.array(socialObservationSchema).min(1).max(5),
  requestId:z.string().regex(/^req_[A-Za-z0-9_-]{16}$/u)}).strict();
export async function checkPackageSocials(scope: AccountRequestScope, handles: string[]): Promise<SocialObservation[]> {
  const accountId = scope.accountId, signal = scope.signal;
  throwIfCancelled(signal);
  if (!accountId || !Array.isArray(handles) || handles.length < 1 || handles.length > 5
    || new Set(handles).size !== handles.length || handles.some(value => typeof value !== "string"
      || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/u.test(value) || value.includes("--"))) throw new Error("invalid_request");
  const requested = [...handles];
  const value = await accountRequest<unknown>("/api/account/name-package-social", {
    accountId,signal,method:"POST",body:{handles:requested},
  });
  throwIfCancelled(signal);
  const result = envelope.parse(value);
  assertAccountSessionOwner(result.accountId,accountId);
  if (result.observations.length !== requested.length
    || new Set(result.observations.map(item=>item.handle)).size !== requested.length
    || result.observations.some(item=>item.platform !== "github" || !requested.includes(item.handle)
      || item.sourceUrl !== `https://api.github.com/users/${item.handle}`
      || Date.parse(item.checkedAt) > Date.now() || Date.now()-Date.parse(item.checkedAt)>30*60*1000)) throw new Error("invalid_response");
  const session = await readAccountSession();
  throwIfCancelled(signal);
  if (!session || typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now()/1000) throw new Error("unauthenticated");
  assertAccountSessionOwner(session.user?.id,accountId);
  return result.observations;
}
