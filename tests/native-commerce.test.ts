import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, X509Certificate } from "node:crypto";
import { Environment, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { nativeCommerceConfig, type NativeCommerceConfig } from "../api/_shared/native-commerce-config";
import { createNativeCommerceProvider, type NativeSubscription } from "../api/_shared/native-commerce-provider";
import { createNativeCommerceService } from "../api/_shared/native-commerce-service";
import { appleRootCertificates } from "../api/_shared/apple-root-certificates";
import { type NativeCommerceStore, type NativeCommerceIdentity, type NativeCommerceEvent } from "../api/_shared/native-commerce-store";
import { createNativeCommerceHandler } from "../api/native/commerce";
import { AccountAccessError } from "../api/_shared/account-error";

const privateKey=generateKeyPairSync("ec",{namedCurve:"prime256v1",privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}}).privateKey;
const token="13ff8c6c-6d21-49bc-9e98-8c266c7a0d8c";
const owner="synthetic-native-store-owner";
const now=Date.parse("2026-09-10T12:00:00Z");
const env={SAJDA_APP_STORE_ENABLED:"true",APP_STORE_ENVIRONMENT:"Sandbox",APP_STORE_APP_ID:"12345",
  APP_STORE_KEY_ID:"0123456789",APP_STORE_ISSUER_ID:"36a3e7ca-dd5f-42e0-a7e4-4820e6ff1db7",APP_STORE_PRIVATE_KEY:privateKey,
  APP_STORE_PRODUCTS_JSON:'{"com.hypbit.sajda.premium.monthly":"premium"}'};
const config=nativeCommerceConfig(env)!;

test("App Store stays off without activation; all configurations and environments fail closed",()=>{
  assert.equal(nativeCommerceConfig({}),null);
  assert.equal(config.purchasesEnabled,false);
  assert.equal(config.namespace,"development");
  for(const patch of [
    {APP_STORE_ENVIRONMENT:"Xcode"},{APP_STORE_ENVIRONMENT:"LocalTesting"},{APP_STORE_ENVIRONMENT:"Production"},
    {APP_STORE_PRIVATE_KEY:"invalid"},{APP_STORE_APP_ID:""},{APP_STORE_KEY_ID:"short"},{APP_STORE_ISSUER_ID:"bad"},
    {APP_STORE_PRODUCTS_JSON:'{"a.b":"unknown"}'},{APP_STORE_PRODUCTS_JSON:"{}"},
    {APP_STORE_PRODUCTS_JSON:'{"a.b":"premium","a.c":"premium"}'},
    {VERCEL:"1",VERCEL_ENV:"production"},{VERCEL:"1",VERCEL_ENV:"preview",APP_STORE_ENVIRONMENT:"Production"},
  ])assert.throws(()=>nativeCommerceConfig({...env,...patch}));
  const production=nativeCommerceConfig({...env,VERCEL:"1",VERCEL_ENV:"production",APP_STORE_ENVIRONMENT:"Production",SAJDA_APP_STORE_LIVE_ENABLED:"true"});
  assert.equal(production?.environment,Environment.PRODUCTION);
  assert.equal(production?.purchasesEnabled,false,"Live verification alone does not open purchases");
});

test("Apple verification trusts the pinned Apple root, never a caller's certificate or unsigned receipt",async()=>{
  const cert=new X509Certificate(appleRootCertificates()[0]);
  assert.equal(cert.fingerprint256,"63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79");
  const provider=createNativeCommerceProvider(config);
  await assert.rejects(provider.verifyTransaction("not.a.valid.apple.signature"));
  await assert.rejects(provider.notification("not.a.valid.apple.notification"));
});

/** Provider boundaries below are deliberately mocked: no real Apple receipt,
 * transaction, configured product or sandbox account is claimed by these tests. */
