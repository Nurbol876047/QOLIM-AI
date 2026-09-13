/**
 * Подсказки Gemini для формы записи жеста (страница «Кітапхана»).
 *
 * Пользователь набирает слово/фразу — модель возвращает JSON: правильно написанный
 * казахский текст для озвучки, эмодзи-стикер (+ альтернативы), категорию, короткую
 * подсказку «как показать» и замечание, если ввод не годится (слишком длинный,
 * непонятный и т.п.). Ключ хранится ТОЛЬКО на сервере (.env → GEMINI_API_KEY),
 * фронтенд ходит через /api/assist (server/routes/assist.js).
 *
 * Без ключа или без интернета всё остальное работает: форма просто не показывает подсказки.
 */
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Основная модель — из .env; дальше запасные, если модель недоступна (404/429/503). */
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']
const TIMEOUT_MS = 15000
const CACHE_MAX = 300

export const CATEGORIES = ['core', 'emergency', 'learning']

const SYSTEM_PROMPT = `Сен — QOLIM AI қосымшасының көмекшісісің. Бұл қосымша қазақ жестілі тілінің (ҚЖТ) жестерін
камера арқылы танып, мәтінге аударып, дауыстап оқиды. Пайдаланушы «Жаңа жест жазу» формасына жест нені білдіретінін
(сөз немесе қысқа сөз тіркесі) енгізеді. Мәтін қазақша, орысша немесе ағылшынша, қатесімен болуы мүмкін.

Міндетің — форманы толтыруға көмектесу. Тек JSON қайтар:
- label_kk — дауыстап оқылатын мәтін: дұрыс жазылған қазақша. Қатені түзе, бірақ мағынасын ӨЗГЕРТПЕ және ұзартпа.
  Орысша/ағылшынша енгізілсе — қазақшаға аудар. Ең көбі 6 сөз.
- label_text — экранда көрсетілетін мәтін: әдетте label_kk-мен бірдей; басқа тілде енгізілсе — «Рақмет (Спасибо)» түрінде.
- icon — мағынаны ең жақсы беретін БІР эмодзи-стикер (тек эмодзи, мәтінсіз).
- icons — тағы 5 балама эмодзи (icon-нан бөлек, қайталанбайтын).
- category — «emergency»: көмек, қауіп, дәрігер, полиция, өрт, ауру, жедел жәрдем сияқты шұғыл фразалар;
  «learning»: оқу тапсырмасы, әріп, сан, қайталау жаттығуы; қалғаны — «core».
- hint_kk — жестті қалай көрсету керек, 1 қысқа сөйлем (ҚЖТ-дағы нақты жестті білсең ғана; білмесең — бос жол «»).
  Ойдан шығарма.
- advice — енгізілген мәтін туралы қысқа ескерту (ең көбі 120 таңба, қазақша): бір жестке тым ұзын болса — қысқартуды
  ұсын; түсініксіз/мағынасыз болса — не екенін сұра; балағат немесе қорлау болса — қосуға болмайтынын айт;
  бәрі дұрыс болса — бос жол «».`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    label_kk: { type: 'STRING' },
    label_text: { type: 'STRING' },
    icon: { type: 'STRING' },
    icons: { type: 'ARRAY', items: { type: 'STRING' } },
    category: { type: 'STRING', enum: CATEGORIES },
    hint_kk: { type: 'STRING' },
    advice: { type: 'STRING' },
  },
  required: ['label_kk', 'label_text', 'icon', 'icons', 'category', 'hint_kk', 'advice'],
}

const cache = new Map()

export const geminiAvailable = () => Boolean(process.env.GEMINI_API_KEY)
export const geminiModel = () => process.env.GEMINI_MODEL || FALLBACK_MODELS[0]

/** Оставляет в строке только эмодзи (модель иногда добавляет текст). */
function onlyEmoji(str) {
  if (typeof str !== 'string') return ''
  const m = str.match(/\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/u)
  return m ? m[0] : ''
}

function normalize(raw, text) {
  const icon = onlyEmoji(raw.icon)
  const icons = []
  for (const s of Array.isArray(raw.icons) ? raw.icons : []) {
    const e = onlyEmoji(s)
    if (e && e !== icon && !icons.includes(e)) icons.push(e)
    if (icons.length >= 5) break
  }
  const label_kk = String(raw.label_kk ?? '').trim().slice(0, 80) || text
  return {
    label_kk,
    label_text: String(raw.label_text ?? '').trim().slice(0, 120) || label_kk,
    icon,
    icons,
    category: CATEGORIES.includes(raw.category) ? raw.category : 'core',
    hint_kk: String(raw.hint_kk ?? '').trim().slice(0, 300),
    advice: String(raw.advice ?? '').trim().slice(0, 160),
  }
}

async function callModel(model, text, apiKey) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `Енгізілген мәтін: «${text}»` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.3 },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body?.error?.message ?? `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    const part = body?.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')
    if (!part) throw new Error('пустой ответ модели')
    return JSON.parse(part.text)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Подсказка по введённому тексту. Кэшируется по тексту.
 * @param {string} text
 * @returns {Promise<{ label_kk, label_text, icon, icons, category, hint_kk, advice, model }>}
 */
export async function assistGesture(text) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY не задан'), { code: 'no_key' })
  const key = text.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  const models = [geminiModel(), ...FALLBACK_MODELS.filter((m) => m !== geminiModel())]
  let lastErr
  for (const model of models) {
    try {
      const raw = await callModel(model, text, apiKey)
      const result = { ...normalize(raw, text), model }
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
      cache.set(key, result)
      return result
    } catch (err) {
      lastErr = err
      // модель недоступна/перегружена — пробуем следующую; остальное (например, неверный ключ) — сразу наверх
      if (![404, 429, 503].includes(err.status) && err.name !== 'AbortError') throw err
      console.warn(`[gemini] ${model}: ${err.message.slice(0, 120)} — пробуем следующую модель`)
    }
  }
  throw lastErr ?? new Error('Gemini недоступен')
}
