/** Serve/test-only module replacements. Product auth code is never imported. */
export const AUTH_FIXTURE_KEY = "__sajdaAuthFixture";

export function authFixtureBoundary(id: string): string | undefined {
  const file = id.split("?")[0].replaceAll("\\", "/");
  if (file.endsWith("/src/contexts/AuthContext.tsx")) return `
    const qa=globalThis.${AUTH_FIXTURE_KEY};
    const call=async(method,details)=>{
      qa.calls.push({method,...details});
      if(qa.delay)await new Promise(resolve=>setTimeout(resolve,qa.delay));
      return {error:qa.errorCode?Object.assign(new Error('PRIVATE_PROVIDER_DETAIL_MUST_STAY_HIDDEN'),{code:qa.errorCode}):null};
    };
    export const useAuth=()=>({
      user:qa.user,loading:qa.loading,
      signIn:(email,password)=>call('signIn',{email,passwordLength:password.length}),
      signUp:(email,password,nextPath)=>call('signUp',{email,passwordLength:password.length,nextPath}),
      requestPasswordReset:(email,nextPath)=>call('requestPasswordReset',{email,nextPath}),
      requestEmailVerification:(email,nextPath)=>call('requestEmailVerification',{email,nextPath}),
      updatePassword:(password,token)=>call('updatePassword',{passwordLength:password.length,token})
    });`;
  if (file.endsWith("/src/integrations/neon/auth.ts")) return `
    export const isAccountAuthConfigured=globalThis.${AUTH_FIXTURE_KEY}.configured;
    export const accountAuthUnavailableReason='local_test';`;
  if (file.endsWith("/src/hooks/use-toast.ts")) return `
    export const useToast=()=>({toast:value=>globalThis.${AUTH_FIXTURE_KEY}.toasts.push(value)});`;
}
