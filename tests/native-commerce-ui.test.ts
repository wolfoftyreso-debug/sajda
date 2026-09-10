import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeCommerceCopy } from "../src/i18n/nativeCommerceCopy";
import type { Language } from "../src/i18n/languagePreference";
const text=(node:ReactTestInstance):string=>node.children.map(child=>typeof child==="string"?child:text(child)).join("");
test("mounted native commerce panel localizes truthful states, uses Apple prices and fences account switches",async t=>{
  const key="__SAJDA_STORE_UI_FIXTURE__";
  const original=Object.getOwnPropertyDescriptor(globalThis,key);
  const fixture={
    language:"en" as Language,enabled:false,purchasesEnabled:false,accountId:"owner-a",catalogCalls:0,purchaseCalls:0,
    restoreCalls:0,manageCalls:0,changed:0,restoreState:"no_active",purchaseState:"pending",failure:false,
    afterChanged:null as null|(()=>Promise<void>),
    catalog:async(owner:string)=>{
      fixture.catalogCalls++;if(fixture.failure)throw Error("provider down");
      return {enabled:fixture.enabled,purchasesEnabled:fixture.purchasesEnabled,accountId:owner,
        products:fixture.enabled?[{id:"com.hypbit.sajda.premium",name:"Sajda Premium",price:"29,99 €",plan:"premium"}]:[]};
    },
    purchase:async()=>{fixture.purchaseCalls++;return fixture.purchaseState;},
    restore:async()=>{fixture.restoreCalls++;return fixture.restoreState;},
    manage:async()=>{fixture.manageCalls++;},
  };
  Object.defineProperty(globalThis,key,{configurable:true,value:fixture});
  const vite=await createServer({configFile:false,appType:"custom",
    server:{middlewareMode:true,watch:null,hmr:false,ws:false},resolve:{alias:{"@":path.resolve("src")}},
    optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:"automatic"},
    plugins:[{name:"native-commerce-test",enforce:"pre",load(id){
      const value=id.replaceAll("\\","/");
      if(value.endsWith("/src/lib/nativeTransport.ts"))return `export const nativeAvailable=true;
        export const nativeCommerceCatalog=(owner)=>globalThis.${key}.catalog(owner);
        export const nativeCommercePurchase=()=>globalThis.${key}.purchase();
        export const nativeCommerceRestore=()=>globalThis.${key}.restore();
        export const nativeCommerceManage=()=>globalThis.${key}.manage();`;
      if(value.endsWith("/src/i18n/LanguageProvider.tsx"))return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
    }}],
  });
  let renderer:ReactTestRenderer|undefined;
  try{
    const {default:Panel}=await vite.ssrLoadModule("/src/components/NativeCommercePanel.tsx");
    const changed=async()=>{fixture.changed++;await fixture.afterChanged?.();};
    async function mount(owner=fixture.accountId){
      if(renderer)await act(async()=>renderer!.unmount());
      await act(async()=>{renderer=create(h(MemoryRouter,null,h(Panel,{accountId:owner,onChanged:changed})));});
    }
    const button=(label:string)=>renderer!.root.findAllByType("button").find(node=>text(node)===label)!;
    for(const language of ["en","sv","es","fr","zh"] as Language[]){
      await t.test(`${language}: unavailable means no buy button, but Apple management remains accessible`,async()=>{
        fixture.language=language;fixture.enabled=false;fixture.purchasesEnabled=false;await mount();
        const copy=nativeCommerceCopy(language);
        assert.ok(text(renderer!.root).includes(copy.unavailable));
        assert.equal(button(copy.buy),undefined);assert.equal(button(copy.restore),undefined);
        const manage=button(copy.manage);assert.ok(manage);
        assert.match(manage.props.className,/min-h-11/);assert.match(manage.props.className,/whitespace-normal/);
        assert.equal(fixture.purchaseCalls,0);
      });
    }
    await t.test("configured monthly products show App Store price, explicit renewal and legal links",async()=>{
      fixture.language="en";fixture.enabled=true;fixture.purchasesEnabled=true;await mount();
      const all=text(renderer!.root);
      assert.ok(all.includes("29,99 €"));assert.ok(all.includes(nativeCommerceCopy("en").terms));
      assert.equal(renderer!.root.findAllByType("a").filter(node=>node.props.href.startsWith("/legal#")).length,2);
      await act(async()=>button("Subscribe").props.onClick());
      assert.equal(fixture.purchaseCalls,1);assert.equal(fixture.changed,0);
      assert.ok(text(renderer!.root).includes(nativeCommerceCopy("en").pending));
    });
    await t.test("empty restore does not claim a subscription and refreshes account and catalog",async()=>{
      fixture.restoreState="no_active";const calls=fixture.catalogCalls;
      await act(async()=>button("Restore purchases").props.onClick());
      assert.equal(fixture.restoreCalls,1);assert.equal(fixture.changed,1);
      assert.ok(fixture.catalogCalls>calls);
      assert.ok(text(renderer!.root).includes(nativeCommerceCopy("en").no_active));
    });
    await t.test("provider failure does not display success or infer a paid plan",async()=>{
      fixture.failure=true;await mount();
      assert.ok(text(renderer!.root).includes(nativeCommerceCopy("en").error));
      assert.equal(button("Subscribe"),undefined);
      assert.equal(renderer!.root.findAllByProps({role:"alert"}).length,1);
      fixture.failure=false;
    });
    await t.test("a delayed account refresh cannot restore a message onto a replacement owner",async()=>{
      fixture.accountId="owner-a";fixture.restoreState="verified";await mount();
      let release!:()=>void;
      fixture.afterChanged=()=>new Promise<void>(resolve=>{release=resolve;});
      let work:Promise<unknown>;
      await act(async()=>{work=button("Restore purchases").props.onClick();await new Promise(resolve=>setTimeout(resolve,0));});
      await act(async()=>{renderer!.update(h(MemoryRouter,null,h(Panel,{accountId:"owner-b",onChanged:changed})));});
      await act(async()=>{release();await work;});
      assert.equal(text(renderer!.root).includes(nativeCommerceCopy("en").restored),false);
      fixture.afterChanged=null;
    });
  }finally{
    if(renderer)await act(async()=>renderer!.unmount());
    await vite.close();
    if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);
  }
});
