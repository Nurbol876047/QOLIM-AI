import { useCallback, useEffect, useRef } from 'react'
import { useHandTracker } from '../hooks/useHandTracker.js'
import SkeletonOverlay from '../ui/SkeletonOverlay.jsx'
import PrivacyNotice from './PrivacyNotice.jsx'

/**
 * CameraView — общий блок «камера + скелет руки» для всех модулей:
 * privacy-уведомление, видео (зеркально), PixiJS-оверлей с точками кисти,
 * статусы (ожидание / загрузка / ошибка) и кнопки запуска-остановки.
 *
 *   <CameraView numHands={2} onFrame={(frame) => engine.matchGesture(frame)} />
 *
 * frameOverlay — произвольный слой поверх видео (обратный отсчёт записи и т.п.).
 *
 * Камера НЕ включается сама — только по кнопке (или autoStart), чтобы запрос
 * доступа не был неожиданным.
 */
export default function CameraView({
  numHands = 2,
  face = false,
  mirrored = true,
  showSkeleton = true,
  autoStart = false,
  onFrame,
  onStatus,
  frameOverlay = null,
  children,
}) {
  const overlayRef = useRef(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const handleFrame = useCallback(
    (frame) => {
      if (showSkeleton) overlayRef.current?.draw(frame.landmarks)
      onFrameRef.current?.(frame)
    },
    [showSkeleton],
  )

  const { videoRef, status, message, info, start, stop } = useHandTracker({ numHands, face, onFrame: handleFrame })

  useEffect(() => {
    onStatus?.(status, message)
    if (status !== 'running') overlayRef.current?.clear()
  }, [status, message, onStatus])

  useEffect(() => {
    if (autoStart) start()
  }, [autoStart, start])

  const aspect = info.videoWidth && info.videoHeight ? `${info.videoWidth} / ${info.videoHeight}` : '4 / 3'

  return (
    <div className="camera-view">
      <PrivacyNotice />

      <div className="camera-view__frame" style={{ '--camera-aspect': aspect }}>
        <video ref={videoRef} className="camera-view__video" playsInline muted autoPlay aria-label="Камера бейнесі" />
        <SkeletonOverlay ref={overlayRef} mirrored={mirrored} />

        {status === 'running' && frameOverlay}

        {status === 'running' && (
          <div className="camera-view__hud" aria-live="polite">
            <span className="badge badge--primary">
              <span aria-hidden="true">🖐️</span> Қол: {info.hands}
            </span>
            <span className="badge">
              <span aria-hidden="true">⏱</span> {info.fps} к/с
            </span>
          </div>
        )}

        {status !== 'running' && (
          <div className={`camera-view__status${status === 'error' ? ' camera-view__status--error' : ''}`} role="status" aria-live="polite">
            {status === 'idle' && (
              <>
                <p>Камераны қосыңыз — қолыңыз кадрда көрінеді, нүктелер мен сүйектер оның үстінен салынады.</p>
                <button type="button" className="btn btn-primary" onClick={start}>
                  <span className="btn__icon" aria-hidden="true">
                    📷
                  </span>
                  Камераны қосу
                </button>
              </>
            )}
            {status === 'loading' && (
              <>
                <div className="spinner" aria-hidden="true" />
                <p>Камера мен қол моделі жүктелуде…</p>
              </>
            )}
            {status === 'error' && (
              <>
                <p>
                  <span aria-hidden="true">⚠️ </span>
                  {message}
                </p>
                <button type="button" className="btn btn-secondary" onClick={start}>
                  <span className="btn__icon" aria-hidden="true">
                    ↻
                  </span>
                  Қайталап көру
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="camera-view__controls">
        {status === 'running' && (
          <button type="button" className="btn btn-ghost" onClick={stop}>
            <span className="btn__icon" aria-hidden="true">
              ⏹
            </span>
            Камераны тоқтату
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
