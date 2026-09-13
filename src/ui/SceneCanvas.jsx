import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * SceneCanvas — three.js: голографические 3D-акценты на весь экран.
 * Полупрозрачные стеклянные фигуры с тонкоплёночной интерференцией
 * (MeshPhysicalMaterial.iridescence + окружение RoomEnvironment): при вращении
 * по граням бежит радужный перелив, как на голограмме. Под ними — CSS-слой
 * .holo-bg (global.css) с переливающимися пятнами и «фольгой».
 * Чисто декоративно: aria-hidden, без событий мыши.
 *
 *   - prefers-reduced-motion → один статичный кадр, без цикла анимации;
 *   - вкладка скрыта → цикл останавливается;
 *   - режим высокого контраста скрывает канвас целиком (см. global.css);
 *   - нет WebGL → компонент просто ничего не рисует.
 */

// ---------- ВНЕШНИЙ ВИД — подстраивать здесь ----------
/** Фигуры: геометрия, базовый оттенок, позиция, прозрачность, скорость вращения. */
const SHAPES = [
  { geo: () => new THREE.IcosahedronGeometry(1.7, 1), color: 0x8fe8d2, pos: [-5.6, 2.3, -4], opacity: 0.42, spin: 0.14 },
  { geo: () => new THREE.TorusGeometry(1.35, 0.46, 24, 64), color: 0xffd08a, pos: [5.9, -2.5, -5], opacity: 0.45, spin: 0.18 },
  { geo: () => new THREE.SphereGeometry(1.15, 32, 32), color: 0x9fd0ff, pos: [4.7, 3.2, -7], opacity: 0.4, spin: 0.1 },
  { geo: () => new THREE.OctahedronGeometry(1.0, 0), color: 0xc9a8ff, pos: [-4.9, -3.3, -6], opacity: 0.45, spin: 0.22 },
  { geo: () => new THREE.TorusKnotGeometry(0.75, 0.24, 100, 16), color: 0xffa8d0, pos: [0.9, 4.3, -9], opacity: 0.42, spin: 0.12 },
  { geo: () => new THREE.CapsuleGeometry(0.5, 1.4, 6, 16), color: 0xa8f0e6, pos: [-1.8, -4.4, -8], opacity: 0.38, spin: 0.16 },
]
/** Материал «голографического стекла»: тонкая плёнка (100–400 нм) даёт самый заметный радужный перелив. */
const MATERIAL = {
  metalness: 0.35,
  roughness: 0.18,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  iridescence: 1,
  iridescenceIOR: 1.6,
  iridescenceThicknessRange: [100, 420],
  envMapIntensity: 1.1,
}
/** Кадров в секунду для декоративной сцены — движение медленное, 30 хватает и экономит батарею. */
const TARGET_FPS = 30
/** Амплитуда «дыхания» (в единицах сцены) и его скорость. */
const FLOAT_AMPLITUDE = 0.35
const FLOAT_SPEED = 0.4
/** Скорость медленного перелива цвета освещения (радиан/с по оттенку). */
const HUE_SPEED = 0.03

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0

    const scene = new THREE.Scene()
    // окружение даёт отражения — без него интерференция на стекле не видна
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new RoomEnvironment()
    scene.environment = pmrem.fromScene(envScene, 0.04).texture
    envScene.dispose?.()
    pmrem.dispose()

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.z = 8

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(4, 6, 8)
    scene.add(key)
    const rim = new THREE.PointLight(0x9ff5e6, 1.6, 40)
    rim.position.set(-6, -4, 2)
    scene.add(rim)
    const rim2 = new THREE.PointLight(0xffb8e6, 1.2, 40)
    rim2.position.set(6, 4, 1)
    scene.add(rim2)

    const meshes = SHAPES.map((s) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0x35e6ff,
        wireframe: true,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
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
      // цветные источники медленно меняют оттенок — перелив «дышит»
      rim.color.setHSL((0.45 + t * HUE_SPEED) % 1, 0.8, 0.75)
      rim2.color.setHSL((0.9 + t * HUE_SPEED) % 1, 0.8, 0.8)
      renderer.render(scene, camera)
    }
    let lastFrame = 0
    const loop = (now) => {
      rafId = requestAnimationFrame(loop)
      if (now - lastFrame < 1000 / TARGET_FPS) return
      lastFrame = now
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
    // ещё один кадр на следующем тике: при reduced-motion цикла нет, а первый кадр может
    // затереть повторный монтаж (StrictMode) или смена размера канваса
    const settleId = requestAnimationFrame(render)
    start()

    return () => {
      pause()
      cancelAnimationFrame(settleId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const m of meshes) {
        m.geometry.dispose()
        m.material.dispose()
      }
      scene.environment?.dispose()
      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className={`scene-canvas ${className}`} aria-hidden="true" />
}
