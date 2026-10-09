import { Loader2 } from "lucide-react";
import type { SocialAuthProviderAvailability, SocialAuthProviderId } from "@/integrations/neon/social-auth";

const providerLabels: Record<SocialAuthProviderId, string> = { google: "Google", twitter: "X", github: "GitHub", apple: "Apple" };

function ProviderLogo({ provider }: { provider: SocialAuthProviderId }) {
  if (provider === "google") return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.07 12c0-.66.11-1.3.32-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></svg>;
  if (provider === "twitter") return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.74-8.85L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.11l11.97 15.64Z"/></svg>;
  if (provider === "github") return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18A10.97 10.97 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.19-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.75c.02 2.19 1.92 2.92 1.94 2.93-.02.05-.3 1.02-1 2.02-.6.87-1.23 1.74-2.22 1.76-.97.02-1.28-.57-2.39-.57-1.1 0-1.45.55-2.37.59-.95.03-1.68-.96-2.29-1.83-1.24-1.8-2.19-5.08-.92-7.3a3.56 3.56 0 0 1 3.02-1.83c.94-.02 1.83.63 2.4.63.57 0 1.64-.78 2.77-.67.47.02 1.8.19 2.65 1.44-.07.04-1.58.92-1.59 2.83ZM14.9 7.29c.51-.62.86-1.49.76-2.36-.74.03-1.64.5-2.17 1.12-.47.54-.89 1.42-.77 2.26.83.06 1.67-.42 2.18-1.02Z"/></svg>;
}

export interface SocialAuthButtonCopy {
  continueWith: string;
  orEmail: string;
}

export default function SocialAuthButtons({ providers, copy, busyProvider, disabled, onSelect }: {
  providers: SocialAuthProviderAvailability[];
  copy: SocialAuthButtonCopy;
  busyProvider: SocialAuthProviderId | null;
  disabled: boolean;
  onSelect(provider: SocialAuthProviderId): void;
}) {
  const enabledProviders = providers.filter(provider => provider.enabled);
  if (!enabledProviders.length) return null;
  return <div className="sajda-social-auth" aria-label={copy.continueWith}>
    <div className="sajda-social-auth-grid">
      {enabledProviders.map(provider => {
        const label = providerLabels[provider.id];
        const busy = busyProvider === provider.id;
        return <button key={provider.id} type="button" className="sajda-social-auth-button" disabled={disabled}
          onClick={() => onSelect(provider.id)} aria-label={`${copy.continueWith} ${label}`}>
          <span className="sajda-social-auth-logo">{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ProviderLogo provider={provider.id} />}</span>
          <span>{label}</span>
        </button>;
      })}
    </div>
    <div className="sajda-social-auth-divider"><span>{copy.orEmail}</span></div>
  </div>;
}
