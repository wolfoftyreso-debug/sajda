import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: "sajda-native-development-entry",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        // Vite normally falls back to index.html. Native browser previews must
        // keep their own entry on every navigation and refresh, including /app.
        if (request.method === "GET" && request.headers.accept?.includes("text/html")
          && !/^\/(?:api|src|node_modules|@vite|@id|@fs)(?:\/|$)/u.test(path)
          && (path === "/native.html" || !/\.[a-z0-9]+$/iu.test(path))) {
          request.url = "/native.html";
        }
        next();
      });
    },
  }],
  publicDir: command === "serve" ? "public-clean" : false,
  define: {
    "import.meta.env.VITE_SAJDA_SURFACE": JSON.stringify("native"),
    "import.meta.env.VITE_PUBLIC_SEARCH_MODE": JSON.stringify("true"),
    "import.meta.env.VITE_LOCAL_TEST_MODE": JSON.stringify("false"),
    "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": JSON.stringify("true"),
    "import.meta.env.VITE_SCAN_EXECUTION_MODE": JSON.stringify("public-api"),
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist-native", rolldownOptions: { input: "native.html" } },
}));
