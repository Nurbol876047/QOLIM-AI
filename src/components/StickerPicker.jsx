import { useState } from 'react'
import { STICKER_GROUPS } from '../data/stickers.js'

/**
 * Пикер готовых стикеров (эмодзи) по группам. value — выбранный стикер,
 * suggestions — стикеры, подобранные сервером по тексту (показываются первой строкой).
 */
export default function StickerPicker({ value, onChange, suggestions = [], disabled = false }) {
  const [group, setGroup] = useState(STICKER_GROUPS[0].id)
  const current = STICKER_GROUPS.find((g) => g.id === group) ?? STICKER_GROUPS[0]

  const Sticker = ({ s, label }) => (
    <button
      type="button"
      className={`sticker${value === s ? ' is-selected' : ''}`}
      aria-label={label ?? s}
      aria-pressed={value === s}
      onClick={() => onChange(value === s ? '' : s)}
      disabled={disabled}
    >
      {s}
    </button>
  )

  return (
    <div className="sticker-picker">
      {suggestions.length > 0 && (
        <div className="sticker-picker__row">
          <span className="sticker-picker__label">✨ Ұсынылған стикерлер:</span>
          <div className="sticker-grid sticker-grid--inline">
            {suggestions.map((s) => (
              <Sticker key={`ai-${s}`} s={s} label={`Ұсынылған стикер ${s}`} />
            ))}
          </div>
        </div>
      )}
      <div className="sticker-tabs" role="tablist" aria-label="Стикер топтары">
        {STICKER_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            className={`sticker-tab${group === g.id ? ' is-active' : ''}`}
            onClick={() => setGroup(g.id)}
            disabled={disabled}
          >
            <span aria-hidden="true">{g.icon}</span> {g.title}
          </button>
        ))}
      </div>
      <div className="sticker-grid" role="tabpanel">
        {current.items.map((s, i) => (
          <Sticker key={`${current.id}-${i}`} s={s} />
        ))}
      </div>
    </div>
  )
}
