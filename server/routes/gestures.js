import express from 'express'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GESTURE_CATEGORIES, gestureLibrary, slugify } from '../../src/core/gestureLibrary.js'
import { ROOT, audioPath, fileExists, synthesizeToFile } from '../tts.js'

/**
 * API библиотеки жестов.
 *   GET    /api/gestures                    — встроенные + записанные (?category=…, ?source=builtin|custom)
 *   GET    /api/gestures/:id
 *   POST   /api/gestures                    — сохранить записанный жест (+ озвучка через Edge TTS)
 *   DELETE /api/gestures/:id                — удалить записанный жест (встроенные удалять нельзя)
 *
 * Встроенные жесты — src/core/gestureLibrary.js (одна правда для клиента и сервера),
 * записанные — server/data/gestures.json (без БД на старте).
 */
const router = express.Router()
const DATA_FILE = resolve(ROOT, 'server/data/gestures.json')
const MAX_KEYFRAMES = 24
/** Сколько ждать озвучку при сохранении, прежде чем ответить без неё. */
const TTS_TIMEOUT_MS = 12000

async function readCustom() {
  try {
    const list = JSON.parse(await readFile(DATA_FILE, 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function writeCustom(list) {
  await writeFile(DATA_FILE, JSON.stringify(list, null, 2))
}

const isLandmark = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
const isHand = (h) => Array.isArray(h) && h.length === 21 && h.every(isLandmark)

/** Проверяет тело POST и возвращает очищенный жест или строку с ошибкой. */
function sanitize(body, existingIds) {
  const label_kk = String(body?.label_kk ?? '').trim()
  if (!label_kk || label_kk.length > 80) return 'label_kk: 1–80 символов'
  const label_text = String(body?.label_text ?? label_kk).trim().slice(0, 120) || label_kk
  const category = GESTURE_CATEGORIES.includes(body?.category) ? body.category : 'core'
  const hint_kk = body?.hint_kk ? String(body.hint_kk).slice(0, 300) : undefined
  const icon = body?.icon ? String(body.icon).trim().slice(0, 16) : undefined // эмодзи с тоном кожи/ZWJ — до 16 code units

  const seq = Array.isArray(body?.landmarksSequence) ? body.landmarksSequence.slice(0, MAX_KEYFRAMES) : []
  const landmarksSequence = []
  for (const k of seq) {
    if (!isHand(k?.hand)) return 'landmarksSequence: каждый кадр должен содержать hand из 21 точки {x, y, z}'
    const clean = {
      hand: k.hand.map((p) => ({ x: +p.x, y: +p.y, z: Number.isFinite(p.z) ? +p.z : 0 })),
      aspect: Number.isFinite(k.aspect) && k.aspect > 0 ? +k.aspect : 4 / 3,
      t: Number.isFinite(k.t) ? +k.t : 0,
    }
    if (k.handedness === 'Left' || k.handedness === 'Right') clean.handedness = k.handedness
    if (isHand(k.hand2)) {
      clean.hand2 = k.hand2.map((p) => ({ x: +p.x, y: +p.y, z: Number.isFinite(p.z) ? +p.z : 0 }))
      if (k.handedness2 === 'Left' || k.handedness2 === 'Right') clean.handedness2 = k.handedness2
    }
    landmarksSequence.push(clean)
  }
  if (landmarksSequence.length === 0 && !body?.shape) return 'нужен хотя бы один записанный кадр (landmarksSequence) или shape'

  let id = body?.id ? slugify(String(body.id)) : slugify(label_kk)
  if (existingIds.has(id)) {
    let n = 2
    while (existingIds.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }

  const gesture = { id, label_kk, label_text, category, landmarksSequence, createdAt: new Date().toISOString() }
  if (hint_kk) gesture.hint_kk = hint_kk
  if (icon) gesture.icon = icon
  if (body?.shape && typeof body.shape === 'object') gesture.shape = body.shape
  return gesture
}

router.get('/', async (req, res) => {
  const { category, source } = req.query
  if (category && !GESTURE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `unknown category; expected one of ${GESTURE_CATEGORIES.join(', ')}` })
  }
  const custom = await readCustom()
  let list = source === 'custom' ? custom : source === 'builtin' ? gestureLibrary : [...gestureLibrary, ...custom]
  if (category) list = list.filter((g) => g.category === category)
  res.json(list)
})

router.get('/:id', async (req, res) => {
  const custom = await readCustom()
  const gesture = [...gestureLibrary, ...custom].find((g) => g.id === req.params.id)
  if (!gesture) return res.status(404).json({ error: 'gesture not found' })
  res.json(gesture)
})

router.post('/', async (req, res) => {
  const custom = await readCustom()
  const existingIds = new Set([...gestureLibrary, ...custom].map((g) => g.id))
  const gesture = sanitize(req.body, existingIds)
  if (typeof gesture === 'string') return res.status(400).json({ error: gesture })

  custom.push(gesture)
  await writeCustom(custom)

  // озвучка — лучшее из возможного: нет интернета → жест всё равно сохранён, браузер озвучит синтезом
  let audio = false
  try {
    await Promise.race([
      synthesizeToFile(gesture.label_kk, audioPath(gesture.id)).then(() => (audio = true)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TTS timeout')), TTS_TIMEOUT_MS)),
    ])
  } catch (err) {
    console.warn(`[gestures] озвучка «${gesture.label_kk}» не удалась: ${err.message}`)
  }
  res.status(201).json({ ...gesture, audioGenerated: audio })
})

router.delete('/:id', async (req, res) => {
  const custom = await readCustom()
  const idx = custom.findIndex((g) => g.id === req.params.id)
  if (idx < 0) {
    const builtin = gestureLibrary.some((g) => g.id === req.params.id)
    return res.status(builtin ? 403 : 404).json({ error: builtin ? 'builtin gesture cannot be deleted' : 'gesture not found' })
  }
  const [removed] = custom.splice(idx, 1)
  await writeCustom(custom)
  const file = audioPath(removed.id)
  if (await fileExists(file)) await unlink(file).catch(() => {})
  res.json({ ok: true, id: removed.id })
})

export default router
