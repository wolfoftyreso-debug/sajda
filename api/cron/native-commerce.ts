import { createRequestId } from "../_shared/public-api.js";
import { nativeResponseHeaders,nativeFailure,type NativeRequest,type NativeResponse } from "../_shared/native-http.js";
import { validLostDomainsCronSecret } from "./lost-domains.js";
import { nativeCommerceConfig } from "../_shared/native-commerce-config.js";
import { createNativeCommerceService } from "../_shared/native-commerce-service.js";
export const config={maxDuration:60};
/** Bounded reconciliation endpoint. Scheduling stays off until the operator has
 * Apple credentials/products, verified notification delivery and test evidence. */
export default async function handler(request:NativeRequest,response:NativeResponse){
  const requestId=createRequestId();nativeResponseHeaders(response,requestId);
  if(request.method!=="GET"){response.setHeader("Allow","GET");response.status(405).json({code:"method_not_allowed",requestId});return;}
  if(!validLostDomainsCronSecret(request.headers.authorization,process.env.CRON_SECRET)){
    response.status(401).json({code:"authentication_required",requestId});return;
  }
  try{
    const configuration=nativeCommerceConfig();
    if(!configuration||process.env.SAJDA_APP_STORE_CRON_ENABLED!=="true"){response.status(200).json({state:"paused",requestId});return;}
    const result=await createNativeCommerceService(configuration).batch();
    response.status(200).json({state:"checked",...result,requestId});
  }catch(error){nativeFailure(error,response,requestId);}
}
