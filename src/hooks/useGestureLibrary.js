import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteCustomGesture, loadCustomGestures, mergeLibrary, saveCustomGesture } from '../core/libraryStore.js'

// один кэш на всё приложение — страницы не перечитывают библиотеку при каждом переходе
let cache = null
let inflight = null
const subscribers = new Set()

function notify() {
  for (const cb of subscribers) cb(cache)
}

async function ensureLoaded() {
  if (cache) return cache
  if (!inflight) {
    inflight = loadCustomGestures().then((res) => {
      cache = res
      notify()
      return res
    })
  }
  return inflight
}

/**
 * Библиотека жестов для компонентов: встроенные + записанные, добавление и удаление.
 *   const { library, custom, status, add, remove } = useGestureLibrary()
 * status: 'loading' | 'server' | 'local'
 */
export function useGestureLibrary() {
  const [state, setState] = useState(cache)

  useEffect(() => {
    subscribers.add(setState)
    ensureLoaded()
    return () => subscribers.delete(setState)
  }, [])

  const custom = state?.gestures ?? []
  const library = useMemo(() => mergeLibrary(custom), [custom])

  const add = useCallback(async (gesture) => {
    const res = await saveCustomGesture(gesture)
    cache = { gestures: [...(cache?.gestures ?? []), res.gesture], source: res.source }
    notify()
    return res
  }, [])

  const remove = useCallback(async (id) => {
    await deleteCustomGesture(id)
    cache = { gestures: (cache?.gestures ?? []).filter((g) => g.id !== id), source: cache?.source ?? 'local' }
    notify()
  }, [])

  return { library, custom, status: state ? state.source : 'loading', add, remove }
}
