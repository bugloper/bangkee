import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// The Go server listens on $PORT (3000 when unset) and serves the built app
// from web/dist in production; in development Vite serves the app and
// forwards the API there.
// 127.0.0.1, not localhost: Node resolves localhost to ::1 and the API listens on IPv4.
const api = `http://127.0.0.1:${process.env.PORT ?? 3000}`

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      // Same URL the Rails worker had, so installed apps swap workers cleanly.
      filename: "service-worker.ts",
      injectRegister: false,
      manifestFilename: "manifest.webmanifest",
      injectManifest: { rollupFormat: "iife", globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"] },
      manifest: {
        name: "Bangkee — shared credit book",
        short_name: "Bangkee",
        description: "The credit book your shop and your customers both can see.",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        theme_color: "#4d35f1",
        background_color: "#fafbfd",
        lang: "en",
        dir: "ltr",
        categories: ["business", "finance", "productivity"],
        icons: [
          { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
          { src: "/icon.png", type: "image/png", sizes: "512x512", purpose: "any" },
          { src: "/icon-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
          { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        ],
        shortcuts: [
          { name: "Customers", url: "/accounts", description: "Your customer list" },
          { name: "Items", url: "/menu_items", description: "What your shop sells" },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // The proxy keeps the Host header (changeOrigin: false): the server writes
  // the page's own address into links and preview tags from it.
  server: {
    proxy: {
      "/api": { target: api, changeOrigin: false, ws: true },
      "/up": { target: api, changeOrigin: false },
    },
  },
})
