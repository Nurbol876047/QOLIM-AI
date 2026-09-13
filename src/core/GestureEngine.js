import { compareHands, compareShape, extractFeatures, normalizeHand } from './handFeatures.js'

/**
 * GestureEngine — ЦЕНТРАЛЬНЫЙ переиспользуемый движок распознавания жестов.
 *
 * Один экземпляр (или несколько с разными фильтрами) обслуживает все три модуля:
 *   модуль 1 просто отображает результат matchGesture();
 *   модуль 2 ставит setCategoryFilter('emergency') и работает с тем же кодом;
 *   модуль 3 подписывается через onMatch() и добавляет свой UI обратной связи.
 * Логика сравнения живёт только здесь — модули её не дублируют.
 *
 * Конвейер одного кадра (matchGesture):
 *   1. нормализация landmarks — поправка на соотношение сторон кадра, сдвиг в запястье,
 *      масштаб по размеру кисти, зеркалирование левой руки (handFeatures.js);
 *   2. сравнение с каждым эталоном активной библиотеки → confidence 0..1:
 *        shape             — признаки формы (раскрытость пальцев и т.п.) против правил;
 *        landmarksSequence — расстояние до записанных точек; несколько кадров —
 *                            жест с движением, кадры должны совпасть по порядку;
 *   3. выбор лучшего кандидата и порог minConfidence;
 *   4. временная стабилизация: статичный жест должен продержаться holdMs подряд,
 *      после срабатывания — пауза cooldownMs (защита от дрожания и двойных срабатываний);
 *      жест с движением срабатывает сразу по завершении последовательности;
 *   5. событие onMatch для подписчиков.
 *
 * @typedef {import('./gestureLibrary.js').ReferenceGesture} ReferenceGesture
 * @typedef {import('./gestureLibrary.js').Landmark} Landmark
 * @typedef {import('./HandTracker.js').TrackerFrame} TrackerFrame
 *
 * @typedef {Object} MatchResult
 * @property {ReferenceGesture} gesture   распознанный эталон
 * @property {number} confidence          уверенность 0..1
 * @property {number} timestamp           метка времени кадра (мс)
 *
 * @typedef {Object} Candidate  лучший кандидат текущего кадра (ещё до стабилизации) — для живой подсказки в UI
 * @property {ReferenceGesture|null} gesture
 * @property {number} confidence
 * @property {number} heldMs     сколько мс подряд держится этот кандидат
 * @property {number} progress   0..1 — для жестов с движением: сколько кадров последовательности уже совпало
 */

/** Настройки по умолчанию — подстраивать под реальную камеру здесь. */
export const DEFAULT_OPTIONS = {
  /** Ниже этого порога кандидат не считается распознанным. */
  minConfidence: 0.75,
  /** Сколько мс подряд один и тот же статичный жест должен держаться, чтобы сработать. */
  holdMs: 350,
  /** После срабатывания тот же жест не сработает повторно раньше, чем через это время. */
  cooldownMs: 1200,
  /** Порог совпадения одного кадра последовательности (жест с движением). */
  keyframeConfidence: 0.7,
  /** За сколько мс нужно успеть показать всю последовательность, иначе прогресс сбрасывается. */
  sequenceTimeoutMs: 2500,
}

/** Кэш нормализованных эталонов: пересчитываем только при смене объекта жеста. */
const preparedCache = new WeakMap()

export class GestureEngine {
  /**
   * @param {ReferenceGesture[]} referenceGestures  массив { id, label_kk, label_text, category, shape | landmarksSequence }
   * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
   */
  constructor(referenceGestures = [], options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    /** Полная библиотека эталонов. */
    this.reference = Array.isArray(referenceGestures) ? referenceGestures : []
    /** Какие категории учитываются; null — все. */
    this.categoryFilter = null
    /** @type {Set<(result: MatchResult) => void>} */
    this.listeners = new Set()
    /** Последний сработавший результат — модули могут показать его без своей памяти. */
    this.lastMatch = null
    /** @type {Candidate} лучший кандидат последнего кадра — для живой подсказки. */
    this.candidate = { gesture: null, confidence: 0, heldMs: 0, progress: 0 }
    this._reset()
  }

