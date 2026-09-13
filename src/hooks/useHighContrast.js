import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'qolim:high-contrast'
const CLASS_NAME = 'high-contrast'

function readStored() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return true
    if (localStorage.getItem(STORAGE_KEY) === '0') return false
  } catch {
    // приватный режим и т.п. — просто без сохранения
  }
  // пользователь уже попросил больше контраста на уровне системы
  return window.matchMedia?.('(prefers-contrast: more)').matches ?? false
}

/**
 * Режим высокого контраста: класс `.high-contrast` на <html>, состояние
 * запоминается в localStorage. Токены цветов для этого режима — в styles/tokens.css.
 */
export function useHighContrast() {
  const [enabled, setEnabled] = useState(readStored)

  useEffect(() => {
    document.documentElement.classList.toggle(CLASS_NAME, enabled)
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // без сохранения
    }
  }, [enabled])

  const toggle = useCallback(() => setEnabled((v) => !v), [])
  return [enabled, toggle]
}
