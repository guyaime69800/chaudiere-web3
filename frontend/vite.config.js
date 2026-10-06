import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // NOUVEAU (PWA)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
  const missing = required.filter((name) => !env[name]?.trim())

  if (missing.length > 0) {
    throw new Error(`Configuration Supabase manquante pour le build : ${missing.join(', ')}`)
  }

  return {
  plugins: [
    react(),
    // NOUVEAU (PWA) : transforme le site en appli installable
    VitePWA({
      registerType: 'prompt', // propose la mise à jour avant de recharger l'application
      workbox: {
        // Navigations must reach Vercel so a 503 maintenance response cannot be
        // replaced by a previously precached application shell.
        navigateFallback: null,
        runtimeCaching: [{
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: { cacheName: 'carnetpass-pages', networkTimeoutSeconds: 10 },
        }],
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CarnetPass — Carnet d\'entretien',
        short_name: 'CarnetPass',
        description: 'Le carnet d\'entretien infalsifiable de vos equipements (chaudiere, clim, PAC, VMC).',
        theme_color: '#b45309',
        background_color: '#faf7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  }
})
