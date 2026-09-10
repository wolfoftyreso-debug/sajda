/** Selected by the build, never by screen size, user agent or PWA installation. */
export const isNativeApp = import.meta.env?.VITE_SAJDA_SURFACE === "native";

/** Shareable marketplace URLs must never point to capacitor://localhost. */
export function marketplacePublicUrl(id: string): string {
  const path = `/marketplace/${encodeURIComponent(id)}`;
  const origin = isNativeApp ? import.meta.env.VITE_NATIVE_API_ORIGIN?.trim()
    : typeof window === "undefined" ? undefined : window.location.origin;
  if (!origin) return isNativeApp ? "" : path;
  try {
    const base = new URL(origin);
    if (isNativeApp && (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/")) return "";
    return new URL(path, base).toString();
  } catch { return ""; }
}
