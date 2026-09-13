# QOLIM AI — ҚЖТ аудармашысы

Веб-система, переводящая жесты казахского жестового языка (ҚЖТ) в текст и голос через
компьютерное зрение. Готовой ML-модели полного словаря нет: распознавание — сверка текущих
landmarks (MediaPipe HandLandmarker) с библиотекой заранее записанных эталонных жестов.
Видео никуда не отправляется — всё считается в браузере.

## Стек

- **Фронтенд:** React 18 + Vite 8, `three.js` (декоративные 3D-акценты), `GSAP` (переходы/микроанимации),
  `PixiJS 8` (2D-оверлей поверх видео: скелет руки, курсоры, прогресс-кольца)
- **Распознавание:** `@mediapipe/tasks-vision` — HandLandmarker (+ опционально FaceLandmarker), локально в браузере
- **Бэкенд:** Node.js + Express 5 — статика production-сборки и небольшой API (без БД на старте)
- **Озвучка:** `scripts/generate-audio.js` → Edge TTS (`kk-KZ-AigulNeural`) → `public/audio/*.mp3`

## Запуск

```bash
npm install
npm run dev          # Vite, http://localhost:5173 (порт занят → возьмёт следующий)
npm run dev:server   # Express API, http://localhost:3000 (в dev /api проксируется из Vite)
```

Для подсказок Gemini и озвучки новых жестов нужен запущенный Express и файл `.env` (см. ниже).

Production:

```bash
npm run build        # dist/
npm start            # Express отдаёт dist/ + /api на :3000
npm run audio        # озвучка жестов из gestureLibrary (edge-tts-universal)
```

## Структура

```
qolim-ai/
  index.html                 точка входа Vite (React монтируется в #root)
  server/
    index.js                 Express: /api/health, /api/gestures, статика dist/ + SPA-fallback
    routes/gestures.js       API библиотеки: встроенные + записанные (server/data/gestures.json), озвучка при сохранении
    tts.js                   Edge TTS — общий для API и scripts/generate-audio.js
    gemini.js                подсказки Gemini для формы записи (ключ из .env)
    routes/assist.js         GET /api/assist/status, POST /api/assist/gesture
    data/gestures.json       записанные жесты
  public/
    audio/                   mp3 озвучки (генерируются скриптом)
    models/                  hand_landmarker.task — локальная копия модели (fallback на CDN Google)
  src/
    core/                    ── ядро, без React ──
      GestureEngine.js       ЦЕНТРАЛЬНЫЙ движок сравнения жестов — один на все три модуля
      handFeatures.js        нормализация кисти, признаки пальцев, сравнение с эталоном
      HandTracker.js         камера + HandLandmarker/FaceLandmarker, покадровые landmarks
      gestureLibrary.js      встроенные эталонные жесты + формат записи
      libraryStore.js        записанные жесты: API сервера / localStorage
      handLandmarks.js       индексы 21 точки и «кости» между ними
    hooks/
      useHandTracker.js      React-обёртка над HandTracker
      useGestureLibrary.js   встроенные + записанные жесты, добавление/удаление
      useGestureRecorder.js  запись эталона: отсчёт → кадры → landmarksSequence
      useSpeech.js           озвучка: mp3 → speechSynthesis
      useHighContrast.js     режим высокого контраста (класс .high-contrast на <html>)
    ui/
      SceneCanvas.jsx        three.js — фоновые 3D-акценты
      SkeletonOverlay.jsx    PixiJS — точки/кости руки поверх видео
      Transitions.js         GSAP — переходы страниц, pulse, attention, прогресс
      PageTransition.jsx     обёртка маршрута, играет pageEnter при смене URL
    components/
      AppHeader.jsx          логотип, навигация по модулям, переключатель контраста
      CameraView.jsx         общий блок «камера + скелет + статусы» для всех модулей
      PrivacyNotice.jsx      «Бейне серверге жіберілмейді, тек браузерде өңделеді»
      ModuleCard.jsx         карточка модуля на главной
      GestureList.jsx        список жестов (иконка, подпись, категория, живая похожесть)
      GestureRecorder.jsx    форма записи нового жеста (+ стикеры, подсказки Gemini)
      StickerPicker.jsx      готовые стикеры по группам
    data/stickers.js         наборы стикеров
    core/assistApi.js        клиент /api/assist
    pages/
      HomePage.jsx           главная: три модуля, принципы
      CoreRecognitionPage.jsx    модуль 1 — жест → текст/дауыс (камера + GestureEngine + озвучка + фраза)
      EmergencyPhrasesPage.jsx   модуль 2 — экстренные фразы (заготовка)
      LearningPage.jsx           модуль 3 — үйрену (заготовка)
      LibraryPage.jsx            «Кітапхана» — запись новых жестов и проверка библиотеки
    modules.js               реестр модулей: маршруты, названия, категории
    styles/
      tokens.css             цветовая система + режим высокого контраста
      global.css             базовые стили и компоненты
  scripts/
    generate-audio.js        Edge TTS → public/audio/{id}.mp3
```

## GestureEngine — общий движок

