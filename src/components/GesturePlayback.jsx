import { useEffect, useRef, useState } from 'react'
import SkeletonOverlay from '../ui/SkeletonOverlay.jsx'

/** Линейная интерполяция между двумя наборами из 21 точки (для промежуточных кадров). */
function lerpHand(a, b, t) {
  if (!a || !b || a.length !== b.length) return a ?? b ?? null
  return a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }))
}

/**
 * GesturePlayback — показывает эталонный жест без камеры для модуля «Мәтін → жест».
 * Приоритет источников:
 *   1) gesture.video   — видео «кейіпкер осы жестті көрсетеді» (public/videos/{id}.mp4);
 *      файла может ещё не быть (см. gestureLibrary.js) — onError тихо переключает на (2)/(3);
 *   2) landmarksSequence — записанные через камеру (Кітапхана) landmarks на SkeletonOverlay:
 *      один кадр держится неподвижно, несколько — зацикленно интерполируются по времени t;
 *   3) ни того, ни другого — постер со стикером и подсказкой «как показать» (только у
 *      встроенных демо-жестов, где есть лишь shape-описание).
 */
export default function GesturePlayback({ gesture, className = '' }) {
  const overlayRef = useRef(null)
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => setVideoFailed(false), [gesture])

  const useVideo = !!gesture?.video && !videoFailed

  useEffect(() => {
    const overlay = overlayRef.current
    const seq = gesture?.landmarksSequence
    if (useVideo || !overlay || !seq?.length) return undefined

    const frames = seq.map((f, i) => ({ ...f, t: f.t ?? i * 400 }))
    const duration = Math.max(1, frames[frames.length - 1].t)
    const start = performance.now()
    // рисуем каждый кадр rAF, а не один раз: PixiJS Application.init() асинхронный —
    // единичный draw() до его завершения молча не сработает и статичный жест
    // так и останется пустым канвасом (цикл сам себя чинит, как в живой камере)
    let raf = requestAnimationFrame(tick)
    function tick(now) {
      if (frames.length === 1) {
        overlay.draw([frames[0].hand, frames[0].hand2].filter(Boolean))
      } else {
        const elapsed = (now - start) % duration
        let i = 0
        while (i < frames.length - 1 && frames[i + 1].t < elapsed) i++
        const a = frames[i]
        const b = frames[Math.min(i + 1, frames.length - 1)]
        const span = Math.max(1, b.t - a.t)
        const t = Math.min(1, Math.max(0, (elapsed - a.t) / span))
        overlay.draw([lerpHand(a.hand, b.hand, t), lerpHand(a.hand2, b.hand2, t)].filter(Boolean))
      }
      raf = requestAnimationFrame(tick)
    }
    return () => cancelAnimationFrame(raf)
  }, [gesture, useVideo])

  if (!gesture) return null

  if (useVideo) {
    return (
      <div className={`camera-view__frame gesture-stage__frame ${className}`}>
        <video
          key={gesture.video}
          className="gesture-stage__video"
          src={gesture.video}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoFailed(true)}
        />
      </div>
    )
  }

  const seq = gesture.landmarksSequence
  if (!seq?.length) {
    return (
      <div className={`camera-view__frame gesture-stage__frame ${className}`}>
        <div className="gesture-stage__poster">
          <span className="gesture-stage__poster-icon" aria-hidden="true">
            {gesture.icon ?? '🖐️'}
          </span>
          <strong>{gesture.label_kk}</strong>
          {gesture.hint_kk && <p className="hint">{gesture.hint_kk}</p>}
          <p className="hint">Бұл — демонстрациялық пішін, камерамен жазылған қимыл жоқ.</p>
        </div>
      </div>
    )
  }

  const aspect = seq[0]?.aspect
  return (
    <div className={`camera-view__frame gesture-stage__frame ${className}`} style={aspect ? { '--camera-aspect': aspect } : undefined}>
      <SkeletonOverlay ref={overlayRef} mirrored />
      <div className="camera-view__hud" aria-hidden="true">
        <span className="badge badge--primary">
          <span aria-hidden="true">{gesture.icon ?? '🖐️'}</span> {gesture.label_kk}
        </span>
        {seq.length > 1 && <span className="badge">🎞️ Қозғалысты</span>}
      </div>
    </div>
  )
}
