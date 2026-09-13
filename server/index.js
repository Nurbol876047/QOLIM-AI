import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import gesturesRouter from './routes/gestures.js'
import assistRouter from './routes/assist.js'

/**
 * Express-сервер QOLIM AI.
 *   - /api/*  — небольшой API (здоровье, библиотека жестов); БД на старте нет;
 *   - всё остальное — статика production-сборки из dist/ (после `npm run build`)
 *     с SPA-fallback на index.html, чтобы работали маршруты /core, /emergency, /learning.
 * В разработке фронт отдаёт Vite (npm run dev), а /api проксируется сюда (vite.config.js).
 */
const __dirname = dirname(fileURLToPath(import.meta.url))

// секреты (GEMINI_API_KEY и т.п.) — из .env в корне проекта; файла может не быть
try {
  process.loadEnvFile(resolve(__dirname, '../.env'))
} catch {
  // нет .env — подсказки Gemini просто выключены
}
const DIST = resolve(__dirname, '../dist')
const AUDIO = resolve(__dirname, '../public/audio')
const PORT = Number(process.env.PORT) || 3000

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' })) // записанный жест — до 24 кадров × 2 руки × 21 точка

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'QOLIM AI API is running', uptime: Math.round(process.uptime()) })
})
app.use('/api/gestures', gesturesRouter)
app.use('/api/assist', assistRouter)
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }))

// озвучка записанных жестов появляется в public/audio уже после сборки — отдаём её напрямую
app.use('/audio', express.static(AUDIO, { maxAge: '1h' }))

if (existsSync(DIST)) {
  // модели и wasm большие и неизменяемые — пусть кешируются
  app.use(express.static(DIST, { maxAge: '1h', setHeaders: (res, path) => {
    if (/\.(task|wasm)$/.test(path)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
  } }))
  app.get('/{*splat}', (req, res) => res.sendFile(join(DIST, 'index.html')))
} else {
  app.get('/{*splat}', (req, res) => {
    res
      .status(503)
      .type('text')
      .send('Сборка не найдена: выполните `npm run build`. В разработке откройте Vite (npm run dev, порт 5173).')
  })
}

app.listen(PORT, () => {
  console.log(
    `QOLIM AI server: http://localhost:${PORT}  (dist: ${existsSync(DIST) ? 'есть' : 'нет'}, Gemini: ${process.env.GEMINI_API_KEY ? 'ключ задан' : 'нет ключа'})`,
  )
})
