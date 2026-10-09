import { useCallback,useEffect,useRef,useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { nativeCommerceCopy, nativePlanFeatures, nativePlanName } from "@/i18n/nativeCommerceCopy";
import type { Language } from "@/i18n/languagePreference";
import { nativeAvailable,nativeCommerceCatalog,nativeCommercePurchase,nativeCommerceRestore,nativeCommerceManage,type NativeStoreCatalog,type NativeStoreProduct } from "@/lib/nativeTransport";

function NativeStoreOffer({product,language,disabled,onPurchase}:{product:NativeStoreProduct;language:Language;disabled:boolean;onPurchase:(id:string)=>void}){
  const copy=nativeCommerceCopy(language);
  const name=nativePlanName(product.plan,language);
  const trading=product.plan==="trading";
  const action=trading?copy.tradingSubscribe:copy.buy;
  return <article data-native-plan={product.plan} data-native-product-kind={trading?"bundle":"base-plan"} className="rounded-xl border p-4 min-w-0 space-y-3" aria-labelledby={`native-plan-${product.plan}`}>
    <div className="min-w-0 break-words">
      <h3 id={`native-plan-${product.plan}`} className="text-lg font-semibold">{name}</h3>
      {trading&&<p className="text-sm text-muted-foreground">{copy.tradingBundlePrice}</p>}
      <p className="font-medium">{product.price} {copy.month}</p>
    </div>
    {trading&&<p className="text-sm leading-relaxed text-muted-foreground">{copy.tradingBundleScope}</p>}
    <h4 className="text-sm font-semibold">{copy.releasedFeatures}</h4>
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed break-words">
      {nativePlanFeatures(product.plan,language).map(feature=><li key={feature}>{feature}</li>)}
    </ul>
    {product.plan==="basic"&&<p className="text-sm text-muted-foreground">{copy.basicScope}</p>}
    {trading&&<p className="text-sm text-muted-foreground">{copy.researchLimit}</p>}
    <Button className="min-h-11 h-auto whitespace-normal w-full sm:w-auto" disabled={disabled} aria-label={`${action} · ${name}`} onClick={()=>onPurchase(product.id)}>{action}</Button>
  </article>;
}

export default function NativeCommercePanel({accountId,onChanged}:{accountId:string;onChanged:()=>Promise<void>}){
  const {language}=useLanguage();
  const copy=nativeCommerceCopy(language);
  const [catalog,setCatalog]=useState<NativeStoreCatalog|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<keyof ReturnType<typeof nativeCommerceCopy>|null>(null);
  const owner=useRef(accountId);owner.current=accountId;
  const mounted=useRef(true);
  const pending=useRef(false);
  const operationOwner=useRef(accountId);
  const load=useCallback(async()=>{
    if(!nativeAvailable||pending.current)return;
    pending.current=true;setBusy(true);setMessage(null);
    try{
      const value=await nativeCommerceCatalog(accountId);
      if(mounted.current&&owner.current===accountId)setCatalog(value);
    }catch{if(mounted.current&&owner.current===accountId)setMessage("error");}
    finally{if(mounted.current&&owner.current===accountId){pending.current=false;setBusy(false);}}
  },[accountId]);
  useEffect(()=>{
    mounted.current=true;
    // StrictMode replays effects: keep the same owner's in-flight catalog
    // request instead of starting a second system operation.
    if(operationOwner.current!==accountId){operationOwner.current=accountId;pending.current=false;setBusy(false);}
    setCatalog(null);setMessage(null);void load();
    return()=>{mounted.current=false;};
  },[load,accountId]);
  const act=async(kind:"restore"|"manage"|"purchase",id?:string)=>{
    if(pending.current)return;pending.current=true;setBusy(true);setMessage(null);
    try{
      let completedMessage: "restored"|"verified"|"no_active"|null=null;
      if(kind==="manage"){await nativeCommerceManage();}
      else if(kind==="restore"){completedMessage=await nativeCommerceRestore(accountId)==="no_active"?"no_active":"restored";}
      else{
        const result=await nativeCommercePurchase(accountId,id!);
        if(mounted.current&&owner.current===accountId)setMessage(result);
        if(result==="pending"||result==="cancelled")return;
        completedMessage=result;
      }
      if(mounted.current&&owner.current===accountId){
        await onChanged();
        if(!mounted.current||owner.current!==accountId)return;
        if(completedMessage)setMessage(completedMessage);
        const updated=await nativeCommerceCatalog(accountId);
        if(mounted.current&&owner.current===accountId)setCatalog(updated);
      }
    }catch{if(mounted.current&&owner.current===accountId)setMessage("error");}
    finally{if(mounted.current&&owner.current===accountId){pending.current=false;setBusy(false);}}
  };
  if(!nativeAvailable)return null;
  const own=catalog?.accountId===accountId?catalog:null;
  const baseProducts=own?.products.filter(product=>product.plan!=="trading")??[];
  const tradingProduct=own?.products.find(product=>product.plan==="trading");
  return <section className="rounded-2xl border border-border bg-card p-5 space-y-4 min-w-0" aria-labelledby="native-store-heading">
    <h2 id="native-store-heading" className="text-xl font-semibold">{copy.title}</h2>
    <p className="text-sm text-muted-foreground">{copy.intro}</p>
    {busy&&!own&&<p role="status">{copy.loading}</p>}
    {own&&!own.enabled&&<p>{copy.unavailable}</p>}
    {own?.enabled&&<>
      {!own.purchasesEnabled&&<p>{copy.paused}</p>}
      {!!baseProducts.length&&<section className="space-y-3" aria-labelledby="native-base-plans-heading">
        <h3 id="native-base-plans-heading" className="text-lg font-semibold">{copy.basePlans}</h3>
        {baseProducts.map(product=><NativeStoreOffer key={product.id} product={product} language={language} disabled={busy||!own.purchasesEnabled} onPurchase={id=>void act("purchase",id)} />)}
      </section>}
      {tradingProduct&&<section className="space-y-3" aria-labelledby="native-trading-addon-heading">
        <h3 id="native-trading-addon-heading" className="text-lg font-semibold">{copy.tradingAddon}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.tradingEligibility}</p>
        <NativeStoreOffer product={tradingProduct} language={language} disabled={busy||!own.purchasesEnabled} onPurchase={id=>void act("purchase",id)} />
      </section>}
      {!!own.products.length&&<p className="text-sm leading-relaxed text-muted-foreground">{copy.standardLimits}</p>}
      <p className="text-sm text-muted-foreground">{copy.terms}</p>
      <p className="text-sm text-muted-foreground">{copy.account}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="underline min-h-11 inline-flex items-center" to="/legal#privacy">{copy.privacy}</Link>
        <Link className="underline min-h-11 inline-flex items-center" to="/legal#terms">{copy.legal}</Link>
      </div>
      <Button className="min-h-11 h-auto whitespace-normal" variant="outline" disabled={busy} onClick={()=>void act("restore")}>{copy.restore}</Button>
    </>}
    <div className="flex flex-wrap gap-3">
      <Button className="min-h-11 h-auto whitespace-normal max-w-full" variant="outline" disabled={busy} onClick={()=>void act("manage")}>{copy.manage}</Button>
      <Button className="min-h-11 h-auto whitespace-normal" variant="ghost" disabled={busy} onClick={()=>void load()}>{copy.retry}</Button>
    </div>
    {message&&<p role={message==="error"?"alert":"status"} className="text-sm break-words">{copy[message]}</p>}
  </section>;
}
