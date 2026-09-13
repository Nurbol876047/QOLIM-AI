import gsap from 'gsap'

/**
 * Transitions — GSAP: переходы между экранами/модулями и микроанимации,
 * общие для всех трёх модулей. Все функции уважают prefers-reduced-motion:
 * в этом режиме элементы просто появляются без движения.
 *
 * Использование в React — через gsap.context внутри useLayoutEffect,
 * см. ui/PageTransition.jsx.
 */

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Настройки по умолчанию — подстраивать здесь. */
export const DURATION = { page: 0.55, stagger: 0.07, pulse: 0.35 }
export const EASE = { out: 'power3.out', inOut: 'power2.inOut' }

/**
 * Появление страницы: контейнер проявляется, а его дети с [data-animate]
 * поднимаются снизу по очереди. Возвращает timeline (для kill()).
 * @param {HTMLElement} root
 */
export function pageEnter(root) {
  if (!root) return null
  const items = root.querySelectorAll('[data-animate]')
  if (prefersReducedMotion()) {
    gsap.set([root, ...items], { clearProps: 'all' })
    return null
  }
  const tl = gsap.timeline({ defaults: { ease: EASE.out } })
  tl.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: DURATION.page * 0.6 })
  if (items.length) {
    tl.fromTo(
      items,
      { y: 22, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: DURATION.page, stagger: DURATION.stagger, clearProps: 'transform,opacity,visibility' },
      '<',
    )
  }
  return tl
}

/**
 * Уход страницы (для будущих переходов с ожиданием). Резолвится по окончании.
 * @param {HTMLElement} root
 */
export function pageLeave(root) {
  if (!root || prefersReducedMotion()) return Promise.resolve()
  return new Promise((resolve) => {
    gsap.to(root, { autoAlpha: 0, y: -12, duration: DURATION.page * 0.5, ease: EASE.inOut, onComplete: resolve })
  })
}

/** Мягкий «пульс» элемента — например, карточки с распознанным жестом. */
export function pulse(el, { scale = 1.04 } = {}) {
  if (!el || prefersReducedMotion()) return null
  return gsap.fromTo(el, { scale: 1 }, { scale, duration: DURATION.pulse, yoyo: true, repeat: 1, ease: EASE.inOut })
}

/** Заметное появление сообщения (экстренный модуль): дрожание + подсветка рамки. */
export function attention(el) {
  if (!el || prefersReducedMotion()) return null
  return gsap.fromTo(el, { x: -4 }, { x: 4, duration: 0.06, repeat: 5, yoyo: true, ease: 'none', clearProps: 'x' })
}

/**
 * Анимация значения прогресс-кольца (0..1) — для dwell-зон и обратной связи модуля 3.
 * onUpdate получает текущее значение, чтобы перерисовать кольцо (например, в PixiJS).
 */
export function animateProgress(from, to, { duration = 0.6, onUpdate } = {}) {
  const state = { value: from }
  return gsap.to(state, {
    value: to,
    duration: prefersReducedMotion() ? 0 : duration,
    ease: 'none',
    onUpdate: () => onUpdate?.(state.value),
  })
}
