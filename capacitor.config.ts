import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.hypbit.sajda",
  appName: "Sajda",
  webDir: "dist-native",
  ios: { contentInset: "never", backgroundColor: "#f7f9fc" },
  // Deliberately no server.url or allowNavigation: the app runs its signed,
  // bundled product UI, not a remotely replaceable website.
};
export default config;
