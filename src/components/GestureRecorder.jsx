import { useEffect, useId, useRef, useState } from 'react'
import { CATEGORY_LABELS, GESTURE_CATEGORIES, slugify } from '../core/gestureLibrary.js'
import { assistStatus, suggestGesture } from '../core/assistApi.js'
import { DYNAMIC_KEYFRAMES, DYNAMIC_MS, STATIC_MS } from '../hooks/useGestureRecorder.js'
import StickerPicker from './StickerPicker.jsx'

/** Пауза после ввода, прежде чем запрашивать подсказку у сервера (мс), и минимальная длина текста. */
const ASSIST_DEBOUNCE_MS = 700
const ASSIST_MIN_CHARS = 2

/**
 * Форма записи нового жеста: слово/фраза (то, что будет озвучено), стикер,
 * категория, тип (статичный / с движением), кнопка «Жазу» → отсчёт → запись → «Сақтау».
 *
 * Пока пользователь набирает текст, сервер готовит подсказку (/api/assist/gesture, см. server/gemini.js):
 * подобранный стикер и категория подставляются сами (если пользователь их ещё не менял),
 * исправленное написание и подсказка «как показать» — по кнопке, замечание к вводу
 * (слишком длинно, непонятно) показывается под полем. Название ИИ-сервиса в интерфейсе
 * не упоминается. Без ключа на сервере форма работает
 * как обычно: стикер выбирают из готовых.
 *
 * Сама запись кадров — в hooks/useGestureRecorder.js; сюда приходит её состояние.
 */
