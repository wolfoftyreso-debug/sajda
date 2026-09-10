/** Selected by the build, never by screen size, user agent or PWA installation. */
export const isNativeApp = import.meta.env?.VITE_SAJDA_SURFACE === "native";
