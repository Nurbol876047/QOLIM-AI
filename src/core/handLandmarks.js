/**
 * Разметка 21 ключевой точки кисти MediaPipe HandLandmarker
 * (https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker):
 *   0 — запястье;
 *   1–4  — большой палец   (4 — кончик);
 *   5–8  — указательный    (8 — кончик);
 *   9–12 — средний         (12 — кончик);
 *  13–16 — безымянный      (16 — кончик);
 *  17–20 — мизинец         (20 — кончик).
 *
 * Общий словарь для SkeletonOverlay (рисование) и GestureEngine (сравнение),
 * чтобы индексы не расходились между модулями.
 */

export const WRIST = 0
export const THUMB_CMC = 1
export const THUMB_MCP = 2
export const THUMB_IP = 3
export const THUMB_TIP = 4
export const INDEX_MCP = 5
export const INDEX_PIP = 6
export const INDEX_DIP = 7
export const INDEX_TIP = 8
export const MIDDLE_MCP = 9
export const MIDDLE_PIP = 10
export const MIDDLE_DIP = 11
export const MIDDLE_TIP = 12
export const RING_MCP = 13
export const RING_PIP = 14
export const RING_DIP = 15
export const RING_TIP = 16
export const PINKY_MCP = 17
export const PINKY_PIP = 18
export const PINKY_DIP = 19
export const PINKY_TIP = 20

export const LANDMARK_COUNT = 21

/** Кончики пальцев — их удобно выделять на оверлее и использовать как «курсоры». */
export const FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]

/** Пары точек, между которыми рисуются «кости» (аналог HAND_CONNECTIONS из MediaPipe). */
export const HAND_CONNECTIONS = [
  [WRIST, THUMB_CMC], [THUMB_CMC, THUMB_MCP], [THUMB_MCP, THUMB_IP], [THUMB_IP, THUMB_TIP],
  [WRIST, INDEX_MCP], [INDEX_MCP, INDEX_PIP], [INDEX_PIP, INDEX_DIP], [INDEX_DIP, INDEX_TIP],
  [INDEX_MCP, MIDDLE_MCP], [MIDDLE_MCP, MIDDLE_PIP], [MIDDLE_PIP, MIDDLE_DIP], [MIDDLE_DIP, MIDDLE_TIP],
  [MIDDLE_MCP, RING_MCP], [RING_MCP, RING_PIP], [RING_PIP, RING_DIP], [RING_DIP, RING_TIP],
  [RING_MCP, PINKY_MCP], [WRIST, PINKY_MCP], [PINKY_MCP, PINKY_PIP], [PINKY_PIP, PINKY_DIP], [PINKY_DIP, PINKY_TIP],
]
