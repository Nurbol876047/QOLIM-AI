import {
  INDEX_MCP, INDEX_PIP, INDEX_TIP, MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP, PINKY_MCP, PINKY_PIP, PINKY_TIP,
  RING_MCP, RING_PIP, RING_TIP, THUMB_IP, THUMB_MCP, THUMB_TIP, WRIST,
} from './handLandmarks.js'

/**
 * Геометрия кисти для GestureEngine: нормализация 21 точки и вычисление признаков
 * (раскрытость пальцев, направление большого пальца, щипок…).
 *
 * Координаты MediaPipe нормализованы к кадру (0..1 по x и по y), поэтому при
 * неквадратном видео масштаб осей разный. Сначала переводим в «метрическое»
 * пространство (x умножаем на aspect = ширина/высота), потом все расстояния
 * делим на «размер кисти» — расстояние от запястья (0) до основания среднего
 * пальца (9). Так признаки не зависят от того, как далеко рука от камеры.
 */

// ---------- ПОРОГИ — подстраивать под реальную камеру здесь ----------

/**
 * Палец считается полностью выпрямленным, когда dist(кончик, запястье) / dist(PIP, запястье)
 * достигает этого значения (≈1.3 у прямого пальца), и полностью согнутым — на CURL_RATIO_MIN (≈0.9).
 * Между ними раскрытость меняется линейно 0..1.
 */
export const CURL_RATIO_MIN = 0.95
export const CURL_RATIO_MAX = 1.25
/** Большой палец: раскрыт, если его кончик дальше центра ладони, чем это × размер кисти (согнут ≈0.55, отведён ≈1.1). */
export const THUMB_OPEN_MIN = 0.6
export const THUMB_OPEN_MAX = 1.0
/** Щипок: dist(большой, указательный) / размер кисти меньше этого. */
export const PINCH_RATIO = 0.3
/** Направление считается «вверх/вниз», если |dy| нормированного вектора больше этого. */
export const DIRECTION_AXIS_MIN = 0.6

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky']

const FINGERS = [
  { name: 'index', pip: INDEX_PIP, tip: INDEX_TIP },
  { name: 'middle', pip: MIDDLE_PIP, tip: MIDDLE_TIP },
  { name: 'ring', pip: RING_PIP, tip: RING_TIP },
  { name: 'pinky', pip: PINKY_PIP, tip: PINKY_TIP },
]

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ramp = (v, lo, hi) => clamp01((v - lo) / (hi - lo))

/** Нормализованные точки MediaPipe → «метрические» (x с поправкой на соотношение сторон кадра). */
export function toMetric(landmarks, aspect = 4 / 3) {
  return landmarks.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z ?? 0 }))
}

/** Размер кисти в метрическом пространстве. */
export const handSize = (pts) => dist(pts[WRIST], pts[MIDDLE_MCP]) || 1e-6

/** Центр ладони — среднее запястья и четырёх оснований пальцев. */
export function palmCenter(pts) {
  const ids = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP]
  const c = { x: 0, y: 0 }
  for (const i of ids) {
    c.x += pts[i].x / ids.length
    c.y += pts[i].y / ids.length
  }
  return c
}

/**
 * Каноническая форма кисти для сравнения с эталонами: запястье в начале координат,
 * масштаб — размер кисти, левая рука зеркалится в правую (эталон подходит обеим рукам).
 * @param {Array<{x:number,y:number}>} landmarks  сырые точки MediaPipe (0..1)
 * @param {number} aspect                         ширина/высота кадра
 * @param {'Left'|'Right'|null} handedness
 * @returns {Array<{x:number,y:number}>}          21 точка
 */
export function normalizeHand(landmarks, aspect, handedness) {
  const pts = toMetric(landmarks, aspect)
  const origin = pts[WRIST]
  const scale = handSize(pts)
  const sign = handedness === 'Left' ? -1 : 1
  return pts.map((p) => ({ x: (sign * (p.x - origin.x)) / scale, y: (p.y - origin.y) / scale }))
}

/**
 * Признаки формы кисти.
 * @param {Array<{x:number,y:number}>} landmarks  сырые точки MediaPipe (0..1)
 * @param {number} aspect
 * @returns {{
 *   fingers: number[],        раскрытость 0..1 в порядке FINGER_NAMES (thumb, index, middle, ring, pinky)
 *   thumbDir: 'up'|'down'|'side',
 *   pointDir: 'up'|'down'|'side',   куда смотрит указательный (от MCP к кончику)
 *   pinch: number,            0..1 — насколько сомкнуты большой и указательный
 *   spread: number            расстояние между кончиками указательного и среднего / размер кисти
 * }}
 */
