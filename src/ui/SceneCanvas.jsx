import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * SceneCanvas — three.js: фоновые декоративные 3D-акценты на весь экран.
 * Несколько мягких полупрозрачных фигур в цветах палитры медленно плывут и
 * вращаются за интерфейсом. Чисто декоративно: aria-hidden, без событий мыши.
 *
 *   - prefers-reduced-motion → один статичный кадр, без цикла анимации;
 *   - вкладка скрыта → цикл останавливается;
 *   - режим высокого контраста скрывает канвас целиком (см. global.css);
 *   - нет WebGL → компонент просто ничего не рисует.
 */

// ---------- ВНЕШНИЙ ВИД — подстраивать здесь ----------
const COLORS = { primary: 0x1f8a7a, warm: 0xd9a441, alert: 0xd1603d }
/** Фигуры: геометрия, цвет, позиция, размер, прозрачность, скорость вращения. */
const SHAPES = [
  { geo: () => new THREE.IcosahedronGeometry(1.6, 1), color: COLORS.primary, pos: [-5.5, 2.2, -4], opacity: 0.18, spin: 0.12 },
  { geo: () => new THREE.TorusGeometry(1.3, 0.42, 20, 64), color: COLORS.warm, pos: [5.8, -2.4, -5], opacity: 0.2, spin: 0.16 },
  { geo: () => new THREE.SphereGeometry(1.1, 32, 32), color: COLORS.primary, pos: [4.6, 3.1, -7], opacity: 0.14, spin: 0.08 },
  { geo: () => new THREE.OctahedronGeometry(0.9, 0), color: COLORS.warm, pos: [-4.8, -3.2, -6], opacity: 0.16, spin: 0.2 },
  { geo: () => new THREE.TorusKnotGeometry(0.7, 0.22, 100, 16), color: COLORS.alert, pos: [0.8, 4.2, -9], opacity: 0.12, spin: 0.1 },
]
/** Амплитуда «дыхания» (в единицах сцены) и его скорость. */
const FLOAT_AMPLITUDE = 0.35
const FLOAT_SPEED = 0.4

export default function SceneCanvas({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch (err) {
      console.warn('[SceneCanvas] WebGL недоступен — фон без 3D', err)
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.z = 8

    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(4, 6, 8)
    scene.add(key)

    const meshes = SHAPES.map((s) => {
      const material = new THREE.MeshStandardMaterial({
        color: s.color,
        transparent: true,
        opacity: s.opacity,
        roughness: 0.55,
        metalness: 0.05,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(s.geo(), material)
      mesh.position.set(...s.pos)
      mesh.userData = { spin: s.spin, baseY: s.pos[1], phase: Math.random() * Math.PI * 2 }
      scene.add(mesh)
      return mesh
    })

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const startedAt = performance.now()
    let rafId = 0
    let running = false

    const render = () => {
      const t = (performance.now() - startedAt) / 1000
      for (const m of meshes) {
        const { spin, baseY, phase } = m.userData
        m.rotation.x += spin * 0.004
        m.rotation.y += spin * 0.006
        m.position.y = baseY + Math.sin(t * FLOAT_SPEED + phase) * FLOAT_AMPLITUDE
      }
      renderer.render(scene, camera)
    }
    const loop = () => {
      rafId = requestAnimationFrame(loop)
      render()
    }
    const start = () => {
      if (running || reducedMotion) return
      running = true
      rafId = requestAnimationFrame(loop)
    }
    const pause = () => {
      running = false
      cancelAnimationFrame(rafId)
    }
    const onVisibility = () => (document.hidden ? pause() : start())
    document.addEventListener('visibilitychange', onVisibility)

    render() // первый кадр — сразу, даже при reduced-motion
    start()

    return () => {
      pause()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const m of meshes) {
        m.geometry.dispose()
        m.material.dispose()
      }
      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className={`scene-canvas ${className}`} aria-hidden="true" />
}
