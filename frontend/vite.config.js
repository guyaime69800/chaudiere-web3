import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // NOUVEAU (PWA)

export default defineConfig({
  plugins: [
    react(),
    // NOUVEAU (PWA) : transforme le site en appli installable
    VitePWA({
      registerType: 'autoUpdate', // l'appli se met a jour toute seule quand tu redeploies
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
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
})