export function extractFeatures(landmarks, aspect = 4 / 3) {
  const pts = toMetric(landmarks, aspect)
  const size = handSize(pts)
  const wrist = pts[WRIST]
  const palm = palmCenter(pts)

  const fingers = [ramp(dist(pts[THUMB_TIP], palm) / size, THUMB_OPEN_MIN, THUMB_OPEN_MAX)]
  for (const f of FINGERS) {
    const ratio = dist(pts[f.tip], wrist) / (dist(pts[f.pip], wrist) || 1e-6)
    fingers.push(ramp(ratio, CURL_RATIO_MIN, CURL_RATIO_MAX))
  }

  const direction = (from, to) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1e-6
    const ny = dy / len
    if (ny < -DIRECTION_AXIS_MIN) return 'up' // y растёт вниз
    if (ny > DIRECTION_AXIS_MIN) return 'down'
    return 'side'
  }

  return {
    fingers,
    thumbDir: direction(pts[THUMB_MCP], pts[THUMB_TIP]),
    pointDir: direction(pts[INDEX_MCP], pts[INDEX_TIP]),
    pinch: 1 - ramp(dist(pts[THUMB_TIP], pts[INDEX_TIP]) / size, PINCH_RATIO * 0.7, PINCH_RATIO * 1.6),
    spread: dist(pts[INDEX_TIP], pts[MIDDLE_TIP]) / size,
    thumbIndexGap: dist(pts[THUMB_IP], pts[INDEX_MCP]) / size,
  }
}

/**
 * Похожесть признаков на описание формы из библиотеки (см. gestureLibrary.js → shape), 0..1.
 * Каждое заданное условие даёт оценку 0..1; итог — среднее, но при грубом промахе
 * хотя бы по одному условию итог не может быть выше 0.5 (чтобы «почти тот» жест не срабатывал).
 * @param {ReturnType<typeof extractFeatures>} f
 * @param {import('./gestureLibrary.js').GestureShape} shape
 */
export function compareShape(f, shape) {
  const scores = []
  let hardMiss = false

  if (shape.fingers) {
    shape.fingers.forEach((target, i) => {
      if (target == null) return // null — «любое положение»
      const diff = Math.abs(target - f.fingers[i])
      scores.push(1 - diff)
      if (diff > 0.6) hardMiss = true
    })
  }
  if (shape.thumbDir) {
    const ok = f.thumbDir === shape.thumbDir
    scores.push(ok ? 1 : 0)
    if (!ok) hardMiss = true
  }
  if (shape.pointDir) {
    const ok = f.pointDir === shape.pointDir
    scores.push(ok ? 1 : 0)
    if (!ok) hardMiss = true
  }
  if (shape.pinch != null) {
    const diff = Math.abs((shape.pinch ? 1 : 0) - f.pinch)
    scores.push(1 - diff)
    if (diff > 0.6) hardMiss = true
  }
  if (shape.minSpread != null) {
    const ok = f.spread >= shape.minSpread
    scores.push(ok ? 1 : ramp(f.spread, shape.minSpread * 0.5, shape.minSpread))
    if (f.spread < shape.minSpread * 0.5) hardMiss = true
  }

  if (scores.length === 0) return 0
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length
  return hardMiss ? Math.min(mean, 0.5) : mean
}

// ---------- сравнение с записанными эталонами ----------

/** Веса точек при сравнении: кончики важнее всего, запястье всегда в нуле. */
const POINT_WEIGHTS = [0, 1, 1.2, 1.6, 2.2, 1, 1.4, 1.8, 2.4, 1, 1.4, 1.8, 2.4, 1, 1.4, 1.8, 2.4, 1, 1.4, 1.8, 2.4]
const WEIGHT_SUM = POINT_WEIGHTS.reduce((s, w) => s + w, 0)
/** Взвешенное среднее расстояние (в размерах кисти): ≤ TEMPLATE_D0 — совпадение, ≥ TEMPLATE_D1 — точно не он. */
export const TEMPLATE_D0 = 0.08
export const TEMPLATE_D1 = 0.32

/**
 * Похожесть двух канонических кистей (см. normalizeHand), 0..1.
 * @param {Array<{x:number,y:number}>} a
 * @param {Array<{x:number,y:number}>} b
 */
export function compareHands(a, b) {
  if (!a || !b || a.length < 21 || b.length < 21) return 0
  let d = 0
  for (let i = 0; i < 21; i++) d += POINT_WEIGHTS[i] * dist(a[i], b[i])
  d /= WEIGHT_SUM
  return 1 - ramp(d, TEMPLATE_D0, TEMPLATE_D1)
}