export default function GestureRecorder({ recorder, cameraRunning, onSave, saving = false }) {
  const id = useId()
  const [label, setLabel] = useState('')
  const [labelText, setLabelText] = useState('')
  const [hint, setHint] = useState('')
  const [icon, setIcon] = useState('')
  const [category, setCategory] = useState('core')
  const [kind, setKind] = useState('static')
  // что пользователь выставил руками — подсказка это не перезаписывает
  const touched = useRef({ icon: false, category: false, hint: false })

  const [assist, setAssist] = useState({ available: null })
  const [suggestion, setSuggestion] = useState(null) // подсказка сервера для текущего текста
  const [assistState, setAssistState] = useState('idle') // idle | loading | error
  const [assistError, setAssistError] = useState('')
  const askedFor = useRef('')
  const abortRef = useRef(null)

  const { phase, result, error, start, reset } = recorder
  const canRecord = cameraRunning && label.trim().length > 0 && (phase === 'idle' || phase === 'done' || phase === 'error')
  const busy = phase === 'countdown' || phase === 'recording'

  useEffect(() => {
    assistStatus().then((s) => setAssist({ available: !!s.assist }))
  }, [])

  const ask = async (text) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length < ASSIST_MIN_CHARS || clean === askedFor.current) return
    askedFor.current = clean
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setAssistState('loading')
    setAssistError('')
    try {
      const s = await suggestGesture(clean, ctrl.signal)
      if (ctrl.signal.aborted) return
      setSuggestion(s)
      setAssistState('idle')
      // стикер и категорию подставляем сами — это и есть главная помощь
      if (!touched.current.icon && s.icon) setIcon(s.icon)
      if (!touched.current.category) setCategory(s.category)
      if (!touched.current.hint && !hint && s.hint_kk) setHint(s.hint_kk)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setAssistState('error')
      setAssistError('Ұсыныс қазір қолжетімсіз — стикерді төменнен таңдаңыз.')
    }
  }

  // автоподсказка: через ASSIST_DEBOUNCE_MS после того, как пользователь перестал печатать
  useEffect(() => {
    if (!assist.available || busy) return undefined
    const timer = setTimeout(() => ask(label), ASSIST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, assist.available])

  useEffect(() => () => abortRef.current?.abort(), [])

  const applyLabel = () => {
    if (!suggestion) return
    setLabel(suggestion.label_kk)
    if (suggestion.label_text && suggestion.label_text !== suggestion.label_kk) setLabelText(suggestion.label_text)
    askedFor.current = suggestion.label_kk
  }

  const clearForm = () => {
    setLabel('')
    setLabelText('')
    setHint('')
    setIcon('')
    setCategory('core')
    setSuggestion(null)
    askedFor.current = ''
    touched.current = { icon: false, category: false, hint: false }
  }

  const save = async () => {
    if (!result) return
    const label_kk = label.trim()
    await onSave({
      id: slugify(label_kk),
      label_kk,
      label_text: labelText.trim() || label_kk,
      hint_kk: hint.trim() || undefined,
      icon: icon || undefined,
      category,
      landmarksSequence: result.keyframes,
    })
    clearForm()
    reset()
  }

  const labelChanged = suggestion && suggestion.label_kk.trim().toLowerCase() !== label.trim().toLowerCase()
  const aiIcons = suggestion ? [suggestion.icon, ...(suggestion.icons ?? [])].filter(Boolean) : []

  return (
    <form
      className="recorder"
      onSubmit={(e) => {
        e.preventDefault()
        if (phase === 'done') save()
        else if (canRecord) start(kind)
      }}
    >
      <div className="recorder__main">
        <div className="recorder__row recorder__row--grow">
          <label className="label" htmlFor={`${id}-label`}>
            Жест нені білдіреді? (өз сөзіңіз — дәл осылай дауыстап оқылады)
          </label>
          <input
            id={`${id}-label`}
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Мысалы: Рақмет"
            maxLength={80}
            autoComplete="off"
            disabled={busy}
          />
          {assist.available && (
            <div className="assist" aria-live="polite">
              {assistState === 'loading' && (
                <span className="assist__status">
                  <span className="spinner spinner--sm" aria-hidden="true" /> Ұсыныс дайындалуда…
                </span>
              )}
              {assistState === 'error' && <span className="assist__status assist__status--error">⚠️ {assistError}</span>}
              {assistState === 'idle' && suggestion && (
                <>
                  {suggestion.advice && <span className="assist__advice">💡 {suggestion.advice}</span>}
                  {labelChanged && (
                    <span className="assist__row">
                      <span>
                        ✨ Дауыстап оқу үшін ұсыныс: <strong>«{suggestion.label_kk}»</strong>
                      </span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={applyLabel} disabled={busy}>
                        Қолдану
                      </button>
                    </span>
                  )}
                </>
              )}
              {assistState === 'idle' && !suggestion && label.trim().length >= ASSIST_MIN_CHARS && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => ask(label)} disabled={busy}>
                  ✨ Ұсыныс алу
                </button>
              )}
            </div>
          )}
        </div>
        <div className="recorder__row">
          <span className="label">Стикер</span>
          <div className={`sticker-preview${icon ? '' : ' is-empty'}`} aria-live="polite">
            {icon ? (
              <span aria-label={`Таңдалған стикер ${icon}`}>{icon}</span>
            ) : (
              <span className="hint">төмендегі тізімнен таңдаңыз</span>
            )}
          </div>
        </div>
      </div>

      <div className="recorder__row">
        <StickerPicker
          value={icon}
          suggestions={aiIcons}
          disabled={busy}
          onChange={(s) => {
            touched.current.icon = true
            setIcon(s)
          }}
        />
      </div>

      <div className="recorder__grid">
        <div className="recorder__row">
          <label className="label" htmlFor={`${id}-text`}>
            Экрандағы мәтін (бос болса — сол сөз)
          </label>
          <input
            id={`${id}-text`}
            className="input"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder="Мысалы: Рақмет!"
            maxLength={120}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="recorder__row">
          <label className="label" htmlFor={`${id}-category`}>
            Санат
          </label>
          <select
            id={`${id}-category`}
            className="input"
            value={category}
            onChange={(e) => {
              touched.current.category = true
              setCategory(e.target.value)
            }}
            disabled={busy}
          >
            {GESTURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="recorder__row">
        <label className="label" htmlFor={`${id}-hint`}>
          Қалай көрсету керек (қосымша, үйрену модулі үшін)
        </label>
        <input
          id={`${id}-hint`}
          className="input"
          value={hint}
          onChange={(e) => {
            touched.current.hint = true
            setHint(e.target.value)
          }}
          placeholder="Мысалы: Оң қолды кеудеге қойып, алға қарай жылжыту"
          maxLength={300}
          autoComplete="off"
          disabled={busy}
        />
      </div>

      <fieldset className="recorder__kind" disabled={busy}>
        <legend className="label">Жест түрі</legend>
        <label className={`choice${kind === 'static' ? ' is-checked' : ''}`}>
          <input type="radio" name={`${id}-kind`} value="static" checked={kind === 'static'} onChange={() => setKind('static')} />
          <span className="choice__icon" aria-hidden="true">
            ✋
          </span>
          <span>
            <strong>Статикалық</strong>
            <span className="hint">Қолды {STATIC_MS / 1000} с қозғалтпай ұстайсыз</span>
          </span>
        </label>
        <label className={`choice${kind === 'dynamic' ? ' is-checked' : ''}`}>
          <input type="radio" name={`${id}-kind`} value="dynamic" checked={kind === 'dynamic'} onChange={() => setKind('dynamic')} />
          <span className="choice__icon" aria-hidden="true">
            👋
          </span>
          <span>
            <strong>Қозғалысты</strong>
            <span className="hint">
              {DYNAMIC_MS / 1000} с ішінде қимылды көрсетесіз ({DYNAMIC_KEYFRAMES} кадр жазылады)
            </span>
          </span>
        </label>
      </fieldset>

      <div className="recorder__actions" aria-live="polite">
        {phase !== 'done' && (
          <button type="submit" className="btn btn-primary" disabled={!canRecord}>
            <span className="btn__icon" aria-hidden="true">
              ⏺
            </span>
            {busy ? 'Жазылуда…' : 'Жазу'}
          </button>
        )}
        {phase === 'done' && result && (
          <>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="btn__icon" aria-hidden="true">
                💾
              </span>
              {saving ? 'Сақталуда…' : `Сақтау${icon ? ` ${icon}` : ''}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => start(kind)} disabled={saving}>
              <span className="btn__icon" aria-hidden="true">
                ↻
              </span>
              Қайта жазу
            </button>
            <span className="badge badge--primary">
              ✓ {result.frames} кадр · {result.twoHanded ? 'екі қол' : 'бір қол'} · {result.kind === 'static' ? 'статикалық' : `${result.keyframes.length} кілт кадр`}
            </span>
          </>
        )}
        {phase === 'error' && (
          <span className="badge badge--alert" role="alert">
            ⚠️ {error}
          </span>
        )}
        {!cameraRunning && phase === 'idle' && <span className="hint">Жазу үшін алдымен камераны қосыңыз.</span>}
      </div>
    </form>
  )
}
