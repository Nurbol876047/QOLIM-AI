import { NavLink } from 'react-router-dom'
import { LIBRARY_PAGE, MODULES } from '../modules.js'

/**
 * Шапка: логотип, навигация по трём модулям и переключатель высокого контраста.
 * Все зоны нажатия — не меньше --tap-min (64px).
 */
export default function AppHeader({ highContrast, onToggleContrast }) {
  return (
    <header className="app-header">
      <div className="container app-header__inner">
        <NavLink to="/" className="brand" aria-label="QOLIM AI — басты бет">
          <img className="brand__mark" src="/favicon.svg" alt="" width="44" height="44" />
          <span>
            <span className="brand__title">QOLIM AI</span>
            <span className="brand__subtitle">ҚЖТ аудармашысы</span>
          </span>
        </NavLink>

        <nav className="nav" aria-label="Модульдер">
          {[...MODULES, LIBRARY_PAGE].map((m) => (
            <NavLink key={m.id} to={m.path} className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}>
              <span className="nav__icon" aria-hidden="true">
                {m.icon}
              </span>
              <span>{m.short}</span>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-pressed={highContrast}
          aria-label={highContrast ? 'Жоғары контраст режимін өшіру' : 'Жоғары контраст режимін қосу'}
          title={highContrast ? 'Жоғары контраст: қосулы' : 'Жоғары контраст: өшірулі'}
          onClick={onToggleContrast}
        >
          {/* полукруг «контраст» — SVG, а не символ ◐: глиф в шрифтах рисуется по-разному */}
          <svg className="btn__icon" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
            <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M14 3a11 11 0 0 1 0 22z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  )
}
