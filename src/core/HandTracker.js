import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
// Wasm-файлы MediaPipe берём из node_modules через Vite (?url) — ничего не тянем с CDN,
// в production они попадут в dist/assets вместе с остальной сборкой.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmLoaderPathNoSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url'
import wasmBinaryPathNoSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url'

/**
 * HandTracker — обвязка над MediaPipe HandLandmarker (+ опционально FaceLandmarker):
 * запуск камеры, покадровое извлечение landmarks, статусы и очистка.
 *
 * Не зависит от React — это чистый сервис, которым пользуются все модули
 * (в React его оборачивает hooks/useHandTracker.js). Вся обработка идёт
 * локально в браузере: видео никуда не отправляется.
 *
 *   const tracker = new HandTracker({ numHands: 2 })
 *   tracker.onStatus((status, message) => …)   // 'idle' | 'loading' | 'running' | 'error'
 *   tracker.onResults((frame) => …)            // см. TrackerFrame
 *   await tracker.start(videoElement)
 *   tracker.stop()
 *
 * @typedef {Object} TrackerFrame
 * @property {import('./gestureLibrary.js').Landmark[][]} landmarks  руки в кадре: [рука][21 точка], координаты 0..1
 * @property {Array} worldLandmarks   те же точки в метрах относительно центра кисти
 * @property {Array} handedness       [{ categoryName: 'Left' | 'Right', score }] на каждую руку
 * @property {Array | null} faceLandmarks     478 точек лица (только при options.face)
 * @property {Array | null} faceBlendshapes   мимика (только при options.face)
 * @property {number} timestamp       метка времени кадра, мс
 * @property {number} videoWidth
 * @property {number} videoHeight
 * @property {number} fps             оценка частоты детекции
 */

// ---------- НАСТРОЙКИ — подстраивать здесь ----------

/** Модели: сначала локальная копия из public/, если её нет — официальный хостинг Google. */
export const HAND_MODEL_URLS = [
  '/models/hand_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
]
export const FACE_MODEL_URLS = [
  '/models/face_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
]

/** Запрашиваемое разрешение камеры — 640×480 достаточно, выше только медленнее. */
export const CAMERA_CONSTRAINTS = {
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  audio: false,
}

const DEFAULT_OPTIONS = {
  numHands: 2,
  /** Включать ли FaceLandmarker (мимика — часть грамматики ҚЖТ; пока опционально). */
  face: false,
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.5,
  cameraConstraints: CAMERA_CONSTRAINTS,
}

/** Понятное сообщение об ошибке доступа к камере (казахский — язык интерфейса). */
export function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Камераға рұқсат берілмеді. Браузердің мекенжай жолағындағы камера белгішесін басып, рұқсат беріңіз.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Камера табылмады. Құрылғыда веб-камера бар ма, тексеріңіз.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Камера басқа қолданбада бос емес немесе қолжетімсіз.'
    case 'NotSupportedError':
      return 'Бұл браузер камераны қолдамайды (HTTPS немесе localhost қажет).'
    default:
      return 'Камераны қосу мүмкін болмады.'
  }
}

export const MODEL_ERROR_MESSAGE = 'Қол моделін жүктеу мүмкін болмады. Интернет байланысын тексеріп, қайталап көріңіз.'

async function resolveFileset() {
  const simd = await FilesetResolver.isSimdSupported().catch(() => true)
  return simd
    ? { wasmLoaderPath, wasmBinaryPath }
    : { wasmLoaderPath: wasmLoaderPathNoSimd, wasmBinaryPath: wasmBinaryPathNoSimd }
}

/** Перебирает адреса модели и делегаты (GPU → CPU), пока что-то не создастся. */
async function createWithFallback(label, urls, factory) {
  let lastError
  for (const modelAssetPath of urls) {
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await factory(modelAssetPath, delegate)
      } catch (err) {
        lastError = err
        console.warn(`[HandTracker] не удалось создать ${label} (${delegate}, ${modelAssetPath})`, err)
      }
    }
  }
  throw lastError ?? new Error(`${label}: модель не загружена`)
}

export class HandTracker {
  /** @param {Partial<typeof DEFAULT_OPTIONS>} [options] */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.video = null
    this.stream = null
    this.handLandmarker = null
    this.faceLandmarker = null
    this.status = 'idle'
    this.isRunning = false

