import express from 'express'
import { assistGesture, geminiAvailable } from '../gemini.js'

/**
 * Подсказки для формы записи жеста. Наружу не отдаём ни название сервиса, ни модель,
 * ни текст его ошибок — интерфейс говорит только «ұсыныс».
 *   GET  /api/assist/status   — доступны ли подсказки (ключ задан)
 *   POST /api/assist/gesture  — { text } → { label_kk, label_text, icon, icons, category, hint_kk, advice }
 */
const router = express.Router()

router.get('/status', (req, res) => {
  res.json({ assist: geminiAvailable() })
})

router.post('/gesture', async (req, res) => {
  const text = String(req.body?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length < 2 || text.length > 120) return res.status(400).json({ error: 'text: 2–120 символов' })
  if (!geminiAvailable()) return res.status(503).json({ error: 'подсказки отключены', code: 'no_key' })
  try {
    const { model, ...suggestion } = await assistGesture(text)
    res.json(suggestion)
  } catch (err) {
    console.warn('[assist]', err.message) // подробности — только в лог сервера
    res.status(502).json({ error: 'подсказка недоступна', code: 'unavailable' })
  }
})

export default router
