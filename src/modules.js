/**
 * Реестр трёх модулей — единственное место, где заданы их маршруты, названия и
 * категория жестов. Им пользуются шапка (навигация), главная (карточки) и страницы.
 */
export const MODULES = [
  {
    id: 'core',
    path: '/core',
    num: '01',
    icon: '🖐️',
    title: 'Жест → мәтін / дауыс',
    short: 'Аудармашы',
    description: 'Камера алдында көрсетілген ҚЖТ жестін жүйе мәтінге аударып, дауыстап оқиды.',
    category: 'core',
  },
  {
    id: 'text2gesture',
    path: '/text-to-gesture',
    num: '02',
    icon: '🔤',
    title: 'Мәтін → жест',
    short: 'Мәтіннен жест',
    description: 'Сөз немесе сөйлем жазыңыз — жүйе оны кітапхана жестерімен сәйкестендіріп, камерасыз көрсетеді.',
    category: 'core',
  },
  {
    id: 'gesture-guide',
    path: '/gesture-guide',
    num: '03',
    icon: '👮',
    title: 'Жест анықтамалығы',
    short: 'Анықтамалық',
    description: 'Полиция мен құтқарушыларға арналған тізім: әр ым жестінің бейнесі мен мағынасы бір жерде.',
    category: 'core',
  },
]

export const moduleById = (id) => MODULES.find((m) => m.id === id)

/** Страница библиотеки — не модуль, но живёт в той же навигации: запись и проверка жестов. */
export const LIBRARY_PAGE = {
  id: 'library',
  path: '/library',
  icon: '📚',
  title: 'Жест кітапханасы',
  short: 'Кітапхана',
}
