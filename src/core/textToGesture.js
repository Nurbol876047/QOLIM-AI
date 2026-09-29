import { slugify } from './gestureLibrary.js'

/**
 * Қазақ әрпі → пернетақтада көбіне соның орнына басылатын қарапайым кирилл әрпі:
 * көбінің орыс пернетақтасында қазақ әрпі жоқ, сондықтан «Қорқып тұрмын» дегенді
 * жиі «Коркып турмын» деп тереді. slugify() бұл екеуін ӘРТҮРЛІ slug-қа айналдырады
 * (қ→q, к→k — латынға көшіргенде айырмашылық сақталады), сондықтан іздеу алдында
 * екеуін де осы кестемен бір қалыпқа келтіреміз (тек іздеу үшін — id өзгермейді).
 *
 * «і» дыбысын адамдар бірде «и», бірде «ы» деп тереді (тұрақты ереже жоқ: мысалы
 * «мәжбүрмін» көбіне «мажбурмын» болып жазылады, «ы» арқылы) — сондықтан і→ы деп
 * қана қоймай, кез келген «и» да іздеу кезінде «ы»-мен бірдей саналады (екеуі де
 * matchKey арқылы өтетіндіктен, бір-бірімен нақты сөзді шатастырмайды).
 */
const KAZAKH_FOLD = { ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'ы' }

function foldKazakh(text) {
  return text
    .toLowerCase()
    .replace(/[әғқңөұүһі]/g, (ch) => KAZAKH_FOLD[ch] ?? ch)
    .replace(/и/g, 'ы')
}

/** Ключ для сопоставления: сначала свести қазақ-специфичные буквы к обычной кириллице, потом slugify. */
function matchKey(text) {
  return slugify(foldKazakh(text))
}

/**
 * Демо-набор (category 'core', builtin) — жалпыға таныс қол пішіндері (Сәлем, Бір, Екі…),
 * нағыз ҚЖТ сөзі емес (gestureLibrary.js); 'rahmet' — сынақ жазба, бейне дерекқор
 * қосылғанша уақытша тыс қалды. Осыдан кейін қалғаны — «Мәтін → жест» және
 * «Жест анықтамалығы» модульдерінің ортақ жиыны (SOS-жесттер + нақты жазылған/түсірілген).
 */
export function realGestureSet(library) {
  return library.filter((g) => !(g.builtin && g.category === 'core') && g.id !== 'rahmet')
}

/**
 * Индекс «слово/фраза → эталонный жест» для модуля «Мәтін → жест»: по каждому жесту
 * регистрируются подпись (label_kk), текст перевода (label_text), id и алиасы (aliases —
 * например, русские синонимы, см. gestureLibrary.js) — тем же ключом matchKey, каким
 * жадно ищет tokenizeToGestures, так что и «Қорқып тұрмын», и «Коркып турмын» находят
 * один и тот же жест.
 */
export function buildGestureIndex(library) {
  const map = new Map()
  for (const g of library) {
    for (const label of [g.label_kk, g.label_text, g.id, ...(g.aliases ?? [])]) {
      if (!label) continue
      const key = matchKey(label)
      if (key && !map.has(key)) map.set(key, g)
    }
  }
  return map
}

/**
 * Разбивает текст на токены, жадно пробуя самые длинные словосочетания первыми —
 * так многословные жесты («Көмек қажет») распознаются целиком, а не как два разных
 * непонятых слова. Слово, для которого жеста нет, остаётся токеном с gesture: null.
 * @returns {{ word: string, gesture: import('./gestureLibrary.js').ReferenceGesture|null }[]}
 */
export function tokenizeToGestures(text, index, maxWindow = 8) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const tokens = []
  let i = 0
  while (i < words.length) {
    let matchedLen = 0
    let matchedGesture = null
    for (let len = Math.min(maxWindow, words.length - i); len >= 1; len--) {
      const key = matchKey(words.slice(i, i + len).join(' '))
      const gesture = key ? index.get(key) : null
      if (gesture) {
        matchedLen = len
        matchedGesture = gesture
        break
      }
    }
    if (matchedGesture) {
      tokens.push({ word: words.slice(i, i + matchedLen).join(' '), gesture: matchedGesture })
      i += matchedLen
    } else {
      tokens.push({ word: words[i], gesture: null })
      i += 1
    }
  }
  return tokens
}