  // ---------- библиотека ----------

  /** Заменить библиотеку целиком (например, после загрузки записанных жестов с сервера). */
  setReference(referenceGestures) {
    this.reference = Array.isArray(referenceGestures) ? referenceGestures : []
    this._reset()
  }

  /**
   * Ограничить распознавание категориями: 'emergency', ['core', 'learning'] или null (все).
   * Так модуль 2 работает только с экстренными фразами, не трогая остальные жесты.
   */
  setCategoryFilter(categories) {
    if (categories == null) this.categoryFilter = null
    else this.categoryFilter = new Set(Array.isArray(categories) ? categories : [categories])
    this._reset()
  }

  /** Эталоны, с которыми реально идёт сравнение (с учётом фильтра). */
  get activeReference() {
    if (!this.categoryFilter) return this.reference
    return this.reference.filter((g) => this.categoryFilter.has(g.category))
  }

  // ---------- распознавание ----------

  /**
   * Сравнивает текущий кадр с библиотекой и возвращает сработавший жест.
   * Вызывается на каждый кадр из HandTracker.onResults.
   *
   * @param {TrackerFrame | Landmark[][]} input  кадр трекера (предпочтительно) или просто массив рук [рука][21 точка]
   * @param {number} [timestamp]                 метка времени кадра, мс (если передан массив рук)
   * @returns {MatchResult | null}               сработавший жест (уже прошедший стабилизацию) или null
   */
  matchGesture(input, timestamp) {
    const frame = Array.isArray(input)
      ? { landmarks: input, handedness: [], videoWidth: 4, videoHeight: 3, timestamp: timestamp ?? performance.now() }
      : input
    const ts = frame?.timestamp ?? timestamp ?? performance.now()
    const hands = (frame?.landmarks ?? []).filter((h) => h && h.length >= 21)
    const active = this.activeReference

    if (hands.length === 0 || active.length === 0) {
      this._resetSequences()
      return this._stabilize(null, 0, ts, 0)
    }

    // 1. нормализация (лениво, один раз на кадр)
    const ctx = this._prepareFrame(frame, hands)

    // 2–3. лучший кандидат по библиотеке
    let best = null
    let bestConfidence = 0
    let bestProgress = 0
    let completedSequence = null
    for (const gesture of active) {
      const { confidence, complete, progress } = this._compare(ctx, gesture, ts)
      if (complete && confidence >= this.options.minConfidence) {
        if (!completedSequence || confidence > completedSequence.confidence) completedSequence = { gesture, confidence }
      }
      if (confidence > bestConfidence) {
        best = gesture
        bestConfidence = confidence
        bestProgress = progress
      }
    }

    // жест с движением завершён — срабатывает сразу, без удержания
    if (completedSequence) {
      this.candidate = { gesture: completedSequence.gesture, confidence: completedSequence.confidence, heldMs: 0, progress: 1 }
      return this._fire(completedSequence.gesture, completedSequence.confidence, ts)
    }

    if (!best || bestConfidence < this.options.minConfidence) {
      return this._stabilize(null, 0, ts, bestProgress)
    }
    // 4–5. стабилизация и событие
    return this._stabilize(best, bestConfidence, ts, bestProgress)
  }

