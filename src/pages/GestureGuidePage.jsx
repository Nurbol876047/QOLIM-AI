import { useMemo } from 'react'
import { CATEGORY_LABELS } from '../core/gestureLibrary.js'
import { realGestureSet } from '../core/textToGesture.js'
import { useGestureLibrary } from '../hooks/useGestureLibrary.js'
import { moduleById } from '../modules.js'
import GesturePlayback from '../components/GesturePlayback.jsx'

const CATEGORY_BADGE = { core: 'badge--primary', emergency: 'badge--alert', learning: 'badge--warm', police: 'badge--primary' }

/**
 * Модуль 3 — «Жест анықтамалығы»: полиция мен құтқарушыларға арналған тізім, әр жест —
 * бөлек жол (бейне + мағынасы). Видео жоқ болса — GesturePlayback өзі қалыпты жерге
 * ауысады (скелет/постер); жаңа mp4 public/videos/{id}.mp4 қосылған бойда осында пайда
 * болады — беттегі кодты өзгертудің қажеті жоқ (см. src/core/gestureLibrary.js: video).
 */
export default function GestureGuidePage() {
  const module = moduleById('gesture-guide')
  const { library, status } = useGestureLibrary()
  const gestures = useMemo(() => realGestureSet(library), [library])

  return (
    <>
      <section className="page-head" data-animate>
        <span className="badge badge--primary">
          <span aria-hidden="true">{module.icon}</span> Модуль {module.num}
        </span>
        <h1>{module.title}</h1>
        <p className="page-head__lead">{module.description}</p>
      </section>

      <section className="card" data-animate>
        <h2 className="card__title">
          <span className="card__icon" aria-hidden="true">
            🎞️
          </span>
          Жесттер тізімі <span className="badge">{status === 'loading' ? '…' : gestures.length}</span>
        </h2>

        {gestures.length ? (
          <ul className="gesture-guide-list">
            {gestures.map((g) => (
              <li key={g.id} className="card gesture-guide-row" data-animate>
                <div className="gesture-guide-row__media">
                  <GesturePlayback gesture={g} />
                </div>
                <div className="gesture-guide-row__info">
                  <span className={`badge ${CATEGORY_BADGE[g.category] ?? ''}`}>{CATEGORY_LABELS[g.category] ?? g.category}</span>
                  <h3>
                    <span aria-hidden="true">{g.icon ?? '🖐️'}</span> {g.label_kk}
                  </h3>
                  {g.hint_kk && <p className="hint">{g.hint_kk}</p>}
                  {!g.video && <p className="notice notice--warn">Бейне әлі қосылмаған — скелет/постер уақытша көрсетіледі.</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Әзірге тізімде жест жоқ.</p>
        )}
      </section>
    </>
  )
}
