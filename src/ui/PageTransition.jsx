import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { pageEnter } from './Transitions.js'

/**
 * Обёртка страницы: при смене маршрута проигрывает pageEnter из Transitions.js.
 * Внутри страницы блоки, которые должны появляться по очереди, помечаются data-animate.
 */
export default function PageTransition({ children, className = '' }) {
  const ref = useRef(null)
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    const ctx = gsap.context(() => pageEnter(ref.current), ref)
    return () => ctx.revert()
  }, [pathname])

  return (
    <div ref={ref} className={`page ${className}`} key={pathname}>
      {children}
    </div>
  )
}
