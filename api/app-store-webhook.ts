import { z } from "zod";
import { AccountAccessError } from "./_shared/account-error.js";
import { createRequestId } from "./_shared/public-api.js";
import { nativeJson,nativeResponseHeaders,nativeFailure,type NativeRequest,type NativeResponse } from "./_shared/native-http.js";
import { nativeCommerceConfig } from "./_shared/native-commerce-config.js";
import { createNativeCommerceService } from "./_shared/native-commerce-service.js";
export const config={maxDuration:60};
export default async function handler(request:NativeRequest,response:NativeResponse){
  const requestId=createRequestId();nativeResponseHeaders(response,requestId);
  try{
    if(request.method!=="POST"){response.setHeader("Allow","POST");throw new AccountAccessError("method_not_allowed",405,"Use POST.");}
    const parsed=z.object({signedPayload:z.string().min(20).max(16000)}).strict().safeParse(await nativeJson(request));
    if(!parsed.success)throw new AccountAccessError("invalid_request",400,"Send an App Store notification.");
    const configuration=nativeCommerceConfig();
    if(!configuration)throw new AccountAccessError("app_store_not_enabled",503,"App Store notifications are not enabled.");
    const result=await createNativeCommerceService(configuration).notification(parsed.data.signedPayload);
    response.status(200).json({...result,requestId});
  }catch(error){nativeFailure(error,response,requestId);}
}