    this._resultListeners = new Set()
    this._statusListeners = new Set()
    this._rafId = 0
    this._session = 0 // номер запуска — «догнавшие» промисы старого запуска ничего не трогают
    this._lastVideoTime = -1
    this._lastTs = 0
    this._fps = 0
    this._lastDetectAt = 0
    this._loop = this._loop.bind(this)
  }

  // ---------- подписки ----------

  /** @param {(frame: TrackerFrame) => void} callback  Возвращает функцию отписки. */
  onResults(callback) {
    this._resultListeners.add(callback)
    return () => this._resultListeners.delete(callback)
  }

  /** @param {(status: 'idle'|'loading'|'running'|'error', message?: string) => void} callback */
  onStatus(callback) {
    this._statusListeners.add(callback)
    return () => this._statusListeners.delete(callback)
  }

  // ---------- запуск / остановка ----------

  /**
   * Запрашивает камеру, загружает модель и запускает цикл детекции.
   * @param {HTMLVideoElement} videoElement  элемент, в который выводится поток
   */
  async start(videoElement) {
    this.stop()
    const token = ++this._session
    const alive = () => this._session === token
    this.video = videoElement
    this._setStatus('loading')

    // камеру и модель запрашиваем параллельно — так быстрее
    const modelsPromise = this._createLandmarkers()
    modelsPromise.catch(() => {}) // если камера откажет раньше — не считать это необработанной ошибкой

    let stream
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('getUserMedia unsupported'), { name: 'NotSupportedError' })
      }
      stream = await navigator.mediaDevices.getUserMedia(this.options.cameraConstraints)
    } catch (err) {
      console.warn('[HandTracker] getUserMedia', err)
      modelsPromise.then((m) => m.hand.close()).catch(() => {})
      if (alive()) this._setStatus('error', describeCameraError(err))
      return
    }
    if (!alive()) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.stream = stream

    videoElement.srcObject = stream
    try {
      await videoElement.play()
    } catch {
      // autoplay с muted обычно разрешён; если нет — loadeddata всё равно придёт
    }
    if (videoElement.readyState < 2) {
      await new Promise((resolve) => videoElement.addEventListener('loadeddata', resolve, { once: true }))
    }
    if (!alive()) return

    let models
    try {
      models = await modelsPromise
    } catch (err) {
      console.warn('[HandTracker] модель', err)
      if (alive()) {
        this.stop()
        this._setStatus('error', MODEL_ERROR_MESSAGE)
      }
      return
    }
    if (!alive()) {
      models.hand.close()
      models.face?.close()
      return
    }
    this.handLandmarker = models.hand
    this.faceLandmarker = models.face ?? null
    this.isRunning = true
    this._setStatus('running')
    this._rafId = requestAnimationFrame(this._loop)
  }

  /** Останавливает камеру и освобождает модель. Безопасно вызывать повторно. */
  stop() {
    this._session++
    cancelAnimationFrame(this._rafId)
    this._rafId = 0
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) this.video.srcObject = null
    this.handLandmarker?.close()
    this.handLandmarker = null
    this.faceLandmarker?.close()
    this.faceLandmarker = null
    this._lastVideoTime = -1
    this._fps = 0
    this._lastDetectAt = 0
    const wasRunning = this.isRunning
    this.isRunning = false
    if (wasRunning || this.status === 'loading') this._setStatus('idle')
  }

  /** stop() + отписка всех слушателей — при размонтировании компонента. */
  dispose() {
    this.stop()
    this._resultListeners.clear()
    this._statusListeners.clear()
  }

  // ---------- внутреннее ----------

  async _createLandmarkers() {
    const fileset = await resolveFileset()
    const { numHands, minHandDetectionConfidence, minHandPresenceConfidence, minTrackingConfidence, face } = this.options
    const hand = await createWithFallback('HandLandmarker', HAND_MODEL_URLS, (modelAssetPath, delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numHands,
        minHandDetectionConfidence,
        minHandPresenceConfidence,
        minTrackingConfidence,
      }),
    )
    let faceLandmarker = null
    if (face) {
      try {
        faceLandmarker = await createWithFallback('FaceLandmarker', FACE_MODEL_URLS, (modelAssetPath, delegate) =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
          }),
        )
      } catch (err) {
        // лицо — опциональная часть: без него руки всё равно работают
        console.warn('[HandTracker] FaceLandmarker недоступен, продолжаем без лица', err)
      }
    }
    return { hand, face: faceLandmarker }
  }

  _loop(now) {
    if (!this.isRunning) return
    this._rafId = requestAnimationFrame(this._loop)
    const video = this.video
    const lm = this.handLandmarker
    if (!video || !lm) return
    // вкладка скрыта — не тратим ресурсы
    if (document.hidden) return
    if (video.readyState < 2 || video.currentTime === this._lastVideoTime) return
    this._lastVideoTime = video.currentTime

    // метки времени для detectForVideo должны строго расти
    const ts = Math.max(now, this._lastTs + 1)
    this._lastTs = ts
    let hands
    let face = null
    try {
      hands = lm.detectForVideo(video, ts)
      if (this.faceLandmarker) face = this.faceLandmarker.detectForVideo(video, ts)
    } catch (err) {
      console.warn('[HandTracker] detectForVideo', err)
      return
    }

    if (this._lastDetectAt) {
      const inst = 1000 / Math.max(1, now - this._lastDetectAt)
      this._fps = this._fps ? this._fps * 0.9 + inst * 0.1 : inst
    }
    this._lastDetectAt = now

    const frame = {
      landmarks: hands.landmarks ?? [],
      worldLandmarks: hands.worldLandmarks ?? [],
      // в старых версиях поле называлось handednesses
      handedness: (hands.handedness ?? hands.handednesses ?? []).map((h) => h[0] ?? null),
      faceLandmarks: face?.faceLandmarks?.[0] ?? null,
      faceBlendshapes: face?.faceBlendshapes?.[0]?.categories ?? null,
      timestamp: ts,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      fps: this._fps,
    }
    for (const cb of this._resultListeners) {
      try {
        cb(frame)
      } catch (err) {
        console.error('[HandTracker] ошибка в подписчике onResults', err)
      }
    }
  }

  _setStatus(status, message = '') {
    this.status = status
    this.statusMessage = message
    for (const cb of this._statusListeners) cb(status, message)
  }
}