function providerFixture(){
  const transaction:JWSTransactionDecodedPayload={
    appAccountToken:token,bundleId:config.bundleId,environment:"Sandbox",productId:"com.hypbit.sajda.premium.monthly",
    transactionId:"12346",originalTransactionId:"12345",type:"Auto-Renewable Subscription",
    inAppOwnershipType:"PURCHASED",purchaseDate:now-1_000,expiresDate:now+86_400_000,signedDate:now,
  };
  const renewal:JWSRenewalInfoDecodedPayload={originalTransactionId:"12345",environment:"Sandbox",
    productId:transaction.productId,autoRenewStatus:1,signedDate:now};
  const state={transaction,renewal,status:1,fetches:0,failed:false,wrongEnvelope:false,omitAppId:false};
  const provider=createNativeCommerceProvider(config,{
    now:()=>now,
    verifier:{
      verifyAndDecodeTransaction:async()=>state.transaction,
      verifyAndDecodeRenewalInfo:async()=>state.renewal,
      verifyAndDecodeNotification:async()=>({version:"2.0",notificationUUID:"da17f0a2-aae2-46c3-afbc-558ba2f1eae1",notificationType:"DID_RENEW",
        signedDate:now,data:{...(state.omitAppId?{}:{appAppleId:12345}),bundleId:config.bundleId,environment:"Sandbox",signedTransactionInfo:"signed.transaction.fixture"}}),
    },
    fetch:async(input,options)=>{
      state.fetches++;
      assert.equal(input,"https://api.storekit-sandbox.apple.com/inApps/v1/subscriptions/12345");
      assert.equal(options?.redirect,"error");
      assert.ok(options?.signal);
      assert.match(String((options?.headers as Record<string,string>).Authorization),/^Bearer ey/u);
      if(state.failed)return new Response("temporary failure",{status:503});
      return Response.json({environment:state.wrongEnvelope?"Production":"Sandbox",bundleId:config.bundleId,...(state.omitAppId?{}:{appAppleId:12345}),
        data:[{lastTransactions:[{status:state.status,originalTransactionId:"12345",signedTransactionInfo:"signed.transaction.fixture",
          signedRenewalInfo:"signed.renewal.fixture"}]}]});
    },
  });
  return {state,provider};
}
test("Sandbox accepts omitted optional Apple app ID while retaining bundle and environment verification",async()=>{
  const {state,provider}=providerFixture();state.omitAppId=true;
  assert.equal((await provider.current("12345",token)).length,1);
  assert.equal((await provider.notification("signed.notification.fixture")).data?.bundleId,config.bundleId);
});
test("current Apple state, not client success, supplies renewal and cancellation access",async()=>{
  const {state,provider}=providerFixture();
  const active=(await provider.current("12345",token))[0];
  assert.equal(active.plan,"premium");assert.equal(active.status,1);assert.equal(active.autoRenew,true);
  state.renewal.autoRenewStatus=0;
  const canceled=(await provider.current("12345",token))[0];
  assert.equal(canceled.autoRenew,false);assert.equal(canceled.expiresAt,active.expiresAt);
  assert.equal(canceled.revokedAt,null,"Cancellation keeps the already paid period");
  state.status=5;state.transaction.revocationDate=now-10;
  assert.equal((await provider.current("12345",token))[0].revokedAt,now-10);
  state.status=2;delete state.transaction.revocationDate;
  assert.equal((await provider.current("12345",token))[0].status,2);
});
test("billing grace requires a verified renewal expiry; billing retry alone is not paid access",async()=>{
  const {state,provider}=providerFixture();
  state.status=4;
  await assert.rejects(provider.current("12345",token));
  state.renewal.gracePeriodExpiresDate=state.transaction.expiresDate!+86_400_000;
  assert.equal((await provider.current("12345",token))[0].expiresAt,state.renewal.gracePeriodExpiresDate);
  state.status=3;
  const retry=(await provider.current("12345",token))[0];
  assert.equal(retry.status,3);assert.equal(retry.expiresAt,state.transaction.expiresDate);
});
test("transaction owner, namespace, product and signed identity cannot be replaced",async()=>{
  for(const patch of [
    {appAccountToken:"ff76af7c-352c-4c14-8838-cb80a5aa3556"},{bundleId:"com.other.app"},{environment:"Production"},
    {productId:"unlisted.product"},{inAppOwnershipType:"FAMILY_SHARED"},{type:"Non-Consumable"},
    {originalTransactionId:"99999"},{transactionId:"x"},{signedDate:now+600_000},{purchaseDate:now+600_000},
  ]){
    const {state,provider}=providerFixture();Object.assign(state.transaction,patch);
    await assert.rejects(provider.current("12345",token),JSON.stringify(patch));
  }
  const {state,provider}=providerFixture();state.wrongEnvelope=true;
  await assert.rejects(provider.current("12345",token));
});
test("Apple failure cannot produce a successful reconciliation",async()=>{
  const {state,provider}=providerFixture();state.failed=true;
  await assert.rejects(provider.current("12345",token));
  assert.equal(state.fetches,1);
});

