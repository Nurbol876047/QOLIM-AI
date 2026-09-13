import { useCallback, useEffect, useRef, useState } from 'react'
import { gestureAudioUrl } from '../core/gestureLibrary.js'

/**
 * Озвучка распознанных жестов.
 *
 * Один общий <audio> на приложение: speak(gesture) останавливает предыдущее и играет
 * public/audio/{id}.mp3 (Edge TTS, казахский голос). Если файла нет (жест записан без
 * интернета) или он не загрузился — fallback на Web Speech API (speechSynthesis)
 * с казахским голосом, если такой есть в системе; иначе — любой доступный голос.
 *
 * Браузеры блокируют autoplay до первого жеста пользователя — у нас звук всегда идёт
 * после нажатия «Камераны қосу», так что этого достаточно.
 */
const STORAGE_KEY = 'qolim:voice'

let audio = null
let token = 0 // номер текущего запроса — «догнавшие» события старых запросов игнорируются

function getAudio() {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
  }
  return audio
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith('kk')) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('ru')) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('tr')) ??
    null
  )
}

/** Fallback: системный синтез речи. Резолвится по окончании (false — не смог начать). */
export function speakWithSynthesis(text) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth || !text) return resolve(false)
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'kk-KZ'
    u.rate = 0.95
    u.onend = () => resolve(true)
    u.onerror = () => resolve(false)
    synth.speak(u)
  })
}

/** Остановить любую озвучку. */
export function stopSpeech() {
  token++
  const a = getAudio()
  a.pause()
  a.removeAttribute('src')
  window.speechSynthesis?.cancel()
}

/** Проиграть mp3; резолвится true, когда доиграл, false — если не удалось запустить. */
function playUrl(url) {
  return new Promise((resolve) => {
    const my = ++token
    const a = getAudio()
    a.pause()
    a.src = url
    const done = (ok) => {
      if (my !== token) return
      a.onended = a.onerror = null
      resolve(ok)
    }
    a.onended = () => done(true)
    a.onerror = () => done(false)
    a.play().catch(() => done(false))
  })
}

/**
 * Озвучить жест: mp3 → синтез. Резолвится, когда звук доиграл.
 * @param {import('../core/gestureLibrary.js').ReferenceGesture} gesture
 */
export async function speakGesture(gesture) {
  if (!gesture) return false
  const ok = await playUrl(gestureAudioUrl(gesture))
  if (ok) return true
  return speakWithSynthesis(gesture.label_kk)
}

/** Озвучить произвольный текст (например, набранный в текстовом поле) — только синтезом. */
export async function speakText(text) {
  stopSpeech()
  return speakWithSynthesis(text)
}

/** React-обёртка: переключатель «дауыс» с памятью и текущее состояние проигрывания. */
export function useSpeech() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [speaking, setSpeaking] = useState(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // без сохранения
    }
    if (!enabled) stopSpeech()
  }, [enabled])

  // Chrome отдаёт список голосов асинхронно — прогреваем, чтобы pickVoice не вернул пусто
  useEffect(() => {
    window.speechSynthesis?.getVoices()
  }, [])

  const speak = useCallback(async (gesture, { force = false } = {}) => {
    if (!force && !enabledRef.current) return false
    setSpeaking(true)
    try {
      return await speakGesture(gesture)
    } finally {
      setSpeaking(false)
    }
  }, [])

  const say = useCallback(async (text, { force = false } = {}) => {
    if (!force && !enabledRef.current) return false
    setSpeaking(true)
    try {
      return await speakText(text)
    } finally {
      setSpeaking(false)
    }
  }, [])

  const toggle = useCallback(() => setEnabled((v) => !v), [])

  return { enabled, toggle, speaking, speak, say, stop: stopSpeech }
}
