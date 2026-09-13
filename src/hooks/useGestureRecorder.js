import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Запись эталона жеста с камеры (страница «Кітапхана»).
 *
 * Сценарий: start() → обратный отсчёт COUNTDOWN_MS → запись (статичный жест —
 * STATIC_MS, с движением — DYNAMIC_MS) → готовый landmarksSequence:
 *   статичный — один кадр: среднее по всем записанным кадрам (гасит дрожание);
 *   с движением — DYNAMIC_KEYFRAMES кадров, равномерно по времени записи.
 * Если в большинстве кадров две руки — эталон двуручный (hand + hand2).
 *
 * Кадры приходят через onFrame (подключается к CameraView.onFrame).
 */

// ---------- НАСТРОЙКИ ----------
export const COUNTDOWN_MS = 3000
export const STATIC_MS = 1200
export const DYNAMIC_MS = 2000
export const DYNAMIC_KEYFRAMES = 5
/** Минимум кадров с рукой, иначе запись считается неудачной. */
const MIN_FRAMES = 6

const mode = (arr) => {
  const counts = new Map()
  let best = null
  for (const v of arr) {
    if (v == null) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
    if (best == null || counts.get(v) > counts.get(best)) best = v
  }
  return best
}

/** Среднее 21 точки по кадрам. */
function averageHand(hands) {
  const out = []
  for (let i = 0; i < 21; i++) {
    let x = 0
    let y = 0
    let z = 0
    for (const h of hands) {
      x += h[i].x
      y += h[i].y
      z += h[i].z ?? 0
    }
    out.push({ x: x / hands.length, y: y / hands.length, z: z / hands.length })
  }
  return out
}

/** Руки кадра в устойчивом порядке — слева направо по запястью, чтобы hand/hand2 не менялись местами между кадрами. */
function orderedHands(frame) {
  const idx = frame.landmarks.map((_, i) => i).sort((a, b) => frame.landmarks[a][0].x - frame.landmarks[b][0].x)
  return idx.map((i) => ({ hand: frame.landmarks[i], label: frame.handedness?.[i]?.categoryName ?? null }))
}

/** Собирает landmarksSequence из записанных кадров. */
export function buildKeyframes(frames, kind) {
  const twoHanded = frames.filter((f) => f.landmarks.length >= 2).length >= frames.length * 0.6
  const usable = frames.filter((f) => (twoHanded ? f.landmarks.length >= 2 : f.landmarks.length >= 1))
  if (usable.length < MIN_FRAMES) return null
  const aspect = usable[0].videoWidth && usable[0].videoHeight ? usable[0].videoWidth / usable[0].videoHeight : 4 / 3
  const t0 = usable[0].timestamp

  const toKeyframe = (list, t) => {
    const slots = list.map(orderedHands)
    const kf = {
      hand: averageHand(slots.map((s) => s[0].hand)),
      handedness: mode(slots.map((s) => s[0].label)) ?? undefined,
      aspect,
      t,
    }
    if (twoHanded) {
      kf.hand2 = averageHand(slots.map((s) => s[1].hand))
      kf.handedness2 = mode(slots.map((s) => s[1].label)) ?? undefined
    }
    return kf
  }

  if (kind === 'static') return [toKeyframe(usable, 0)]

  // с движением: равномерно по времени берём DYNAMIC_KEYFRAMES ближайших кадров
  const t1 = usable[usable.length - 1].timestamp
  const keyframes = []
  for (let k = 0; k < DYNAMIC_KEYFRAMES; k++) {
    const target = t0 + ((t1 - t0) * k) / (DYNAMIC_KEYFRAMES - 1)
    let nearest = usable[0]
    for (const f of usable) if (Math.abs(f.timestamp - target) < Math.abs(nearest.timestamp - target)) nearest = f
    keyframes.push(toKeyframe([nearest], Math.round(nearest.timestamp - t0)))
  }
  return keyframes
}

export function useGestureRecorder() {
  const [phase, setPhase] = useState('idle') // idle | countdown | recording | done | error
  const [countdown, setCountdown] = useState(0)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null) // { kind, keyframes, frames, twoHanded }
  const [error, setError] = useState('')

  const phaseRef = useRef('idle')
  const framesRef = useRef([])
  const kindRef = useRef('static')
  const timers = useRef([])
  const recordingStart = useRef(0)

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }

  const setPhaseBoth = (p) => {
    phaseRef.current = p
    setPhase(p)
  }

  /** Подключается к CameraView.onFrame. */
  const onFrame = useCallback((frame) => {
    if (phaseRef.current !== 'recording') return
    if (frame.landmarks.length === 0) return
    framesRef.current.push(frame)
    const dur = kindRef.current === 'static' ? STATIC_MS : DYNAMIC_MS
    setProgress(Math.min(1, (frame.timestamp - recordingStart.current) / dur))
  }, [])

  const finish = useCallback(() => {
    const keyframes = buildKeyframes(framesRef.current, kindRef.current)
    if (!keyframes) {
      setError('Қол кадрда анық көрінбеді. Қолыңызды камераға жақынырақ ұстап, қайталап көріңіз.')
      setPhaseBoth('error')
      return
    }
    setResult({
      kind: kindRef.current,
      keyframes,
      frames: framesRef.current.length,
      twoHanded: !!keyframes[0].hand2,
    })
    setPhaseBoth('done')
  }, [])

  /** @param {'static'|'dynamic'} kind */
  const start = useCallback(
    (kind = 'static') => {
      clearTimers()
      kindRef.current = kind
      framesRef.current = []
      setResult(null)
      setError('')
      setProgress(0)
      setPhaseBoth('countdown')
      const steps = Math.ceil(COUNTDOWN_MS / 1000)
      setCountdown(steps)
      for (let i = 1; i < steps; i++) timers.current.push(setTimeout(() => setCountdown(steps - i), i * 1000))
      timers.current.push(
        setTimeout(() => {
          recordingStart.current = performance.now()
          setPhaseBoth('recording')
          timers.current.push(setTimeout(finish, kind === 'static' ? STATIC_MS : DYNAMIC_MS))
        }, COUNTDOWN_MS),
      )
    },
    [finish],
  )

  const reset = useCallback(() => {
    clearTimers()
    framesRef.current = []
    setResult(null)
    setError('')
    setProgress(0)
    setPhaseBoth('idle')
  }, [])

  useEffect(() => clearTimers, [])

  return { phase, countdown, progress, result, error, onFrame, start, reset }
}
