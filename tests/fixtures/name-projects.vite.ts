import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const schema = "/@fs/" + normalizePath(fileURLToPath(new URL("../../shared/name-projects.ts", import.meta.url)));
const suffix = (id: string, file: string) => normalizePath(id.split("?")[0]).endsWith(file);
const fixture: Plugin = {
  name: "loopback-only-name-projects-fixture", enforce: "pre",
  configResolved(config) { if (config.command !== "serve" || config.isProduction || config.server.host !== "127.0.0.1" || config.server.port !== 8190) throw new Error("Name projects fixture is serve-only on 127.0.0.1:8190."); },
  configureServer(server) { server.middlewares.use((request, _response, next) => { if (["/", "/watchlist", "/auth"].includes(request.url?.split("?")[0] ?? "")) request.url = "/name-projects-preview.html"; next(); }); },
  load(id) {
    if (suffix(id, "/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:{id:'local-name-project-fixture',email_verified:true},loading:false});`;
    if (!suffix(id, "/src/integrations/neon/auth.ts")) return null;
    return `
      import {nameProjectInputSchema} from ${JSON.stringify(schema)};
      const owner='local-name-project-fixture', requestId='req_0123456789abcdef';
      const state=new URLSearchParams(location.search).get('state')||'ready';
      const now=new Date().toISOString(), rows=new Map(), hashes=new Map();let failed=false;
      if(state!=='empty')rows.set('abcdaaaa-0000-4000-8000-000000000001',{id:'abcdaaaa-0000-4000-8000-000000000001',version:1,title:'A calm planning app',description:'A simple planning tool for independent founders. Clear, calm and easy to pronounce.',audience:'Independent founders and small teams',desiredStyle:'Short, warm, not corporate',languages:['en','sv'],budget:{currency:'USD',maxFirstYearCents:3000,maxAnnualRenewalCents:3000},archived:false,shortlistDomains:['example.com','example.org'],createdAt:now,updatedAt:now});
      export const readAccountSession=async()=>({user:{id:owner},expires_at:Date.now()/1000+3600});
      export async function accountRequest(path,scope){
        if(scope.accountId!==owner)throw Object.assign(new Error('Fixture account mismatch'),{code:'account_changed'});
        await new Promise(resolve=>setTimeout(resolve,150));if(scope.signal?.aborted)throw scope.signal.reason;
        if(path==='/api/account/saved-domains')return {items:['example.com','example.org','example.net','an-extra-long-example-domain-for-layout-checking.com'].map((domain,index)=>({id:String(index+1),domain,created_at:now})),nextCursor:null};
        if(path!=='/api/account/name-projects')throw new Error('Fixture prohibits external API calls');
        if(state==='disabled')throw Object.assign(new Error('Fixture disabled'),{status:404});
        if(scope.method==='POST'){
          const input=nameProjectInputSchema.parse(scope.body.project), existing=rows.get(input.id),hash=JSON.stringify(input);
          if(existing?.version===input.expectedVersion+1&&hashes.get(input.id)===hash)return {accountId:owner,requestId,projects:[...rows.values()]};
          if((existing?.version??0)!==input.expectedVersion)throw Object.assign(new Error('Fixture conflict'),{status:409});
          const {expectedVersion,...values}=input;rows.set(input.id,{...values,version:expectedVersion+1,createdAt:existing?.createdAt??now,updatedAt:new Date().toISOString()});hashes.set(input.id,hash);
          if(state==='save-error'&&!failed){failed=true;throw Object.assign(new Error('Fixture uncertain save'),{status:503});}
        }
        return {accountId:owner,requestId,projects:[...rows.values()]};
      }`;
  },
};
export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("LOCAL UI FIXTURE: builds and deployment are prohibited.");
  return { root, publicDir: false, envDir: false, appType: "mpa", plugins: [fixture, react()], resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } }, css: { postcss: projectRoot },
    server: { host: "127.0.0.1", port: 8190, strictPort: true, hmr: false, cors: false, fs: { strict: true, allow: [projectRoot] }, headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } } };
});