  /**
   * Похожесть кадра на КАЖДЫЙ активный эталон — без стабилизации и без побочных эффектов.
   * Нужна для живой обратной связи: список жестов с «полосками» на странице «Кітапхана»
   * и подсказка «насколько близко» в модуле обучения.
   * @param {TrackerFrame} frame
   * @returns {Array<{ gesture: ReferenceGesture, confidence: number, progress: number }>}
   */
  scoreAll(frame) {
    const hands = (frame?.landmarks ?? []).filter((h) => h && h.length >= 21)
    const active = this.activeReference
    if (hands.length === 0) return active.map((gesture) => ({ gesture, confidence: 0, progress: 0 }))
    const ctx = this._prepareFrame(frame, hands)
    return active.map((gesture) => {
      let confidence = 0
      if (gesture.shape) for (const f of ctx.features) confidence = Math.max(confidence, compareShape(f, gesture.shape))
      const keyframes = this._prepared(gesture)
      let progress = 0
      if (keyframes.length === 1) {
        confidence = Math.max(confidence, this._compareKeyframe(ctx, keyframes[0]))
      } else if (keyframes.length > 1) {
        const s = this._sequences.get(gesture.id)
        const idx = s?.idx ?? 0
        progress = idx / keyframes.length
        confidence = this._compareKeyframe(ctx, keyframes[idx])
      }
      return { gesture, confidence, progress }
    })
  }

