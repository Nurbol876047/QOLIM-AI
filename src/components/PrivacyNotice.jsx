/**
 * Privacy-уведомление — показывается на каждой странице, где включается камера.
 * Текст фиксирован по ТЗ.
 */
export const PRIVACY_TEXT = 'Бейне серверге жіберілмейді, тек браузерде өңделеді.'

export default function PrivacyNotice() {
  return (
    <div className="privacy-notice" role="note">
      <span className="privacy-notice__icon" aria-hidden="true">
        🔒
      </span>
      <p>
        <strong>Құпиялылық:</strong> {PRIVACY_TEXT}
      </p>
    </div>
  )
}
