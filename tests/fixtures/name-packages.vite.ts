import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const suffix = (id: string, file: string) => normalizePath(id.split("?")[0]).endsWith(file);
const fixture: Plugin = {
  name: "loopback-only-name-packages-fixture", enforce: "pre",
  configResolved(config) {
    if (config.command !== "serve" || config.isProduction || config.server.host !== "127.0.0.1" || config.server.port !== 8191)
      throw new Error("Name packages fixture is serve-only on 127.0.0.1:8191.");
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.startsWith("/api/")) { response.statusCode = 403; response.end("SYNTHETIC FIXTURE: real APIs are prohibited."); return; }
      if (["/", "/name-packages", "/brand-index", "/brand-index/assessment", "/auth", "/legal"].includes(request.url?.split("?")[0] ?? "")) request.url = "/name-packages-preview.html";
      next();
    });
  },
  load(id) {
    if (suffix(id, "/src/contexts/AuthContext.tsx")) return `
      export const useAuth=()=>({user:new URLSearchParams(location.search).get('state')==='guest'?null:{id:'local-name-package-fixture',email_verified:true},loading:false});`;
    if (suffix(id, "/src/contexts/ScanContext.tsx")) return `
      import {createContext,createElement,useContext,useState,useRef} from 'react';
      const Context=createContext(null),state=new URLSearchParams(location.search).get('state')||'ready';
      const receipt=()=>state==='restored'?null:new Date(Date.now()-(state==='stale'?31*60*1000:0)).toISOString();
      const candidates=tlds=>(state==='clarity'?['nordform','alviona','northfieldstudio','clearname','takennametest','unknownnametest']:['nordform','alviona','northfieldstudio']).flatMap((label,index)=>tlds.map(tld=>({domain:label+'.'+tld,status:state==='clarity'&&index>=4?(index===4?'taken':'unknown'):'available',availabilityVerified:!(state==='clarity'&&index===5),checkMethod:'rdap',checkedAt:receipt(),source:'synthetic-registry-fixture',namingScore:100})));
      const qa=window.__sajdaPackageFixture??(window.__sajdaPackageFixture={searchCalls:[],socialCalls:[],cancelled:0});
      export function ScanProvider({children}){
        const [domains,setDomains]=useState(()=>['empty','search-error'].includes(state)?[]:candidates(state==='partial'?['com']:['com','se']));
        const [resultsCheckedAt,setCheckedAt]=useState(receipt),[isScanning,setScanning]=useState(false),[lastSearchOptions,setOptions]=useState(()=>['empty','search-error'].includes(state)?null:{theme:'Synthetic founder naming fixture',tlds:['com','se'],namePackages:true});
        const generation=useRef(0);
        async function startScan(options){
          qa.searchCalls.push(structuredClone(options));const id=++generation.current;setScanning(true);setOptions(options);
          await new Promise(resolve=>setTimeout(resolve,250));if(id!==generation.current)return false;
          setScanning(false);if(state==='search-error')return false;
          setDomains(candidates(options.tlds));setCheckedAt(new Date().toISOString());return true;
        }
        function stopScan(){generation.current++;qa.cancelled++;setScanning(false);}
        return createElement(Context.Provider,{value:{domains,resultsCheckedAt,isScanning,lastSearchOptions,startScan,stopScan,requestAnonymousSearchAccess(){return{kind:'account',complete(){qa.completed=(qa.completed||0)+1;},release(){qa.released=(qa.released||0)+1;}};},freeSearchGateOpen:false,closeFreeSearchGate(){}}},children);
      }
      export const useScan=()=>useContext(Context);`;
    if (suffix(id, "/src/lib/localTestSearch.ts")) return `
      let failed=false;
      export async function runAnonymousSearch(tlds,count,theme,language,options){
        const qa=window.__sajdaPackageFixture;qa.exactCalls??=[];qa.exactCalls.push(options.domains);
        await new Promise(resolve=>setTimeout(resolve,250));
        if(options.signal.aborted)throw new Error('Aborted fixture');
        if(new URLSearchParams(location.search).get('state')==='exact-error'&&!failed){failed=true;throw new Error('Synthetic provider failure');}
        return {results:options.domains.map((domain,index)=>({domain,status:index===0?'taken':'available',authoritative:true,checkMethod:'rdap',checkedAt:new Date().toISOString(),source:'synthetic-registry-fixture',namingScore:100}))};
      }`;
    if (!suffix(id, "/src/integrations/neon/auth.ts")) return null;
    return `
      const owner='local-name-package-fixture',state=new URLSearchParams(location.search).get('state')||'ready';
      const qa=window.__sajdaPackageFixture??(window.__sajdaPackageFixture={searchCalls:[],socialCalls:[],cancelled:0});let failed=false;
      export const isAccountAuthConfigured=true;
      export const readAccountSession=async()=>state==='guest'?null:({user:{id:owner},expires_at:Date.now()/1000+3600});
      export async function accountRequest(path,scope){
        if(scope.accountId!==owner)throw Object.assign(new Error('Fixture account mismatch'),{code:'account_changed'});
        if(path!=='/api/account/name-package-social'||scope.method!=='POST'||!Array.isArray(scope.body?.handles))throw new Error('Fixture prohibits any other API');
        qa.socialCalls.push(structuredClone(scope.body));await new Promise(resolve=>setTimeout(resolve,200));
        if(scope.signal?.aborted)throw scope.signal.reason;
        if(state==='github-error'&&!failed){failed=true;throw Object.assign(new Error('Fixture temporary provider failure'),{status:503});}
        return {accountId:owner,requestId:'req_0123456789abcdef',observations:scope.body.handles.map(handle=>({platform:'github',handle,status:handle==='nordform'?'profile_found':'not_found',checkedAt:new Date().toISOString(),sourceUrl:'https://api.github.com/users/'+handle}))};
      }`;
  },
};
export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("LOCAL UI FIXTURE: builds and deployment are prohibited.");
  return { root, publicDir: false, envDir: false, appType: "mpa", plugins: [fixture, react()],
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } }, css: { postcss: projectRoot },
    server: { host: "127.0.0.1", port: 8191, strictPort: true, hmr: false, cors: false, fs: { strict: true, allow: [projectRoot] },
      headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } } };
});