```js
import { GestureEngine } from './core/GestureEngine.js'
import { gestureLibrary } from './core/gestureLibrary.js'

const engine = new GestureEngine(gestureLibrary, { minConfidence: 0.75, holdMs: 350, cooldownMs: 1200 })
engine.setCategoryFilter('emergency')            // модуль 2: только экстренные жесты
const off = engine.onMatch(({ gesture, confidence }) => speak(gesture))
tracker.onResults((frame) => engine.matchGesture(frame))   // TrackerFrame из HandTracker
engine.candidate                                  // { gesture, confidence, heldMs, progress } — живая подсказка
engine.scoreAll(frame)                            // похожесть на каждый эталон — обратная связь (модуль 3)
```

Конвейер `matchGesture` (`core/handFeatures.js` + `core/GestureEngine.js`):

1. нормализация — поправка на соотношение сторон кадра, сдвиг в запястье, масштаб по размеру
   кисти (запястье → основание среднего пальца), левая рука зеркалится в правую;
2. сравнение с каждым эталоном → confidence 0..1:
   - `shape` — признаки формы (раскрытость каждого пальца 0..1, направление большого/указательного,
     щипок) против правил; так задан стартовый набор;
   - `landmarksSequence` — взвешенное расстояние до записанных точек (кончики пальцев весят больше);
     несколько кадров — жест с движением: кадры должны совпасть по порядку за `sequenceTimeoutMs`;
3. лучший кандидат и порог `minConfidence`;
4. стабилизация: статичный жест держится `holdMs`, после срабатывания пауза `cooldownMs`;
   жест с движением срабатывает сразу по завершении последовательности;
5. событие `onMatch`.

Пороги признаков — константы в начале `handFeatures.js`, пороги движка — `DEFAULT_OPTIONS` в `GestureEngine.js`.

## Библиотека жестов

- **Встроенные** (`src/core/gestureLibrary.js`) — 9 демонстрационных форм кисти (✋ Сәлем, 👍 Жақсы,
  👎 Жаман, ✊ Иә, ☝️ Бір, ✌️ Екі, 3️⃣ Үш, 👌 Жарайды, 🤟 Жақсы көремін). Это не словарь ҚЖТ, а набор,
  который работает сразу.
- **Записанные** — страница «Кітапхана» (`/library`): показать жест в камеру → «Жазу» → отсчёт 3 с →
  запись (статичный 1,2 с — кадры усредняются; с движением 2 с — 5 ключевых кадров) → «Сақтау».
  Хранятся в `server/data/gestures.json`, озвучка генерируется сразу (`public/audio/{id}.mp3`).
  Без сервера (только Vite) жесты сохраняются в localStorage браузера, озвучка — синтезом речи.
- На странице «Кітапхана» при включённой камере у каждого жеста видна живая похожесть — так проверяют
  и записанные, и встроенные жесты.

API (`server/routes/gestures.js`): `GET /api/gestures[?category=&source=builtin|custom]`,
`GET /api/gestures/:id`, `POST /api/gestures`, `DELETE /api/gestures/:id`.

## Подсказки Gemini в форме записи

Ключ — только на сервере: `.env` в корне проекта (`GEMINI_API_KEY=…`, `GEMINI_MODEL=gemini-flash-latest`),
файл в `.gitignore`, в браузер не попадает. Пример — `.env.example`. Без ключа форма работает без подсказок.
В интерфейсе и в ответах API название сервиса и модели не упоминаются — только «ұсыныс».

Пока пользователь набирает слово/фразу, `POST /api/assist/gesture` (`server/gemini.js`, структурированный
JSON-ответ) возвращает: исправленное казахское написание для озвучки (`label_kk`), текст для экрана
(`label_text`, при вводе на другом языке — с оригиналом в скобках), стикер-эмодзи и 5 альтернатив,
категорию (шұғыл фразы → `emergency`), подсказку «как показать» и замечание к вводу (слишком длинно,
непонятно, нельзя добавлять). Стикер и категория подставляются сами, если пользователь их не трогал;
исправленный текст — по кнопке «Қолдану» (озвучиваются именно слова пользователя). Готовые стикеры
по группам — `src/data/stickers.js` / `components/StickerPicker.jsx`.

Модель из `.env` → при 404/429/503 запасные: `gemini-3.6-flash`, `gemini-3.1-flash-lite`,
`gemini-flash-lite-latest`. Ответы кэшируются по тексту.

## Озвучка

`hooks/useSpeech.js`: mp3 из `public/audio/{id}.mp3` (Edge TTS, `kk-KZ-AigulNeural`), если файла нет —
Web Speech API (казахский голос, если есть в системе, иначе русский/любой). Переключатель «Дауыс»
в модуле 1 запоминается.

## Accessibility

- зоны нажатия ≥ 64×64 px (`--tap-min`), крупный базовый кегль 18 px, видимый фокус;
- информация не только цветом — всегда иконка + подпись;
- privacy-уведомление на каждом экране с камерой; камера включается только по кнопке;
- переключатель высокого контраста в шапке (`.high-contrast` в `tokens.css`), уважается `prefers-reduced-motion`.
