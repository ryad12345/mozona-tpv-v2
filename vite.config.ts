import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            // Registro automático y transparente: el SW nuevo se activa
            // sin pedir confirmación; mostramos un toast de "nueva versión"
            // desde UpdatePrompt.
            registerType: "autoUpdate",

            // Ficheros estáticos a pre-cachear (junto a los chunks de JS)
            includeAssets: [
                "favicon.svg",
                "icons/icon.svg",
                "manifest.json",
            ],

            // Manifiesto (también accesible en /manifest.webmanifest)
            manifest: {
                name: "MOZONA TPV",
                short_name: "MozonaTPV",
                description: "Sistema TPV Local-First para hostelería con VeriFactu",
                lang: "es-ES",
                dir: "ltr",
                scope: "/",
                start_url: "/",
                display: "standalone",
                orientation: "any",
                theme_color: "#2563EB",
                background_color: "#F0F2F5",
                categories: ["business", "productivity", "finance"],
                icons: [
                    { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
                    { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
                    { src: "/icons/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
                ],
            },

            // Estrategias de caché en tiempo de ejecución
            workbox: {
                // Precachear todos los assets de la build
                globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,webp,avif}"],
                // Limpiar caches antiguas
                cleanupOutdatedCaches: true,
                // NO cachear el index.html (para que las actualizaciones lleguen)
                navigateFallbackDenylist: [/^\/api\//],

                runtimeCaching: [
                    // Google Fonts
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "google-fonts-stylesheets",
                            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "google-fonts-webfonts",
                            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Supabase Storage
                    {
                        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "supabase-storage",
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
                        },
                    },
                    // Supabase REST API
                    {
                        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "supabase-api",
                            networkTimeoutSeconds: 5,
                            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
                        },
                    },
                    // Servidor LAN local
                    {
                        urlPattern: /^https?:\/\/(localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+).*\/(api|ws)\/.*/i,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "lan-server",
                            networkTimeoutSeconds: 3,
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
                        },
                    },
                    // Imágenes externas
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "images",
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },

            // Service worker en desarrollo (útil para probar offline)
            devOptions: {
                enabled: false,
                type: "module",
            },
        }),
    ],

    // Vite options tailored for Tauri development
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
        host: false,
        hmr: { protocol: "ws", host: "localhost", port: 5174 },
        watch: { ignored: ["**/src-tauri/**"] },
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
        target: "es2022",
        minify: "esbuild",
        sourcemap: false,
    },
});
