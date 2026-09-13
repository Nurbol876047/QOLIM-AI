import { useCallback, useEffect, useRef, useState } from 'react'
import { HandTracker } from '../core/HandTracker.js'

/** Как часто обновлять «медленное» состояние для UI (число рук, fps) — не чаще, чем раз в … мс. */
const UI_UPDATE_MS = 250

/**
 * React-обёртка над core/HandTracker: один трекер на компонент, статусы в state,
 * кадры — через колбэк onFrame (без ререндера на каждый кадр).
 *
 *   const { videoRef, status, message, start, stop, info } = useHandTracker({ numHands: 2, onFrame })
 *
 * onFrame получает TrackerFrame (см. HandTracker.js) на каждый кадр детекции.
 */
export function useHandTracker({ numHands = 2, face = false, onFrame } = {}) {
  const videoRef = useRef(null)
  const trackerRef = useRef(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [info, setInfo] = useState({ hands: 0, fps: 0, videoWidth: 0, videoHeight: 0 })
  const lastInfoAt = useRef(0)

  // трекер создаём один раз на время жизни компонента
  useEffect(() => {
    const tracker = new HandTracker({ numHands, face })
    trackerRef.current = tracker
    const offStatus = tracker.onStatus((s, m) => {
      setStatus(s)
      setMessage(m ?? '')
      if (s !== 'running') setInfo({ hands: 0, fps: 0, videoWidth: 0, videoHeight: 0 })
    })
    const offResults = tracker.onResults((frame) => {
      onFrameRef.current?.(frame)
      const now = performance.now()
      if (now - lastInfoAt.current > UI_UPDATE_MS) {
        lastInfoAt.current = now
        setInfo({
          hands: frame.landmarks.length,
          fps: Math.round(frame.fps),
          videoWidth: frame.videoWidth,
          videoHeight: frame.videoHeight,
        })
      }
    })
    return () => {
      offStatus()
      offResults()
      tracker.dispose()
      trackerRef.current = null
    }
  }, [numHands, face])

  const start = useCallback(() => {
    if (videoRef.current && trackerRef.current) return trackerRef.current.start(videoRef.current)
    return Promise.resolve()
  }, [])

  const stop = useCallback(() => {
    trackerRef.current?.stop()
  }, [])

  return { videoRef, status, message, info, start, stop, tracker: trackerRef }
}
