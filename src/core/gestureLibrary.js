/**
 * Библиотека эталонных жестов ҚЖТ.
 *
 * Готовой ML-модели полного словаря нет: распознавание идёт сверкой текущих
 * landmarks с этим набором (см. GestureEngine). Эталон описывается одним из двух
 * способов (можно обоими сразу):
 *
 *   shape             — описание формы кисти правилами (какие пальцы раскрыты,
 *                       куда смотрит большой палец, есть ли щипок). Не зависит от
 *                       человека и камеры — так задан стартовый набор ниже;
 *   landmarksSequence — записанные через камеру кадры (страница «Кітапхана»,
 *                       компонент GestureRecorder). Один кадр — статичный жест,
 *                       несколько — жест с движением. Так добавляются настоящие
 *                       жесты ҚЖТ: записанные жесты хранятся в server/data/gestures.json
 *                       и подмешиваются к этому массиву (см. libraryStore.js).
 *
 * Один и тот же массив используют все три модуля:
 *   модуль 1 (жест → текст/дауыс)  — вся библиотека;
 *   модуль 2 (экстренные фразы)    — фильтр category === 'emergency';
 *   модуль 3 (үйрену)              — фильтр category === 'learning' (или вся библиотека).
 *
 * @typedef {Object} Landmark
 * @property {number} x  0..1 по ширине кадра (как отдаёт MediaPipe)
 * @property {number} y  0..1 по высоте кадра
 * @property {number} [z] глубина относительно запястья (условные единицы)
 *
 * @typedef {Object} GestureShape  описание формы правилами (см. handFeatures.js → compareShape)
 * @property {Array<number|null>} [fingers]  раскрытость [большой, указательный, средний, безымянный, мизинец]: 1 — прямой, 0 — согнут, null — любой
 * @property {'up'|'down'|'side'} [thumbDir] куда смотрит большой палец
 * @property {'up'|'down'|'side'} [pointDir] куда смотрит указательный
 * @property {boolean} [pinch]               большой и указательный сомкнуты
 * @property {number} [minSpread]            минимальное расстояние между кончиками указательного и среднего (в размерах кисти)
 *
 * @typedef {Object} GestureKeyframe  один «снимок» жеста, записанный с камеры
 * @property {Landmark[]} hand        21 точка ведущей руки
 * @property {Landmark[]} [hand2]     21 точка второй руки — для двуручных жестов
 * @property {'Left'|'Right'} [handedness]   какая рука была ведущей при записи
 * @property {'Left'|'Right'} [handedness2]
 * @property {number} aspect          ширина/высота кадра при записи (нужна для нормализации)
 * @property {number} [t]             момент кадра в мс от начала жеста (для динамических жестов)
 *
 * @typedef {Object} ReferenceGesture
 * @property {string} id                              уникальный ключ, латиницей: 'salem', 'rakhmet', 'komek'
 * @property {string} label_kk                        подпись и текст озвучки на казахском: 'Сәлем'
 * @property {string} label_text                      текст, который выводится как перевод (может совпадать с label_kk)
 * @property {'core' | 'emergency' | 'learning'} category
 * @property {GestureKeyframe[]} landmarksSequence    записанные кадры: один — статичный жест, несколько — с движением
 * @property {GestureShape} [shape]                   описание формы правилами (альтернатива записи)
 * @property {string} [icon]                          эмодзи для списка жестов
 * @property {string} [hint_kk]                       подсказка «как показать» — для списка и модуля обучения
 * @property {string} [audio]                         путь к mp3 озвучки; по умолчанию `/audio/${id}.mp3` (см. scripts/generate-audio.js)
 * @property {boolean} [builtin]                      встроенный жест (нельзя удалить со страницы «Кітапхана»)
 * @property {string[]} [aliases]                      доп. написания/переводы для поиска в модуле «Мәтін → жест»
 *                                                      (например, русские синонимы) — не показываются в интерфейсе,
 *                                                      только участвуют в сопоставлении текста (см. textToGesture.js)
 * @property {string} [video]                          путь к видео «кейіпкер осы жестті көрсетеді» для модуля
 *                                                      «Мәтін → жест» (public/videos/{id}.mp4); пока файла нет —
 *                                                      GesturePlayback сам переключается на запасной показ
 */

export const GESTURE_CATEGORIES = /** @type {const} */ (['core', 'emergency', 'learning', 'police'])

export const CATEGORY_LABELS = {
  core: 'Негізгі',
  emergency: 'Шұғыл',
  learning: 'Үйрену',
  police: 'Полиция',
}

/**
 * Стартовый набор — общеизвестные формы кисти, чтобы распознавание и озвучка
 * работали сразу. Это ДЕМОНСТРАЦИОННЫЕ жесты, а не словарь ҚЖТ: настоящие жесты
 * записываются через камеру на странице «Кітапхана» и хранятся отдельно.
 * @type {ReferenceGesture[]}
 */
