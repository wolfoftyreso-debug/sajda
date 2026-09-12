import { z } from "zod";
import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { throwIfCancelled } from "@/lib/abort";
import { tradingScenarioInputSchema, tradingScenarioSchema, type TradingScenarioInput, type TradingScenario } from "../../shared/trading-scenarios";

const snapshotSchema = z.object({
  accountId:z.string().min(1).max(200), requestId:z.string().regex(/^req_[A-Za-z0-9_-]{16}$/u),
  scenarios:z.array(tradingScenarioSchema).max(100),
}).strict();
export interface TradingScenariosSnapshot {accountId:string;requestId:string;scenarios:TradingScenario[]}
export class TradingScenariosError extends Error {
  constructor(readonly code:"unavailable"|"conflict"|"invalid"|"account_changed"|"unauthenticated"|"trading_required"|"limit", readonly requestId?:string) {
    super(code); this.name="TradingScenariosError";
  }
}
export function parseTradingScenariosSnapshot(value:unknown, accountId:string):TradingScenariosSnapshot {
  const parsed=snapshotSchema.safeParse(value);
  if(!parsed.success)throw new TradingScenariosError("invalid");
  if(parsed.data.accountId!==accountId)throw new TradingScenariosError("account_changed");
  if(new Set(parsed.data.scenarios.map(row=>row.id)).size!==parsed.data.scenarios.length)throw new TradingScenariosError("invalid");
  return parsed.data as TradingScenariosSnapshot;
}
async function request(scope:AccountRequestScope, scenario?:TradingScenarioInput, save=false):Promise<TradingScenariosSnapshot> {
  // Keep an immutable initiating owner even if a caller later reuses its options object.
  const accountId=scope?.accountId,signal=scope?.signal;
  try {
    throwIfCancelled(signal);
    if(typeof accountId!=="string"||!accountId.trim())throw new TradingScenariosError("unauthenticated");
    const parsed=save?tradingScenarioInputSchema.safeParse(scenario):null;
    if(parsed&&!parsed.success)throw new TradingScenariosError("invalid");
    const input=parsed?.success?parsed.data as TradingScenarioInput:null;
    const value=await accountRequest<unknown>("/api/account/trading-scenarios", {accountId,signal,
      ...(input?{method:"POST",body:{action:"save",scenario:input}}:{})});
    throwIfCancelled(signal);
    const snapshot=parseTradingScenariosSnapshot(value,accountId);
    const session=await readAccountSession();
    throwIfCancelled(signal);
    if(!session||!Number.isFinite(session.expires_at)||session.expires_at<=Date.now()/1000)throw new TradingScenariosError("unauthenticated");
    assertAccountSessionOwner(session.user?.id,accountId);
    if(input) {
      const receipt=snapshot.scenarios.find(row=>row.id===input.id);
      if(!receipt||receipt.version!==input.expectedVersion+1)throw new TradingScenariosError("invalid");
    }
    return snapshot;
  } catch(error) {
    if(signal?.aborted)throw error;
    if(error instanceof TradingScenariosError)throw error;
    const detail=(error&&typeof error==="object"?error:{}) as {status?:number;code?:string;requestId?:string};
    const code=detail.code==="account_changed"?"account_changed":detail.status===401?"unauthenticated":
      detail.status===403?"trading_required":detail.code==="scenario_limit"?"limit":detail.status===409?"conflict":
      detail.status===400?"invalid":"unavailable";
    throw new TradingScenariosError(code,typeof detail.requestId==="string" && /^req_[A-Za-z0-9_-]{16}$/u.test(detail.requestId)?detail.requestId:undefined);
  }
}
export const getTradingScenarios=(scope:AccountRequestScope)=>request(scope);
export const saveTradingScenario=(scope:AccountRequestScope,input:TradingScenarioInput)=>request(scope,input,true);
