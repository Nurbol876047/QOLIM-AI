import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GestureEngine } from '../core/GestureEngine.js'
import { useGestureLibrary } from '../hooks/useGestureLibrary.js'
import { useSpeech } from '../hooks/useSpeech.js'
import { LIBRARY_PAGE, moduleById } from '../modules.js'
import CameraView from '../components/CameraView.jsx'
import GestureList from '../components/GestureList.jsx'
import { pulse } from '../ui/Transitions.js'

/** Как часто обновлять живую подсказку «что вижу» (мс) и сколько слов держать в строке. */
const CANDIDATE_INTERVAL_MS = 100
const PHRASE_MAX_WORDS = 12

/**
 * Модуль 1 — «Жест → мәтін / дауыс».
 * Камера → GestureEngine → распознанный жест показывается, озвучивается и
 * добавляется в строку-фразу. Всё распознавание — в движке; здесь только UI.
 */
export default function CoreRecognitionPage() {
  const module = moduleById('core')
  const { library, status: libStatus } = useGestureLibrary()
  const engine = useMemo(() => new GestureEngine([]), [])
  const { enabled: voiceOn, toggle: toggleVoice, speak, say, speaking } = useSpeech()

  const [result, setResult] = useState(null) // { text, confidence, gesture }
  const [phrase, setPhrase] = useState([]) // распознанные слова подряд
  const [candidate, setCandidate] = useState(null) // { gesture, confidence, heldMs, progress }
  const [cameraRunning, setCameraRunning] = useState(false)
  const resultRef = useRef(null)

  useEffect(() => engine.setReference(library), [engine, library])

  useEffect(() => {
    const off = engine.onMatch((m) => {
      setResult({ text: m.gesture.label_text, confidence: m.confidence, gesture: m.gesture })
      setPhrase((p) => [...p, m.gesture.label_text].slice(-PHRASE_MAX_WORDS))
      speak(m.gesture)
    })
    return () => {
      off()
      engine.dispose()
    }
  }, [engine, speak])

  // каждый кадр из камеры → движок; ререндер только при срабатывании жеста (через onMatch)
  const handleFrame = useCallback((frame) => engine.matchGesture(frame), [engine])
  const handleStatus = useCallback(
    (status) => {
      setCameraRunning(status === 'running')
      if (status !== 'running') {
        engine.reset()
        setCandidate(null)
      }
    },
    [engine],
  )

  // живая подсказка «что вижу» — опрос движка, а не ререндер на каждый кадр
  useEffect(() => {
    if (!cameraRunning) return undefined
    const timer = setInterval(() => {
      const c = engine.candidate
      setCandidate((prev) => {
        const next = { gesture: c.gesture, confidence: c.confidence, heldMs: c.heldMs, progress: c.progress }
        if (
          prev &&
          prev.gesture === next.gesture &&
          Math.abs(prev.confidence - next.confidence) < 0.02 &&
          Math.abs(prev.heldMs - next.heldMs) < 50 &&
          prev.progress === next.progress
        ) {
          return prev
        }
        return next
      })
    }, CANDIDATE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [cameraRunning, engine])

  useEffect(() => {
    if (result) pulse(resultRef.current)
  }, [result])

  const holdRatio = candidate?.gesture ? Math.min(1, candidate.heldMs / engine.options.holdMs) : 0
  const barWidth = candidate ? Math.round(Math.max(holdRatio, candidate.progress) * 100) : 0

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
          <div data-animate>
            <CameraView numHands={2} onFrame={handleFrame} onStatus={handleStatus}>
              <button
                type="button"
                className="btn btn-ghost"
                aria-pressed={voiceOn}
                onClick={toggleVoice}
                title={voiceOn ? 'Дауысты өшіру' : 'Дауысты қосу'}
              >
                <span className="btn__icon" aria-hidden="true">
                  {voiceOn ? '🔊' : '🔇'}
                </span>
                Дауыс: {voiceOn ? 'қосулы' : 'өшірулі'}
              </button>
            </CameraView>
          </div>

          {cameraRunning && (
            <div className={`card live${candidate?.gesture?.category === 'emergency' ? ' live--alert' : ''}`} data-animate aria-live="polite">
              <div className="live__row">
                <span className="live__label">Көріп тұрмын:</span>
                {candidate?.gesture ? (
                  <span className={`live__value${candidate.gesture.category === 'emergency' ? ' live__value--alert' : ''}`}>
                    <span className="live__sticker" aria-hidden="true">{candidate.gesture.icon ?? '📹'}</span> {candidate.gesture.label_kk}
                    <span className="badge">🎯 {Math.round(candidate.confidence * 100)}%</span>
                  </span>
                ) : (
                  <span className="hint">
                    {candidate?.progress > 0 ? 'қозғалысты жест: жалғастырыңыз…' : 'таныс жест жоқ — кітапханадағы жесттердің бірін көрсетіңіз'}
                  </span>
                )}
              </div>
              <div className="progress" aria-hidden="true">
                <div className="progress__bar" style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          )}

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                📚
              </span>
              Танылатын жесттер <span className="badge">{libStatus === 'loading' ? '…' : library.length}</span>
            </h2>
            <GestureList gestures={library} compact activeId={result?.gesture?.id ?? null} />
            <p className="hint" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
              Өз жестіңізді қосу: <Link to={LIBRARY_PAGE.path}>{LIBRARY_PAGE.title}</Link>.
            </p>
          </div>
        </div>

        <div className="stack">
          <div
            className={`card result-card${result?.gesture?.category === 'emergency' ? ' result-card--alert' : ''}`}
            data-animate
            ref={resultRef}
            aria-live="polite"
          >
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                💬
              </span>
              Нәтиже
            </h2>
            {result ? (
              <>
                {result.gesture?.icon && (
                  <span className="result-card__sticker" aria-hidden="true">
                    {result.gesture.icon}
                  </span>
                )}
                <div className="result-card__value">{result.text}</div>
                <div className="result-card__meta">
                  <span className="badge">
                    <span aria-hidden="true">🎯</span> Сенімділік: {Math.round(result.confidence * 100)}%
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => speak(result.gesture, { force: true })}
                    disabled={speaking}
                  >
                    <span className="btn__icon" aria-hidden="true">
                      🔊
                    </span>
                    Қайта оқу
                  </button>
                </div>
              </>
            ) : (
              <div className="result-card__value result-card__value--empty">
                Камераны қосып, кітапханадағы жестті көрсетіңіз — сөз осында шығып, дауыстап оқылады.
              </div>
            )}
          </div>

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                📝
              </span>
              Сөйлем
            </h2>
            {phrase.length ? (
              <p className="phrase" aria-live="polite">
                {phrase.map((w, i) => (
                  <span key={`${w}-${i}`} className="phrase__word">
                    {w}
                  </span>
                ))}
              </p>
            ) : (
              <p className="hint">Танылған сөздер осында тізбектеліп жиналады.</p>
            )}
            <div className="camera-view__controls">
              <button type="button" className="btn btn-secondary" onClick={() => say(phrase.join(' '), { force: true })} disabled={!phrase.length || speaking}>
                <span className="btn__icon" aria-hidden="true">
                  🔊
                </span>
                Оқу
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPhrase([])} disabled={!phrase.length}>
                <span className="btn__icon" aria-hidden="true">
                  🧹
                </span>
                Тазалау
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
