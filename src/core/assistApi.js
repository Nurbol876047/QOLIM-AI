/**
 * Клиент подсказок формы записи (сервер: /api/assist). Ключ и название ИИ-сервиса на клиенте не нужны.
 */
const API = '/api/assist'
const TIMEOUT_MS = 20000

let statusPromise = null

/** Доступны ли подсказки на сервере (ключ задан). Кэшируется на время жизни страницы. */
export function assistStatus() {
  if (!statusPromise) {
    statusPromise = fetch(`${API}/status`)
      .then((r) => (r.ok ? r.json() : { assist: false }))
      .catch(() => ({ assist: false }))
  }
  return statusPromise
}

/**
 * Подсказка по тексту формы: { label_kk, label_text, icon, icons, category, hint_kk, advice, model }.
 * @param {string} text
 * @param {AbortSignal} [signal]  чтобы отменить устаревший запрос при дальнейшем вводе
 */
export async function suggestGesture(text, signal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true })
  try {
    const res = await fetch(`${API}/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error(body?.error ?? `HTTP ${res.status}`), { code: body?.code })
    return body
  } finally {
    clearTimeout(timer)
  }
}
