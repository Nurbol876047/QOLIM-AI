/**
 * Генерация озвучки жестов через Microsoft Edge TTS
 * (пакет edge-tts-universal, только для разработки — в браузер не попадает).
 *
 * На каждый жест (встроенные из src/core/gestureLibrary.js + записанные из server/data/gestures.json)
 * создаётся public/audio/{id}.mp3
 * с текстом label_kk — его проигрывает модуль 1 при распознавании
 * (см. gestureAudioUrl в gestureLibrary.js).
 *
 * Запуск:  npm run audio            — только отсутствующие файлы
 *          npm run audio -- --force — перегенерировать всё (после правки текстов)
 *
 * Голос: kk-KZ-AigulNeural; если его нет в списке сервиса — первый доступный kk-* голос.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AUDIO_DIR, ROOT, audioPath, fileExists, pickVoice, synthesizeToFile } from '../server/tts.js'
import { gestureLibrary } from '../src/core/gestureLibrary.js'

const FORCE = process.argv.includes('--force')

/** Встроенные жесты + записанные через камеру (server/data/gestures.json). */
async function loadGestures() {
  let custom = []
  try {
    custom = JSON.parse(await readFile(resolve(ROOT, 'server/data/gestures.json'), 'utf8'))
  } catch {
    // файла ещё нет — только встроенные
  }
  return [...gestureLibrary, ...custom]
}

async function main() {
  const gestures = await loadGestures()
  if (gestures.length === 0) {
    console.log('Библиотека жестов пуста — озвучивать нечего.')
    return
  }
  const voice = await pickVoice()
  console.log(`Голос: ${voice}\nПапка: ${AUDIO_DIR}\n`)

  let made = 0
  let skipped = 0
  for (const g of gestures) {
    const file = audioPath(g.id)
    if (!FORCE && (await fileExists(file))) {
      skipped++
      continue
    }
    process.stdout.write(`${g.id}.mp3  «${g.label_kk}»  `)
    try {
      const bytes = await synthesizeToFile(g.label_kk, file, { voice })
      console.log(`✓ ${(bytes / 1024).toFixed(1)} kB`)
      made++
    } catch (err) {
      console.log(`✗ ${err.message}`)
      process.exitCode = 1
    }
  }
  console.log(`\nГотово: создано ${made}, пропущено ${skipped} (уже были).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
