import { gestureLibrary } from './gestureLibrary.js'

/**
 * Хранилище записанных жестов (клиентская часть).
 * Основной путь — API сервера (server/routes/gestures.js → server/data/gestures.json),
 * запасной — localStorage, если сервер недоступен (например, запущен только Vite).
 * Итоговая библиотека = встроенные жесты + записанные.
 */
const API = '/api/gestures'
const STORAGE_KEY = 'qolim:custom-gestures'
const FETCH_TIMEOUT_MS = 4000
/** Сохранение ждёт озвучку на сервере (до TTS_TIMEOUT_MS там) — даём запас. */
const SAVE_TIMEOUT_MS = 20000

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // квота/приватный режим — без сохранения
  }
}

async function request(url, { timeout = FETCH_TIMEOUT_MS, ...options } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
    if (body == null) throw new Error('fetch: пустой ответ сервера')
    return body
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Загружает записанные жесты. Возвращает { gestures, source: 'server' | 'local' }.
 * С сервера — если он отвечает; иначе — то, что успели сохранить локально.
 */
export async function loadCustomGestures() {
  try {
    const gestures = await request(`${API}?source=custom`)
    // жесты, сохранённые локально, пока сервера не было, — тоже показываем
    const local = readLocal().filter((l) => !gestures.some((g) => g.id === l.id))
    return { gestures: [...gestures, ...local], source: 'server' }
  } catch (err) {
    console.warn('[libraryStore] сервер недоступен, читаем localStorage:', err.message)
    return { gestures: readLocal(), source: 'local' }
  }
}

/**
 * Сохраняет записанный жест. На сервере — с озвучкой; без сервера — в localStorage
 * (озвучит браузерный синтез речи).
 * @returns {Promise<{ gesture: object, source: 'server' | 'local', audioGenerated: boolean }>}
 */
export async function saveCustomGesture(gesture) {
  try {
    const saved = await request(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gesture),
      timeout: SAVE_TIMEOUT_MS,
    })
    return { gesture: saved, source: 'server', audioGenerated: !!saved.audioGenerated }
  } catch (err) {
    if (err.message && !/HTTP|timeout|abort|fetch/i.test(err.message)) throw err // ошибка валидации — показать
    console.warn('[libraryStore] сервер недоступен, сохраняем локально:', err.message)
    const local = readLocal()
    const ids = new Set([...gestureLibrary, ...local].map((g) => g.id))
    let id = gesture.id
    let n = 2
    while (ids.has(id)) id = `${gesture.id}-${n++}`
    const saved = { ...gesture, id, createdAt: new Date().toISOString(), local: true }
    writeLocal([...local, saved])
    return { gesture: saved, source: 'local', audioGenerated: false }
  }
}

export async function deleteCustomGesture(id) {
  writeLocal(readLocal().filter((g) => g.id !== id))
  try {
    await request(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (err) {
    if (!/404/.test(err.message)) console.warn('[libraryStore] удаление на сервере не удалось:', err.message)
  }
}

/** Встроенные + записанные (записанный жест с тем же id заменяет встроенный). */
export function mergeLibrary(custom) {
  const ids = new Set(custom.map((g) => g.id))
  return [...gestureLibrary.filter((g) => !ids.has(g.id)), ...custom]
}
