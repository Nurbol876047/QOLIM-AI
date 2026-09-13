import { Link } from 'react-router-dom'

/** Карточка модуля на главной. Цвет модуля дублируется номером и иконкой — не только цветом. */
export default function ModuleCard({ module }) {
  return (
    <Link to={module.path} className={`card module-card module-card--${module.id}`} data-animate>
      <span className="module-card__icon" aria-hidden="true">
        {module.icon}
      </span>
      <span className="module-card__num">{/^\d+$/.test(module.num) ? `Модуль ${module.num}` : module.num}</span>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <span className="module-card__cta">
        Ашу <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}
