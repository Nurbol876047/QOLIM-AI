import { LIBRARY_PAGE, MODULES } from '../modules.js'
import ModuleCard from '../components/ModuleCard.jsx'
import { PRIVACY_TEXT } from '../components/PrivacyNotice.jsx'

const STEPS = [
  { n: '1', text: 'Камераны қосасыз — бейне серверге кетпейді, барлық есептеу браузердің ішінде.' },
  { n: '2', text: 'MediaPipe қолдың 21 нүктесін табады, PixiJS оларды бейненің үстінен салады.' },
  { n: '3', text: 'GestureEngine нүктелерді эталон жестердің кітапханасымен салыстырып, мәтін мен дауыс береді.' },
]

const PRINCIPLES = [
  { icon: '🔲', text: 'Барлық басу аймақтары 64×64 px-тен кем емес, мәтін контрасты жоғары.' },
  { icon: '🏷️', text: 'Ақпарат ешқашан тек түспен берілмейді — әрқашан белгіше + жазу.' },
  { icon: '🔒', text: PRIVACY_TEXT },
]

export default function HomePage() {
  return (
    <>
      <section className="page-head" data-animate>
        <span className="badge badge--primary">
          <span aria-hidden="true">🤟</span> Қазақ жестілі тілі · ҚЖТ
        </span>
        <h1>Жестті түсінетін көмекші</h1>
        <p className="page-head__lead">
          QOLIM AI қазақ жестілі тілінің жестерін компьютерлік көру арқылы мәтінге аударып, дауыстап оқиды. Дайын ML-сөздіксіз:
          тану алдын ала жазылған эталон жестермен салыстыру арқылы жүреді.
        </p>
      </section>

      <section className="grid-2 grid-2--even" aria-label="Модульдер">
        {MODULES.map((m) => (
          <ModuleCard key={m.id} module={m} />
        ))}
        <ModuleCard
          module={{
            ...LIBRARY_PAGE,
            id: 'library',
            num: 'Кітапхана',
            description: 'Өз жестіңізді камераға көрсетіп жазыңыз — стикер, санат және дауыс автоматты түрде дайындалады.',
          }}
        />
      </section>

      <section className="grid-2">
        <div className="card card--pad-lg" data-animate>
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              ⚙️
            </span>
            Қалай жұмыс істейді
          </h2>
          <ul className="list-check">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="list-check__icon" aria-hidden="true">
                  {s.n}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card card--pad-lg" data-animate>
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              ♿
            </span>
            Қолжетімділік
          </h2>
          <ul className="list-check">
            {PRINCIPLES.map((p) => (
              <li key={p.icon}>
                <span className="list-check__icon" aria-hidden="true">
                  {p.icon}
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
