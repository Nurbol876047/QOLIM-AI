import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildGestureIndex, realGestureSet, tokenizeToGestures } from '../core/textToGesture.js'
import { useGestureLibrary } from '../hooks/useGestureLibrary.js'
import { LIBRARY_PAGE, moduleById } from '../modules.js'
import GesturePlayback from '../components/GesturePlayback.jsx'

/** Пауза между словами при автоматическом прогоне фразы (мс). */
const AUTOPLAY_MS = 2200

/**
 * Модуль 2 — «Мәтін → жест» (кері бағыт): пайдаланушы сөз немесе сөйлем жазады,
 * жүйе оны кітапхана жестерімен сәйкестендіріп, скелетті камерасыз ойнатады —
 * дыбыс еститін адам жазған мәтінді ым тілінде көрсету үшін.
 */
export default function TextToGesturePage() {
  const module = moduleById('text2gesture')
  const { library, status: libStatus } = useGestureLibrary()
  const moduleLibrary = useMemo(() => realGestureSet(library), [library])
  const index = useMemo(() => buildGestureIndex(moduleLibrary), [moduleLibrary])

  const [text, setText] = useState('')
  const [tokens, setTokens] = useState([])
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  const convert = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const built = tokenizeToGestures(text, index)
    setTokens(built)
    setCurrent(0)
    setPlaying(built.length > 1 && built.some((t) => t.gesture))
  }

  // автопрогон: раз в AUTOPLAY_MS переходим к следующему токену, на последнем — остановка
  useEffect(() => {
    if (!playing || tokens.length < 2) return undefined
    const timer = setInterval(() => {
      setCurrent((i) => (i + 1 < tokens.length ? i + 1 : i))
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [playing, tokens])

  useEffect(() => {
    if (tokens.length && current >= tokens.length - 1) setPlaying(false)
  }, [current, tokens])

  const jumpTo = (i) => {
    setPlaying(false)
    setCurrent(i)
  }

  const previewGesture = (g) => {
    setText(g.label_kk)
    setTokens([{ word: g.label_kk, gesture: g }])
    setCurrent(0)
    setPlaying(false)
  }

  const foundCount = tokens.filter((t) => t.gesture).length
  const token = tokens[current] ?? null

  return (
    <>
      <section className="page-head" data-animate>
        <span className="badge badge--primary">
          <span aria-hidden="true">{module.icon}</span> Модуль {module.num}
        </span>
        <h1>{module.title}</h1>
        <p className="page-head__lead">{module.description}</p>
      </section>

      <section className="grid-2">
        <div className="stack">
          <form className="card" data-animate onSubmit={convert}>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                ⌨️
              </span>
              Сөз немесе сөйлем
            </h2>
            <label className="label" htmlFor="t2g-text">
              Мәтінді осында жазыңыз
            </label>
            <textarea
              id="t2g-text"
              className="input"
              style={{ minHeight: '96px', paddingTop: 'var(--space-3)', paddingBottom: 'var(--space-3)', resize: 'vertical' }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Мысалы: Сәлем, рақмет"
              maxLength={300}
            />
            <div className="camera-view__controls" style={{ marginTop: 'var(--space-4)' }}>
              <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
                <span className="btn__icon" aria-hidden="true">
                  🤟
                </span>
                Жестке айналдыру
              </button>
            </div>
          </form>

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                🖐️
              </span>
              Көрсету
            </h2>

            {!tokens.length ? (
              <div className="camera-view__frame gesture-stage__frame">
                <div className="gesture-stage__empty">
                  <img className="gesture-stage__character" src="/images/police-avatar.png" alt="" />
                  <p>Мәтінді жазып, «Жестке айналдыру» батырмасын басыңыз.</p>
                </div>
              </div>
            ) : token?.gesture ? (
              <>
                <p className="gesture-stage__caption">
                  <span aria-hidden="true">{token.gesture.icon ?? '🖐️'}</span> {token.gesture.label_kk}
                </p>
                <GesturePlayback key={`${token.gesture.id}-${current}`} gesture={token.gesture} />
              </>
            ) : (
              <div className="camera-view__frame gesture-stage__frame">
                <div className="gesture-stage__poster">
                  <span className="gesture-stage__poster-icon" aria-hidden="true">
                    ❓
                  </span>
                  <strong>«{token.word}»</strong>
                  <p className="hint">
                    Бұл сөзге сәйкес жест кітапханада жоқ. <Link to={LIBRARY_PAGE.path}>{LIBRARY_PAGE.title}</Link> бетінде жазып
                    қосыңыз.
                  </p>
                </div>
              </div>
            )}

            {tokens.length > 0 && (
              <div className="camera-view__controls" style={{ marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpTo(Math.max(0, current - 1))} disabled={current === 0}>
                  <span className="btn__icon" aria-hidden="true">
                    ⏮
                  </span>
                  Алдыңғы
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPlaying((p) => !p)}
                  disabled={tokens.length < 2}
                >
                  <span className="btn__icon" aria-hidden="true">
                    {playing ? '⏸' : '▶️'}
                  </span>
                  {playing ? 'Тоқтата тұру' : 'Ойнату'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => jumpTo(Math.min(tokens.length - 1, current + 1))}
                  disabled={current >= tokens.length - 1}
                >
                  Келесі
                  <span className="btn__icon" aria-hidden="true">
                    ⏭
                  </span>
                </button>
                <span className="badge">
                  {current + 1} / {tokens.length}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card" data-animate aria-live="polite">
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                📝
              </span>
              Сөздер{' '}
              <span className="badge">
                {foundCount}/{tokens.length}
              </span>
            </h2>
            {tokens.length ? (
              <p className="phrase">
                {tokens.map((t, i) => (
                  <button
                    type="button"
                    key={`${t.word}-${i}`}
                    className={`word-chip${i === current ? ' is-active' : ''}${!t.gesture ? ' word-chip--missing' : ''}`}
                    onClick={() => jumpTo(i)}
                  >
                    {t.gesture?.icon && <span aria-hidden="true">{t.gesture.icon}</span>}
                    {t.word}
                    {!t.gesture && (
                      <span className="word-chip__mark" aria-hidden="true">
                        ?
                      </span>
                    )}
                  </button>
                ))}
              </p>
            ) : (
              <p className="hint">Мәтінді солдан жазып жіберіңіз — сөздер осында тізбектеліп шығады.</p>
            )}
          </div>

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                📚
              </span>
              Кітапханадағы сөздер{' '}
              <span className="badge">{libStatus === 'loading' ? '…' : moduleLibrary.length}</span>
            </h2>
            <p className="hint">Кез келгенін басып, жеке қарап шығыңыз.</p>
            {moduleLibrary.length ? (
              <div className="word-chip-list">
                {moduleLibrary.map((g) => (
                  <button type="button" key={g.id} className="word-chip" onClick={() => previewGesture(g)}>
                    <span aria-hidden="true">{g.icon ?? '🖐️'}</span> {g.label_kk}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">
                Әзірге жазылған жест жоқ. <Link to={LIBRARY_PAGE.path}>{LIBRARY_PAGE.title}</Link> бетінде қосыңыз.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
