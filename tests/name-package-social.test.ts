import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPackageSocialHandler } from "../api/account/name-package-social";
import { observeGithubHandle, packageSocialInputSchema } from "../api/_shared/name-package-social";
import { AccountAccessError } from "../api/_shared/account-error";
import { nativeAccountRoute } from "../api/native/account";

const instant = "2026-09-13T12:00:00.000Z";
const observation = (handle = "octocat") => ({platform:"github" as const,handle,status:"profile_found" as const,checkedAt:instant,sourceUrl:`https://api.github.com/users/${handle}`});
function response() { return {code:0,body:null as unknown,headers:{} as Record<string,string|number>,
  setHeader(k:string,v:string|number){this.headers[k]=v;},status(code:number){this.code=code;return this;},json(value:unknown){this.body=value;}}; }
const base = {method:"POST",headers:{"content-type":"application/json"},body:{handles:["octocat"]}};
test("social input is a bounded handle list, not a URL fetch primitive",()=>{
  assert.deepEqual(packageSocialInputSchema.parse({handles:[" OctoCat "]}).handles,["octocat"]);
  for(const handles of [[],["x","x"],["Octocat","octocat"],["../admin"],["https://localhost"],["evil--host"],["-name"],["a_"],["a".repeat(40)],Array(6).fill("x")]){
    assert.equal(packageSocialInputSchema.safeParse({handles}).success,false,JSON.stringify(handles));
  }
  assert.equal(packageSocialInputSchema.safeParse({handles:["x"],url:"https://internal"}).success,false);
});
test("GitHub evidence minimizes data; exact user and organization are occupied-profile observations",async()=>{
  for(const type of ["User","Organization"]){
    let calls=0;
    const value=await observeGithubHandle("octocat",{now:()=>Date.parse(instant),fetch:async(url,init)=>{
      calls++;assert.equal(url,"https://api.github.com/users/octocat");assert.equal(init?.method,"GET");assert.equal(init?.redirect,"manual");
      assert.equal(new Headers(init?.headers).has("authorization"),false);
      return Response.json({login:"Octocat",id:1,type,email:"must-not-return@example.test",bio:"private unrelated"});
    }});
    assert.equal(calls,1);assert.deepEqual(value,observation());assert.doesNotMatch(JSON.stringify(value),/email|bio|example.test/);
  }
});
test("404 is not registrable; denied, invalid, redirected and rate-limited profiles never become free",async()=>{
  const missing=await observeGithubHandle("octocat",{fetch:async()=>Response.json({message:"Not Found"},{status:404})});
  assert.equal(missing.status,"not_found");assert.equal("available" in missing,false);
  const responses=[
    Response.json({message:"rate limit"},{status:403}),Response.json({message:"rate limit"},{status:429}),
    new Response(null,{status:302,headers:{location:"http://127.0.0.1/"}}),
    new Response("404",{status:404,headers:{"content-type":"text/html"}}),
    Response.json({message:"Upstream unavailable"},{status:404}),
    Response.json({login:"someone-else",id:2,type:"User"}),
    Response.json({login:"octocat",id:"2",type:"User"}),
    Response.json({login:"octocat",id:2,type:"other"}),
    new Response("x".repeat(65_537),{headers:{"content-type":"application/json"}}),
    new Response("{broken",{headers:{"content-type":"application/json"}}),
  ];
  for(const reply of responses){
    let calls=0;
    const value=await observeGithubHandle("octocat",{fetch:async()=>{calls++;return reply;}});
    assert.equal(value.status,"unknown");assert.equal(calls,1);
  }
});
test("timeout and network failure are bounded unknowns",async()=>{
  let signal:AbortSignal|undefined;
  const value=await observeGithubHandle("octocat",{timeoutMs:5,fetch:async(_url,init)=>{signal=init?.signal as AbortSignal;return new Promise(()=>{});}});
  assert.equal(value.status,"unknown");assert.equal(signal?.aborted,true);
  const failed=await observeGithubHandle("octocat",{fetch:async()=>{throw new Error("upstream secret");}});
  assert.equal(failed.status,"unknown");assert.doesNotMatch(JSON.stringify(failed),/secret/);
});
test("social handler authenticates before inputs/provider and preserves private HTTP boundary",async()=>{
  const denied=createPackageSocialHandler({authorize:async()=>{throw new AccountAccessError("authentication_required",401,"Sign in.");},observe:async()=>{assert.fail("No provider call");}});
  const res=response();await denied(base,res);assert.equal(res.code,401);
  assert.equal(res.headers["Cache-Control"],"private, no-store");assert.equal(res.headers["X-Robots-Tag"],"noindex, nofollow");
  assert.equal(res.headers["Access-Control-Allow-Origin"],undefined);
  const method=response();await denied({...base,method:"GET"},method);assert.equal(method.code,405);
});
test("invalid requests do not spend external quota",async()=>{
  const handler=createPackageSocialHandler({authorize:async()=>({id:"owner",emailVerified:true}),quota:async()=>{assert.fail("No quota");}});
  for(const req of [{...base,query:{handle:"hidden"}},{...base,body:{handles:["../x"]}},{...base,body:"x".repeat(4097)},{...base,headers:{"content-type":"text/plain"}}]){
    const res=response();await handler(req,res);assert.ok([400,413,415].includes(res.code));
  }
});
test("quota/database failure stops calls; no raw provider/config data in error response",async()=>{
  for(const error of [new AccountAccessError("rate_limited",429,"Later"),new Error("postgres://secret")]){
    const handler=createPackageSocialHandler({authorize:async()=>({id:"owner",emailVerified:true}),quota:async()=>{throw error;},observe:async()=>{assert.fail("No external request");}});
    const res=response();await handler(base,res);assert.equal(res.code,error instanceof AccountAccessError?429:503);assert.doesNotMatch(JSON.stringify(res.body),/postgres|secret/);
  }
});
test("results preserve requested owner, names and require post-observation session",async()=>{
  let auth=0;const looked:string[]=[];let quota=0;
  const handler=createPackageSocialHandler({authorize:async()=>{auth++;return {id:"owner",emailVerified:true};},
    quota:async(owner,count)=>{assert.equal(owner,"owner");quota=count;},
    observe:async handle=>{looked.push(handle);return observation(handle);}});
  const res=response();await handler({...base,body:{handles:["octocat","github"]}},res);
  assert.equal(res.code,200);assert.equal(auth,2);assert.equal(quota,2);assert.deepEqual(looked,["octocat","github"]);
  assert.equal((res.body as {accountId:string}).accountId,"owner");
  let changed=0;const stale=createPackageSocialHandler({authorize:async()=>({id:++changed===1?"owner":"other",emailVerified:true}),quota:async()=>{},observe:async handle=>observation(handle)});
  const late=response();await stale(base,late);assert.equal(late.code,409);assert.equal("observations" in (late.body as object),false);
});
test("native transport grants the one bounded read operation without allowing URL/query/GET variants",()=>{
  assert.equal(nativeAccountRoute("/api/account/name-package-social","POST").scope,"saved:read");
  for(const [path,method] of [["/api/account/name-package-social","GET"],["/api/account/name-package-social?cursor=x","POST"],["/api/account/name-package-social/","POST"]]){
    assert.throws(()=>nativeAccountRoute(path,method));
  }
});
test("persistent quota uses bounded atomic counters and account deletion removes its identifier",()=>{
  const source=readFileSync(new URL("../api/_shared/name-package-social.ts",import.meta.url),"utf8");
  assert.match(source,/ON CONFLICT\(scope,subject_hash,window_started_at\) DO UPDATE/);
  assert.match(source,/subject_hash === accountHash \? 15 : 40/);
  assert.match(source,/date_trunc\('hour',statement_timestamp\(\)\)/);
  assert.match(source,/interval '30 days'/);
  assert.ok(source.includes("FROM account_budget WHERE request_count<=15"),"An exhausted owner cannot spend other accounts' global budget");
  const deletion=readFileSync(new URL("../api/_shared/account-deletion.ts",import.meta.url),"utf8");
  assert.ok(deletion.includes("name-package-social:${namespace}:${owner}"));
});
test("unparsed streaming requests retain their prototype iterator",async()=>{
  class Incoming {
    method="POST";headers={"content-type":"application/json"};
    async *[Symbol.asyncIterator](){yield Buffer.from('{"handles":["octocat"]}');}
  }
  const handler=createPackageSocialHandler({authorize:async()=>({id:"owner",emailVerified:true}),quota:async()=>{},observe:async handle=>observation(handle)});
  const res=response();await handler(new Incoming(),res);assert.equal(res.code,200);
});