export const gestureLibrary = [
  {
    id: 'salem',
    label_kk: 'Сәлем',
    label_text: 'Сәлем',
    category: 'core',
    icon: '✋',
    hint_kk: 'Ашық алақан: бес саусақ түгел жазылған, алақан камераға қарайды.',
    shape: { fingers: [1, 1, 1, 1, 1] },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'zhaksy',
    label_kk: 'Жақсы',
    label_text: 'Жақсы',
    category: 'core',
    icon: '👍',
    hint_kk: 'Жұдырық, бас бармақ жоғары қарайды.',
    shape: { fingers: [1, 0, 0, 0, 0], thumbDir: 'up' },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'zhaman',
    label_kk: 'Жаман',
    label_text: 'Жаман',
    category: 'core',
    icon: '👎',
    hint_kk: 'Жұдырық, бас бармақ төмен қарайды.',
    shape: { fingers: [1, 0, 0, 0, 0], thumbDir: 'down' },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'ia',
    label_kk: 'Иә',
    label_text: 'Иә',
    category: 'core',
    icon: '✊',
    hint_kk: 'Жұдырық: барлық саусақ түгел бүгілген, бас бармақ саусақтардың үстінде.',
    shape: { fingers: [0, 0, 0, 0, 0] },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'bir',
    label_kk: 'Бір',
    label_text: 'Бір',
    category: 'core',
    icon: '☝️',
    hint_kk: 'Тек сұқ саусақ жоғары көтерілген, қалғандары бүгілген.',
    shape: { fingers: [null, 1, 0, 0, 0], pointDir: 'up' },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'eki',
    label_kk: 'Екі',
    label_text: 'Екі',
    category: 'core',
    icon: '✌️',
    hint_kk: 'Сұқ және ортан саусақ жоғары, екеуі бір-бірінен ажыратылған (V).',
    shape: { fingers: [null, 1, 1, 0, 0], pointDir: 'up', minSpread: 0.25 },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'ush',
    label_kk: 'Үш',
    label_text: 'Үш',
    category: 'core',
    icon: '3️⃣',
    hint_kk: 'Сұқ, ортан және аты жоқ саусақ жоғары, шынашақ бүгілген.',
    shape: { fingers: [null, 1, 1, 1, 0], pointDir: 'up' },
    landmarksSequence: [],
    builtin: true,
  },
  {
    id: 'zharaidy',
    label_kk: 'Жарайды',
    label_text: 'Жарайды',
    category: 'core',
    icon: '👌',
    hint_kk: 'Бас бармақ пен сұқ саусақ сақина болып түйіседі, қалған үш саусақ жазылған.',
    shape: { fingers: [null, null, 1, 1, 1], pinch: true },
    landmarksSequence: [],
    builtin: true,
  },
  // ---- Шұғыл (emergency) — камерамен танылатын SOS-белгілер ----
  // Нақты ҚЖТ жестері емес, бір қолмен жасалатын ерекше саусақ пішіндері. Иконка —
  // саусақ пішінін нақ сол қалпында көрсететін эмодзи (қолдың өзі, эмоция емес):
  // адам стикерге қарап қай саусақты қалай ұстау керегін тікелей көреді.
  {
    id: 'komek-kazhet',
    label_kk: 'Көмек қажет',
    label_text: 'Көмек қажет',
    category: 'emergency',
    icon: '🤘',
    hint_kk: 'Тек сұқ саусақ пен шынашақ жоғары көтерілген (🤘), бас бармақ, ортан және аты жоқ саусақ бүгілген.',
    shape: { fingers: [0, 1, 0, 0, 1] },
    landmarksSequence: [],
    builtin: true,
    aliases: ['нужна помощь', 'помощь', 'помогите'],
    video: '/videos/komek-kazhet.mp4',
  },
  {
    id: 'korkyp-turmyn',
    label_kk: 'Қорқып тұрмын',
    label_text: 'Қорқып тұрмын',
    category: 'emergency',
    icon: '🤙',
    hint_kk: 'Тек бас бармақ пен шынашақ жазылған (🤙), сұқ, ортан және аты жоқ саусақ бүгілген.',
    shape: { fingers: [1, 0, 0, 0, 1] },
    landmarksSequence: [],
    builtin: true,
    aliases: ['мне страшно', 'я боюсь', 'боюсь'],
    video: '/videos/korkyp-turmyn.mp4',
  },
  {
    id: 'meni-korkytty',
    label_kk: 'Мені қорқытты',
    label_text: 'Мені қорқытты',
    category: 'emergency',
    icon: '👇',
    hint_kk: 'Тек сұқ саусақ көрсетілген және ол төмен қаратылған (👇), қалған саусақтар бүгілген.',
    shape: { fingers: [null, 1, 0, 0, 0], pointDir: 'down' },
    landmarksSequence: [],
    builtin: true,
    aliases: ['меня напугали', 'напугали'],
    video: '/videos/meni-korkytty.mp4',
  },
  {
    id: 'meni-alyp-ketshi',
    label_kk: 'Мені алып кетші',
    label_text: 'Мені алып кетші',
    category: 'emergency',
    icon: '👉',
    hint_kk: 'Тек сұқ саусақ көрсетілген және ол бүйірге қаратылған (👉), қалған саусақтар бүгілген.',
    shape: { fingers: [null, 1, 0, 0, 0], pointDir: 'side' },
    landmarksSequence: [],
    builtin: true,
    aliases: ['заберите меня', 'заберите'],
    video: '/videos/meni-alyp-ketshi.mp4',
  },
  // ---- Полиция (police) — полиция қызметкері азаматқа айтатын дайын сөйлемдер ----
  // Камерамен танылмайды (shape/landmarks жоқ — сурет/бейне ретінде ойналады), тек
  // «Мәтін → жест» және «Жест анықтамалығы» модульдерінде: id мен видео slugify(label_kk)
  // арқылы шыққан (см. scripts/gen_police.mjs типтес есеп — қолмен өзгертпеу керек).
  {
    id: 'men-sizdi-ustauga-mazhburmin',
    label_kk: 'Мен сізді ұстауға мәжбүрмін',
    label_text: 'Мен сізді ұстауға мәжбүрмін',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/men-sizdi-ustauga-mazhburmin.mp4',
  },
  {
    id: 'sizge-qandai-komek-qazhet',
    label_kk: 'Сізге қандай көмек қажет?',
    label_text: 'Сізге қандай көмек қажет?',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/sizge-qandai-komek-qazhet.mp4',
  },
  {
    id: 'quzhattarynyzdy-korsetinizshi',
    label_kk: 'Құжаттарыңызды көрсетіңізші.',
    label_text: 'Құжаттарыңызды көрсетіңізші.',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/quzhattarynyzdy-korsetinizshi.mp4',
  },
  {
    id: 'sabyr-saqtanyz',
    label_kk: 'Сабыр сақтаңыз.',
    label_text: 'Сабыр сақтаңыз.',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/sabyr-saqtanyz.mp4',
  },
  {
    id: 'toqtatuynyzdy-suraimyn',
    label_kk: 'Тоқтатуыңызды сұраймын!',
    label_text: 'Тоқтатуыңызды сұраймын!',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/toqtatuynyzdy-suraimyn.mp4',
  },
  {
    id: 'policiya-qyzmetkerlerinin-zandy-talaptaryna-bagynuynyzdy-suraimyn',
    label_kk: 'Полиция қызметкерлерінің заңды талаптарына бағынуыңызды сұраймын.',
    label_text: 'Полиция қызметкерлерінің заңды талаптарына бағынуыңызды сұраймын.',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/policiya-qyzmetkerlerinin-zandy-talaptaryna-bagynuynyzdy-suraimyn.mp4',
  },
  {
    id: 'oryn-qaida',
    label_kk: 'Орын қайда?',
    label_text: 'Орын қайда?',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/oryn-qaida.mp4',
  },
  {
    id: 'sizdi-policiya-bolimshesine-aparuga-mazhburmin',
    label_kk: 'Сізді полиция бөлімшесіне апаруға мәжбүрмін.',
    label_text: 'Сізді полиция бөлімшесіне апаруға мәжбүрмін.',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/sizdi-policiya-bolimshesine-aparuga-mazhburmin.mp4',
  },
  {
    id: 'men-hattama-toltyruym-kerek',
    label_kk: 'Мен хаттама толтыруым керек.',
    label_text: 'Мен хаттама толтыруым керек.',
    category: 'police',
    icon: '👮',
    landmarksSequence: [],
    builtin: true,
    video: '/videos/men-hattama-toltyruym-kerek.mp4',
  },
]

/** Жесты одной категории — то, что фильтруют модули 2 и 3. */
export function gesturesByCategory(category, library = gestureLibrary) {
  return library.filter((g) => g.category === category)
}

/** Поиск эталона по id (например, чтобы озвучить или показать подсказку). */
export function gestureById(id, library = gestureLibrary) {
  return library.find((g) => g.id === id) ?? null
}

/** URL озвучки жеста — сгенерированный mp3 или явно указанный в записи. */
export const gestureAudioUrl = (gesture) => gesture.audio ?? `/audio/${gesture.id}.mp3`

/** id из подписи: 'Көмек керек' → 'komek-kerek' (для записанных жестов). */
export function slugify(text) {
  const map = {
    ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
    м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  const slug = text
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'gesture'
}
