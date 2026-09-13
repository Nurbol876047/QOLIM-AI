import { CATEGORY_LABELS } from '../core/gestureLibrary.js'

const CATEGORY_BADGE = { core: 'badge--primary', emergency: 'badge--alert', learning: 'badge--warm' }

/**
 * Список жестов библиотеки. scores — Map id → { confidence, progress } для живых «полосок»
 * (страница «Кітапхана»), onDelete — только для записанных (не builtin) жестов.
 */
export default function GestureList({ gestures, scores, onDelete, compact = false, activeId = null }) {
  if (!gestures.length) {
    return <p className="hint">Кітапхана бос. «Кітапхана» бетінде жаңа жест жазыңыз.</p>
  }
  return (
    <ul className={`gesture-list${compact ? ' gesture-list--compact' : ''}`}>
      {gestures.map((g) => {
        const score = scores?.get(g.id)
        const pct = score ? Math.round(score.confidence * 100) : null
        const dynamic = (g.landmarksSequence?.length ?? 0) > 1
        return (
          <li key={g.id} className={`gesture-item${activeId === g.id ? ' is-active' : ''}`}>
            <span className="gesture-item__icon" aria-hidden="true">
              {g.icon ?? (g.builtin ? '🖐️' : '📹')}
            </span>
            <span className="gesture-item__body">
              <span className="gesture-item__title">
                <strong>{g.label_kk}</strong>
                {g.label_text && g.label_text !== g.label_kk && <span className="hint"> — {g.label_text}</span>}
              </span>
              {!compact && (
                <span className="gesture-item__meta">
                  <span className={`badge ${CATEGORY_BADGE[g.category] ?? ''}`}>{CATEGORY_LABELS[g.category] ?? g.category}</span>
                  <span className="badge">{g.builtin ? '⚙️ Кірістірілген' : g.local ? '💾 Осы браузерде' : '📹 Жазылған'}</span>
                  {dynamic && <span className="badge">🎞️ Қозғалысты</span>}
                  {g.landmarksSequence?.[0]?.hand2 && <span className="badge">🙌 Екі қол</span>}
                </span>
              )}
              {g.hint_kk && <span className="gesture-item__hint">{g.hint_kk}</span>}
              {pct != null && (
                <span className="score" aria-label={`Ұқсастық ${pct}%`}>
                  <span className="score__bar" style={{ width: `${pct}%` }} />
                  <span className="score__value">{pct}%</span>
                </span>
              )}
            </span>
            {onDelete && !g.builtin && (
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`«${g.label_kk}» жестін өшіру`} onClick={() => onDelete(g)}>
                <span className="btn__icon" aria-hidden="true">
                  🗑️
                </span>
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
