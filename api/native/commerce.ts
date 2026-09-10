import { z } from "zod";
import { AccountAccessError } from "../_shared/account-error.js";
import { requireNativeSession, limitNative } from "../_shared/native-auth.js";
import { createRequestId } from "../_shared/public-api.js";
import { nativeJson,nativeResponseHeaders,nativeFailure,type NativeRequest,type NativeResponse } from "../_shared/native-http.js";
import { nativeCommerceConfig } from "../_shared/native-commerce-config.js";
import { createNativeCommerceService } from "../_shared/native-commerce-service.js";
export const config={maxDuration:60};
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("catalog"),accountId:z.string().min(1).max(200)}).strict(),
  z.object({action:z.literal("synchronize"),accountId:z.string().min(1).max(200),signedTransaction:z.string().min(20).max(16000).optional()}).strict(),
]);
export function createNativeCommerceHandler(deps={
  authorize:requireNativeSession,limit:limitNative,configuration:nativeCommerceConfig,service:createNativeCommerceService,
}) {
  return async(request:NativeRequest,response:NativeResponse)=>{
    const requestId=createRequestId(); nativeResponseHeaders(response,requestId);
    try {
      if(request.method!=="POST"){response.setHeader("Allow","POST");throw new AccountAccessError("method_not_allowed",405,"Use POST.");}
      const {principal}=await deps.authorize(request.headers);
      await deps.limit(principal.userId,30);
      const parsed=input.safeParse(await nativeJson(request));
      if(!parsed.success)throw new AccountAccessError("invalid_request",400,"Choose an App Store action.");
      if(parsed.data.accountId!==principal.userId)throw new AccountAccessError("account_changed",409,"Your account changed. Reload before continuing.");
      const configuration=deps.configuration();
      if(!configuration){
        if(parsed.data.action==="catalog"){response.status(200).json({enabled:false,purchasesEnabled:false,accountId:principal.userId,products:[],requestId});return;}
        throw new AccountAccessError("app_store_not_enabled",503,"App Store purchases have not been enabled.");
      }
      const service=deps.service(configuration);
      const result=parsed.data.action==="catalog" ? await service.catalog(principal.userId)
        : await service.synchronize(principal.userId,parsed.data.signedTransaction);
      response.status(200).json({...result,requestId});
    }catch(error){nativeFailure(error,response,requestId);}
  };
}
export default createNativeCommerceHandler();
