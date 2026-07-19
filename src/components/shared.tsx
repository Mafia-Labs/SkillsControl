import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function Banner({ tone, message, action, onDismiss }: {
  tone: 'error' | 'success'
  message: string
  action?: { label: string, onClick: () => void }
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return <div className={`banner ${tone}`} role="status">
    <span>{tone === 'success' ? '✓' : '!'}</span>{message}
    {action && <button className="banner-action" onClick={action.onClick}>{action.label}</button>}
    <button onClick={onDismiss} aria-label={t('common.dismiss')}>×</button>
  </div>
}

export function Empty({ icon, title, detail }: { icon: string, title: string, detail: string }) {
  return <div className="empty"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div>
}

export function Loading({ label }: { label?: string } = {}) {
  const { t } = useTranslation()
  return <div className="loading"><span className="loader" />{label ?? t('common.readingLocalFolders')}</div>
}

export function PanelHeading({ title, action, onAction }: { title: string, action?: string, onAction?: () => void }) {
  return <div className="panel-heading"><h3>{title}</h3>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div>
}

export function InspectorSection({ title, children }: { title: string, children: ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>
}
