import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GestureEngine } from '../core/GestureEngine.js'
import { useGestureLibrary } from '../hooks/useGestureLibrary.js'
import { useGestureRecorder } from '../hooks/useGestureRecorder.js'
import { useSpeech } from '../hooks/useSpeech.js'
import CameraView from '../components/CameraView.jsx'
import GestureRecorder from '../components/GestureRecorder.jsx'
import GestureList from '../components/GestureList.jsx'
import { LIBRARY_PAGE } from '../modules.js'

/** Как часто обновлять живые «полоски» похожести (мс). */
const SCORE_INTERVAL_MS = 150

/**
 * «Кітапхана» — запись новых жестов с камеры и проверка всей библиотеки:
 * пока камера работает, у каждого жеста видна живая похожесть, а сработавший
 * жест озвучивается — так сразу понятно, распознаётся ли новая запись.
 */
export default function LibraryPage() {
  const { library, status, add, remove } = useGestureLibrary()
  const recorder = useGestureRecorder()
  const { speak } = useSpeech()
  const engine = useMemo(() => new GestureEngine([]), [])
  const [cameraRunning, setCameraRunning] = useState(false)
  const [scores, setScores] = useState(null)
  const [fired, setFired] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const lastScoreAt = useRef(0)
  // рекордер — через ref, чтобы колбэки камеры оставались стабильными между рендерами
  const recorderRef = useRef(recorder)
  recorderRef.current = recorder

  useEffect(() => engine.setReference(library), [engine, library])

  useEffect(() => {
    const off = engine.onMatch((m) => {
      setFired({ gesture: m.gesture, confidence: m.confidence, at: Date.now() })
      speak(m.gesture)
    })
    return () => {
      off()
      engine.dispose()
    }
  }, [engine, speak])

  const handleFrame = useCallback(
    (frame) => {
      const rec = recorderRef.current
      rec.onFrame(frame)
      // во время записи движок не мешаем — иначе новый жест «срабатывает» как старый
      if (rec.phase === 'countdown' || rec.phase === 'recording') return
      engine.matchGesture(frame)
      const now = performance.now()
      if (now - lastScoreAt.current > SCORE_INTERVAL_MS) {
        lastScoreAt.current = now
        setScores(new Map(engine.scoreAll(frame).map((s) => [s.gesture.id, s])))
      }
    },
    [engine],
  )

  const handleStatus = useCallback(
    (s) => {
      setCameraRunning(s === 'running')
      if (s !== 'running') {
        engine.reset()
        setScores(null)
        recorderRef.current.reset()
      }
    },
    [engine],
  )

  const handleSave = async (gesture) => {
    setSaving(true)
    try {
      const res = await add(gesture)
      setNotice({
        kind: 'ok',
        text:
          res.source === 'server'
            ? `«${res.gesture.label_kk}» сақталды${res.audioGenerated ? ' және дауысталды' : ' (дауыс: браузер синтезі)'}. Енді оны камераға көрсетіп тексеріңіз.`
            : `«${res.gesture.label_kk}» осы браузерде сақталды (сервер қолжетімсіз — npm run dev:server).`,
      })
    } catch (err) {
      setNotice({ kind: 'error', text: `Сақтау мүмкін болмады: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g) => {
    if (!window.confirm(`«${g.label_kk}» жестін өшіру керек пе?`)) return
    await remove(g.id)
    setNotice({ kind: 'ok', text: `«${g.label_kk}» өшірілді.` })
  }

  const overlay =
    recorder.phase === 'countdown' ? (
      <div className="record-overlay" role="status">
        <span className="record-overlay__count">{recorder.countdown}</span>
        <span>Дайындалыңыз…</span>
      </div>
    ) : recorder.phase === 'recording' ? (
      <div className="record-overlay record-overlay--rec" role="status">
        <span className="record-overlay__dot" aria-hidden="true" />
        <span>Жазылуда — қолды кадрда ұстаңыз</span>
        <span className="record-overlay__bar">
          <span style={{ width: `${Math.round(recorder.progress * 100)}%` }} />
        </span>
      </div>
    ) : null

  const custom = library.filter((g) => !g.builtin)
  const builtin = library.filter((g) => g.builtin)

  return (
    <>
      <section className="page-head" data-animate>
        <span className="badge badge--primary">
          <span aria-hidden="true">{LIBRARY_PAGE.icon}</span> {LIBRARY_PAGE.short}
        </span>
        <h1>{LIBRARY_PAGE.title}</h1>
        <p className="page-head__lead">
          Жаңа жестті камераға көрсетіп жазыңыз — ол бірден барлық модульде танылып, дауыстап оқылады. Төмендегі тізімде
          камера қосулы кезде әр жестке ұқсастық пайызы көрсетіледі.
        </p>
      </section>

      <section className="grid-2">
        <div className="stack">
          <div data-animate>
            <CameraView numHands={2} onFrame={handleFrame} onStatus={handleStatus} frameOverlay={overlay} />
          </div>
          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                ⏺
              </span>
              Жаңа жест жазу
            </h2>
            <GestureRecorder recorder={recorder} cameraRunning={cameraRunning} onSave={handleSave} saving={saving} />
            {notice && (
              <p className={`notice notice--${notice.kind}`} role="status">
                {notice.text}
              </p>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card" data-animate aria-live="polite">
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                🔎
              </span>
              Тексеру
            </h2>
            {fired ? (
              <div className="result-card__value">
                {fired.gesture.icon ?? '📹'} {fired.gesture.label_kk}{' '}
                <span className="badge">🎯 {Math.round(fired.confidence * 100)}%</span>
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                {cameraRunning ? 'Кітапханадағы кез келген жестті көрсетіңіз — танылған жест осында шығады.' : 'Камераны қосып, жестті көрсетіңіз.'}
              </p>
            )}
          </div>

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                📹
              </span>
              Жазылған жесттер{' '}
              <span className="badge">{status === 'loading' ? '…' : custom.length}</span>
            </h2>
            {status === 'local' && (
              <p className="notice notice--warn">Сервер қолжетімсіз: жесттер тек осы браузерде сақталады (npm run dev:server).</p>
            )}
            <GestureList gestures={custom} scores={scores} onDelete={handleDelete} />
          </div>

          <div className="card" data-animate>
            <h2 className="card__title">
              <span className="card__icon" aria-hidden="true">
                ⚙️
              </span>
              Кірістірілген жесттер <span className="badge">{builtin.length}</span>
            </h2>
            <p className="hint">Демонстрациялық жиынтық — жалпыға таныс қол пішіндері. Нағыз ҚЖТ жесттерін жоғарыдағы формамен жазыңыз.</p>
            <GestureList gestures={builtin} scores={scores} />
          </div>
        </div>
      </section>
    </>
  )
}
