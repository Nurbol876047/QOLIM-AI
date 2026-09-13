import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { FINGERTIPS, HAND_CONNECTIONS } from '../core/handLandmarks.js'

/**
 * SkeletonOverlay — PixiJS-канвас поверх видео: точки кисти и «кости» между ними.
 * Позже сюда же лягут курсоры, прогресс-кольца и подсветка жеста (модуль 3).
 *
 * Рисование императивное (без ререндера React на каждый кадр):
 *   const overlay = useRef(null)
 *   <SkeletonOverlay ref={overlay} mirrored />
 *   overlay.current.draw(frame.landmarks)   // [рука][21 точка], координаты 0..1
 *   overlay.current.clear()
 *
 * Канвас растягивается на родителя (resizeTo), поэтому родитель должен иметь
 * то же соотношение сторон, что и видео — тогда нормализованные координаты
 * MediaPipe ложатся на картинку без пересчёта (см. CameraView).
 */

// ---------- ВНЕШНИЙ ВИД — подстраивать здесь ----------
const BONE_WIDTH = 4
const JOINT_RADIUS = 5
const TIP_RADIUS = 7
const WRIST_RADIUS = 8

/** Цвета берём из CSS-токенов, чтобы оверлей менялся вместе с режимом высокого контраста. */
function readPalette(el) {
  const css = getComputedStyle(el)
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback
  return {
    bone: get('--overlay-bone', '#1f8a7a'),
    joint: get('--overlay-joint', '#d9a441'),
    tip: get('--overlay-tip', '#ffffff'),
    trail: get('--overlay-trail', '#35e6ff'),
  }
}

const SkeletonOverlay = forwardRef(function SkeletonOverlay({ mirrored = true, className = '' }, ref) {
  const hostRef = useRef(null)
  const appRef = useRef(null)
  const graphicsRef = useRef(null)
  const paletteRef = useRef(null)
  const trailHistoryRef = useRef([])
  const TRAIL_LENGTH = 15
  const mirroredRef = useRef(mirrored)
  mirroredRef.current = mirrored

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    // Канвас создаёт сам PixiJS и на каждый mount — свой: два Application на одном
    // <canvas> (StrictMode дважды монтирует эффект) вешают WebGL-контекст намертво.
    let cancelled = false
    const app = new Application()
    const graphics = new Graphics()

    app
      .init({
        backgroundAlpha: 0, // прозрачный фон — видео просвечивает
        resizeTo: host,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      .then(() => {
        // быстрый unmount: инициализация догнала уже размонтированный компонент
        if (cancelled) {
          app.destroy(true, { children: true })
          return
        }
        app.canvas.className = 'skeleton-overlay__canvas'
        host.appendChild(app.canvas)
        app.stage.addChild(graphics)
        appRef.current = app
        graphicsRef.current = graphics
        paletteRef.current = readPalette(host)
      })
      .catch((err) => console.warn('[SkeletonOverlay] PixiJS не запустился', err))

    // смена высокого контраста — перечитать цвета
    const observer = new MutationObserver(() => {
      paletteRef.current = readPalette(host)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      cancelled = true
      observer.disconnect()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
        graphicsRef.current = null
      }
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      /** @param {Array<Array<{x:number,y:number}>>} hands */
      draw(hands) {
        const app = appRef.current
        const g = graphicsRef.current
        if (!app || !g) return
        const palette = paletteRef.current ?? readPalette(hostRef.current)
        const w = app.screen.width
        const h = app.screen.height
        const mirror = mirroredRef.current
        const px = (p) => (mirror ? 1 - p.x : p.x) * w
        const py = (p) => p.y * h

        g.clear()
        
        // Trail fading (when hand is lost)
        const trailHistory = trailHistoryRef.current
        if (!hands || hands.length === 0) {
           if (trailHistory.length > 0) {
             trailHistory.shift()
             // Redraw fading trail
             for (let i = 1; i < trailHistory.length; i++) {
               const alpha = i / trailHistory.length
               const pt1 = trailHistory[i-1]
               const pt2 = trailHistory[i]
               g.moveTo(pt1.x, pt1.y).lineTo(pt2.x, pt2.y)
               g.stroke({ width: 2 + (alpha * 6), color: palette.trail, alpha: alpha * 0.7, cap: 'round', join: 'round' })
             }
           }
        }

        for (const hand of hands ?? []) {
          if (!hand || hand.length < 21) continue
          
          // Index fingertip trail (hand[8])
          const tipP = hand[8]
          if (tipP) {
            trailHistory.push({ x: px(tipP), y: py(tipP) })
            if (trailHistory.length > TRAIL_LENGTH) {
              trailHistory.shift()
            }
          }
          
          // Draw trail
          if (trailHistory.length > 1) {
            for (let i = 1; i < trailHistory.length; i++) {
              const alpha = i / trailHistory.length
              const pt1 = trailHistory[i-1]
              const pt2 = trailHistory[i]
              g.moveTo(pt1.x, pt1.y).lineTo(pt2.x, pt2.y)
              g.stroke({ width: 2 + (alpha * 6), color: palette.trail, alpha: alpha * 0.7, cap: 'round', join: 'round' })
            }
          }

          // кости
          for (const [a, b] of HAND_CONNECTIONS) {
            g.moveTo(px(hand[a]), py(hand[a])).lineTo(px(hand[b]), py(hand[b]))
          }
          g.stroke({ width: BONE_WIDTH, color: palette.bone, alpha: 0.85, cap: 'round', join: 'round' })
          // суставы
          hand.forEach((p, i) => {
            if (i === 0 || FINGERTIPS.includes(i)) return
            g.circle(px(p), py(p), JOINT_RADIUS)
          })
          g.fill({ color: palette.joint })
          // запястье и кончики пальцев — крупнее, с белой обводкой, чтобы читались на любом фоне
          g.circle(px(hand[0]), py(hand[0]), WRIST_RADIUS)
          for (const i of FINGERTIPS) g.circle(px(hand[i]), py(hand[i]), TIP_RADIUS)
          g.fill({ color: palette.joint }).stroke({ width: 2, color: palette.tip, alpha: 0.9 })
        }
      },
      clear() {
        graphicsRef.current?.clear()
        trailHistoryRef.current = []
      },
    }),
    [],
  )

  return <div ref={hostRef} className={`skeleton-overlay ${className}`} aria-hidden="true" />
})

export default SkeletonOverlay