function serviceFixture(){
  const identities=new Map<string,NativeCommerceIdentity>([[owner,{ownerId:owner,accountToken:token,originalIds:["12345"],checkedAt:null}]]);
  const subscriptions=new Map<string,NativeSubscription>();
  const events=new Map<string,NativeCommerceEvent>();
  const state={busy:false,external:false,writes:0,fetches:0,providerFailure:false,revoked:false,releases:0};
  const store:NativeCommerceStore={
    identity:async(id,create)=>{if(create&&!identities.has(id))identities.set(id,{ownerId:id,accountToken:"763ba4d4-3c9d-4338-9fc1-03717e0157c9",originalIds:[],checkedAt:null});return identities.get(id)??null;},
    ownerForToken:async(value)=>[...identities.values()].find(item=>item.accountToken===value)?.ownerId??null,
    lease:async(id)=>{if(state.busy)throw Error("lease busy");state.busy=true;const item=identities.get(id);if(!item)throw Error("deleted");return {...item,leaseToken:"lease",fence:1};},
    save:async(lease,values,event)=>{if(!identities.has(lease.ownerId))throw Error("deleted");state.writes++;values.forEach(item=>subscriptions.set(item.originalId,item));if(event)events.set(event.id,event);},
    release:async(lease)=>{state.busy=false;state.releases++;const identity=identities.get(lease.ownerId);if(identity)identity.checkedAt=now;},
    event:async(event)=>{const old=events.get(event.id);if(old&&old.hash!==event.hash)throw Error("conflict");return !!old;},
    ignore:async(event)=>{events.set(event.id,event);},staleOwners:async()=>[...identities.keys()],
    externalBilling:async()=>state.external,pruneEvents:async()=>{},
    active:async()=>[...subscriptions.values()].some(item=>[1,4].includes(item.status)&&item.revokedAt===null&&item.expiresAt>now),
  };
  const {provider:realMock}=providerFixture();
  const provider={...realMock,current:async()=>{
    state.fetches++;if(state.providerFailure)throw Error("Apple down");
    return [{originalId:"12345",transactionId:"12346",productId:"com.hypbit.sajda.premium.monthly",plan:"premium" as const,
      status:state.revoked?5:1,validFrom:now-1000,expiresAt:now+86_400_000,revokedAt:state.revoked?now:null,signedAt:now,autoRenew:!state.revoked}];
  }};
  return {state,identities,subscriptions,events,service:createNativeCommerceService({...config,purchasesEnabled:true},{store,provider,now:()=>now})};
}
test("catalog cannot open a second subscription while Stripe billing is pending or active",async()=>{
  const f=serviceFixture();assert.equal((await f.service.catalog(owner)).purchasesEnabled,true);
  f.state.external=true;assert.equal((await f.service.catalog(owner)).purchasesEnabled,false);
  assert.equal(f.state.writes,0);
});
test("replay of a signed purchase to another Sajda account cannot grant access",async()=>{
  const f=serviceFixture();await f.service.catalog("another-owner");
  await assert.rejects(f.service.synchronize("another-owner","signed.transaction.fixture"));
  assert.equal(f.state.fetches,0);assert.equal(f.state.writes,0);
});
test("successful sync, renewal/refund notification, duplicate and retry maintain server authority",async()=>{
  const f=serviceFixture();
  await f.service.synchronize(owner,"signed.transaction.fixture");
  assert.equal(f.state.writes,1);assert.equal(f.subscriptions.get("12345")?.status,1);
  f.state.revoked=true;
  await f.service.notification("signed.notification.fixture");
  assert.equal(f.subscriptions.get("12345")?.status,5);
  assert.equal(f.state.writes,2);
  assert.equal((await f.service.notification("signed.notification.fixture")).duplicate,true);
  assert.equal(f.state.writes,2);
  f.state.providerFailure=true;
  await assert.rejects(f.service.synchronize(owner,"signed.transaction.fixture"));
  assert.equal(f.state.writes,2);assert.equal(f.state.busy,false);
  f.state.providerFailure=false;
  await f.service.synchronize(owner,"signed.transaction.fixture");
  assert.equal(f.state.writes,3);
});
test("a notification after deletion never recreates an account or subscription",async()=>{
  const f=serviceFixture();f.identities.delete(owner);
  const result=await f.service.notification("signed.notification.fixture");
  assert.equal(result.ignored,true);assert.equal(f.identities.size,0);
  assert.equal(f.state.writes,0);assert.equal(f.state.fetches,0);
});
test("failed membership reconciliation starts a cooldown without renewing a grant",async()=>{
  const f=serviceFixture();f.state.providerFailure=true;
  await assert.rejects(f.service.refresh(owner));
  assert.equal(f.state.fetches,1);assert.equal(f.state.writes,0);
  assert.equal(await f.service.refresh(owner),false);
  assert.equal(f.state.fetches,1,"No provider retry storm within the five-minute cooldown");
});
test("native commerce HTTP authenticates, bounds input and refuses client account replacement",async()=>{
  const session={principal:{userId:owner,credentialId:"id",environment:"development",source:"native" as const,scopes:["account:read"]},
    session:{user:{id:owner,email:"test@example.test",email_verified:true,created_at:new Date(now).toISOString(),last_sign_in_at:new Date(now).toISOString()},expires_at:Math.floor(now/1000)+3600}};
  let authorized=true;let calls=0;
  const handler=createNativeCommerceHandler({
    authorize:async()=>{if(!authorized)throw new AccountAccessError("authentication_required",401,"Sign in");return session;},
    limit:async()=>{},configuration:()=>null,
    service:(_c:NativeCommerceConfig)=>{calls++;return serviceFixture().service;},
  });
  async function request(body:unknown,method="POST"){
    let code=0;let data:unknown;const headers:Record<string,unknown>={};
    const response={setHeader:(key:string,value:string|number)=>{headers[key]=value;},status:(n:number)=>{code=n;return response;},json:(value:unknown)=>{data=value;}};
    await handler({method,headers:{"content-type":"application/json"},body},response);
    assert.equal(headers["Cache-Control"],"private, no-store");return {code,data};
  }
  assert.equal((await request({action:"catalog",accountId:owner})).code,200);
  assert.equal((await request({action:"synchronize",accountId:owner})).code,503);
  assert.equal((await request({action:"catalog",accountId:"other"})).code,409);
  assert.equal((await request({action:"catalog",accountId:owner,plan:"trading"})).code,400);
  assert.equal((await request({action:"synchronize",accountId:owner,signedTransaction:"x".repeat(20_000)})).code,413);
  assert.equal((await request({},"GET")).code,405);
  authorized=false;assert.equal((await request({action:"catalog",accountId:owner})).code,401);
  assert.equal(calls,0);
});
