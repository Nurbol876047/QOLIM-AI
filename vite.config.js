import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API живёт в Express (server/index.js, порт 3000) — в dev проксируем к нему
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // three.js и MediaPipe сами по себе тяжёлые — предупреждение о размере чанка не нужно
    chunkSizeWarningLimit: 1200,
    // разводим вендоров по отдельным файлам для кеширования
    // (Vite 8 / rolldown принимает manualChunks только как функцию)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/three/')) return 'three'
          if (id.includes('/pixi.js/') || id.includes('/@pixi/')) return 'pixi'
          if (id.includes('/gsap/')) return 'gsap'
          if (id.includes('/@mediapipe/')) return 'mediapipe'
          if (/\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
})
