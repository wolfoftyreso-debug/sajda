import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from "node:url";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  // Keep the deployed static surface deliberately small. The previous starter
  // assets live outside this directory and are never copied into a build.
  publicDir: "public-clean",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Keep crawler-control files out of the precache. The build generator
      // owns robots.txt and sitemap.xml, and crawlers must always receive the
      // current deployment rather than a service-worker snapshot.
      includeAssets: ["sajda-mark.svg", "sajda-logo.svg", "sajda-pwa.svg"],
      manifest: {
        name: "Sajda",
        short_name: "Sajda",
        description: "Find, compare, and verify domain names with transparent registry and provider data",
        theme_color: "#f7f7f8",
        background_color: "#f7f7f8",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/sajda-pwa.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: "/sajda-pwa.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      // This is an online registry/pricing tool, so caching the HTML shell for
      // offline navigation is not useful and can leave a local workstation on
      // an older UI after an update. Cache only versioned assets; the server
      // always supplies a fresh index.html with the current asset references.
      workbox: {
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: undefined,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
