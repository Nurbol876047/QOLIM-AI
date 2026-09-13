import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Озвучка через Microsoft Edge TTS (edge-tts-universal) — общая для
 * scripts/generate-audio.js (пакетная генерация) и API записи жестов
 * (мгновенная озвучка нового жеста). Файлы кладутся в public/audio/{id}.mp3.
 *
 * Голос: kk-KZ-AigulNeural; если его нет в списке сервиса — первый доступный kk-* голос.
 */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const AUDIO_DIR = resolve(ROOT, 'public/audio')
export const PREFERRED_VOICE = 'kk-KZ-AigulNeural'

let voicePromise = null

export function pickVoice() {
  if (!voicePromise) {
    voicePromise = (async () => {
      try {
        const { listVoices } = await import('edge-tts-universal')
        const voices = await listVoices()
        if (voices.some((v) => v.ShortName === PREFERRED_VOICE)) return PREFERRED_VOICE
        const kk = voices.find((v) => v.ShortName.startsWith('kk-') || v.Locale?.startsWith('kk'))
        if (kk) {
          console.warn(`⚠ ${PREFERRED_VOICE} недоступен, используем ${kk.ShortName}`)
          return kk.ShortName
        }
        console.warn('⚠ казахских голосов в списке нет, пробуем всё равно ' + PREFERRED_VOICE)
      } catch (err) {
        console.warn('⚠ не удалось получить список голосов:', err.message)
      }
      return PREFERRED_VOICE
    })()
  }
  return voicePromise
}

export const fileExists = (p) => stat(p).then(() => true, () => false)

/** Путь mp3 для жеста. */
export const audioPath = (id) => resolve(AUDIO_DIR, `${id}.mp3`)

/**
 * Синтезирует текст в файл. Сервис иногда обрывает соединение — до 3 попыток.
 * @returns {Promise<number>} размер файла в байтах
 */
export async function synthesizeToFile(text, file, { voice, attempts = 3 } = {}) {
  const { EdgeTTS } = await import('edge-tts-universal')
  await mkdir(dirname(file), { recursive: true })
  const useVoice = voice ?? (await pickVoice())
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const tts = new EdgeTTS(text, useVoice, { rate: '-5%' })
      const result = await tts.synthesize()
      const buf = Buffer.from(await result.audio.arrayBuffer())
      if (!buf.length) throw new Error('пустой ответ TTS')
      await writeFile(file, buf)
      return buf.length
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
  throw lastErr
}