  /**
   * Подписка на событие «жест распознан». Возвращает функцию отписки.
   * @param {(result: MatchResult) => void} callback
   */
  onMatch(callback) {
    if (typeof callback !== 'function') return () => {}
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  offMatch(callback) {
    this.listeners.delete(callback)
  }

  /** Сбросить состояние стабилизации (например, при перезапуске камеры или смене экрана). */
  reset() {
    this._reset()
  }

  dispose() {
    this.listeners.clear()
    this._reset()
  }

  // ---------- внутреннее ----------

  /** Шаг 1. Считает для кадра то, что нужно всем сравнениям: канонические кисти и признаки. */
  _prepareFrame(frame, hands) {
    const aspect = frame.videoWidth && frame.videoHeight ? frame.videoWidth / frame.videoHeight : 4 / 3
    const labels = hands.map((_, i) => frame.handedness?.[i]?.categoryName ?? null)
    let canonical = null
    let features = null
    return {
      aspect,
      hands,
      labels,
      // ленивые вычисления — считаем только если в библиотеке есть эталоны нужного типа
      get canonical() {
        if (!canonical) canonical = hands.map((h, i) => normalizeHand(h, aspect, labels[i]))
        return canonical
      },
      get features() {
        if (!features) features = hands.map((h) => extractFeatures(h, aspect))
        return features
      },
    }
  }

  /**
   * Шаг 2. Похожесть кадра на эталон, 0..1.
   * @returns {{ confidence: number, complete: boolean, progress: number }}
   */
  _compare(ctx, gesture, ts) {
    let confidence = 0

    if (gesture.shape) {
      for (const f of ctx.features) confidence = Math.max(confidence, compareShape(f, gesture.shape))
    }

    const keyframes = this._prepared(gesture)
    if (keyframes.length === 1) {
      confidence = Math.max(confidence, this._compareKeyframe(ctx, keyframes[0]))
    } else if (keyframes.length > 1) {
      return this._advanceSequence(ctx, gesture, keyframes, ts)
    }

    return { confidence, complete: false, progress: 0 }
  }

  /** Похожесть кадра на один записанный кадр эталона (одна или две руки). */
  _compareKeyframe(ctx, keyframe) {
    const current = ctx.canonical
    const [t0, t1] = keyframe.hands
    if (!t1) {
      let best = 0
      for (const c of current) best = Math.max(best, compareHands(c, t0))
      return best
    }
    if (current.length < 2) return 0
    // двуручный жест: пробуем оба сопоставления рук, берём лучшее
    const [c0, c1] = current
    const a = Math.min(compareHands(c0, t0), compareHands(c1, t1))
    const b = Math.min(compareHands(c0, t1), compareHands(c1, t0))
    return Math.max(a, b)
  }

  /**
   * Жест с движением: кадры эталона должны совпасть по порядку за sequenceTimeoutMs.
   * Возвращает confidence только в момент, когда совпал последний кадр.
   */
  _advanceSequence(ctx, gesture, keyframes, ts) {
    const { keyframeConfidence, sequenceTimeoutMs } = this.options
    let s = this._sequences.get(gesture.id)
    if (!s) {
      s = { idx: 0, startedAt: 0, sims: [] }
      this._sequences.set(gesture.id, s)
    }
    if (s.idx > 0 && ts - s.startedAt > sequenceTimeoutMs) {
      s.idx = 0
      s.sims = []
    }
    const sim = this._compareKeyframe(ctx, keyframes[s.idx])
    if (sim >= keyframeConfidence) {
      if (s.idx === 0) s.startedAt = ts
      s.sims.push(sim)
      s.idx++
      if (s.idx >= keyframes.length) {
        const confidence = s.sims.reduce((a, v) => a + v, 0) / s.sims.length
        s.idx = 0
        s.sims = []
        return { confidence, complete: true, progress: 1 }
      }
    }
    // пока последовательность не завершена, кандидатом не считаем (confidence 0), но показываем прогресс
    return { confidence: 0, complete: false, progress: s.idx / keyframes.length }
  }

  /** Нормализованные кадры эталона (кэш по объекту жеста). */
  _prepared(gesture) {
    let prepared = preparedCache.get(gesture)
    if (!prepared) {
      prepared = (gesture.landmarksSequence ?? [])
        .filter((k) => k && Array.isArray(k.hand) && k.hand.length >= 21)
        .map((k) => {
          const aspect = k.aspect || 4 / 3
          const hands = [normalizeHand(k.hand, aspect, k.handedness ?? null)]
          if (Array.isArray(k.hand2) && k.hand2.length >= 21) hands.push(normalizeHand(k.hand2, aspect, k.handedness2 ?? null))
          return { hands, t: k.t ?? 0 }
        })
      preparedCache.set(gesture, prepared)
    }
    return prepared
  }

  /**
   * Шаг 4. Кандидат должен продержаться holdMs подряд; после срабатывания
   * тот же жест не сработает раньше cooldownMs. Возвращает результат только
   * в момент срабатывания, иначе null.
   */
  _stabilize(candidate, confidence, timestamp, progress = 0) {
    const s = this._state
    const id = candidate?.id ?? null

    if (id !== s.candidateId) {
      s.candidateId = id
      s.candidateSince = timestamp
      s.fired = false
    }
    const heldMs = candidate ? timestamp - s.candidateSince : 0
    this.candidate = { gesture: candidate, confidence, heldMs, progress }

    if (!candidate || s.fired) return null
    if (heldMs < this.options.holdMs) return null
    if (s.lastFiredId === id && timestamp - s.lastFiredAt < this.options.cooldownMs) return null

    s.fired = true
    return this._fire(candidate, confidence, timestamp)
  }

  /** Шаг 5. Фиксирует срабатывание и оповещает подписчиков. */
  _fire(gesture, confidence, timestamp) {
    const s = this._state
    if (s.lastFiredId === gesture.id && timestamp - s.lastFiredAt < this.options.cooldownMs) return null
    s.lastFiredId = gesture.id
    s.lastFiredAt = timestamp
    const result = { gesture, confidence, timestamp }
    this.lastMatch = result
    this._emit(result)
    return result
  }

  _emit(result) {
    for (const cb of this.listeners) {
      try {
        cb(result)
      } catch (err) {
        console.error('[GestureEngine] ошибка в подписчике onMatch', err)
      }
    }
  }

  _resetSequences() {
    for (const s of this._sequences.values()) {
      s.idx = 0
      s.sims = []
    }
  }

  _reset() {
    this._state = { candidateId: null, candidateSince: 0, fired: false, lastFiredId: null, lastFiredAt: -Infinity }
    this._sequences = new Map()
    this.candidate = { gesture: null, confidence: 0, heldMs: 0, progress: 0 }
  }
}
