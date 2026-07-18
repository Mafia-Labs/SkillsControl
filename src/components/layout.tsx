import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { supportedLanguages, type SupportedLanguage } from '../i18n'

export type View = 'projects' | 'overview' | 'map' | 'discover' | 'health'

const navigation: Array<{ id: View, labelKey: string, icon: string }> = [
  { id: 'projects', labelKey: 'navigation.projects', icon: '◇' },
  { id: 'overview', labelKey: 'navigation.overview', icon: '◉' },
  { id: 'map', labelKey: 'navigation.map', icon: '⊞' },
  { id: 'discover', labelKey: 'navigation.discover', icon: '⌕' },
  { id: 'health', labelKey: 'navigation.health', icon: '✦' }
]

export function Sidebar({ view, onChange }: { view: View, onChange: (view: View) => void }) {
  const { t } = useTranslation()
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">S</span><span>{t('navigation.brand')}</span></div>
    <nav aria-label={t('navigation.primary')}>
      {navigation.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}>
        <span aria-hidden>{item.icon}</span>{t(item.labelKey)}
      </button>)}
    </nav>
    <div className="sidebar-footer"><span className="status-dot" /> {t('navigation.localFirst')}<br /><small>{t('navigation.noAccount')}</small></div>
  </aside>
}

export function TopBar({ view, search, onSearch, onScan, onAddProject, projectCount, isScanning }: {
  view: View
  search: string
  onSearch: (value: string) => void
  onScan: () => void
  onAddProject: () => void
  projectCount: number
  isScanning: boolean
}) {
  const { t } = useTranslation()
  const titleKey = navigation.find((item) => item.id === view)?.labelKey
  const title = titleKey ? t(titleKey) : t('navigation.brand')
  const workspace = projectCount ? t('topbar.scopeDetected', { count: projectCount }) : t('topbar.localWorkspace')
  const language = (i18n.resolvedLanguage?.split('-')[0] ?? 'en') as SupportedLanguage
  return <header className="topbar">
    <div><p className="eyebrow">{workspace}</p><h1>{title}</h1></div>
    <div className="top-actions">
      <label className="language-control"><span className="sr-only">{t('language.label')}</span><select value={language} aria-label={t('language.label')} onChange={(event: ChangeEvent<HTMLSelectElement>) => void i18n.changeLanguage(event.target.value)}>
        <option value="en">{t('language.english')}</option>
        <option value="es">{t('language.spanish')}</option>
        <option value="fr">{t('language.french')}</option>
        <option value="zh">{t('language.chinese')}</option>
        <option value="ja">{t('language.japanese')}</option>
        <option value="de">{t('language.german')}</option>
        <option value="pt">{t('language.portuguese')}</option>
      </select></label>
      <label className="search"><span>⌕</span><input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => onSearch(event.target.value)} placeholder={t('topbar.searchPlaceholder')} aria-label={t('topbar.searchLabel')} /></label>
      <button className="secondary-button project-button" onClick={onAddProject}>{t('topbar.addFolders')}</button>
      <button className="secondary-button" onClick={onScan} disabled={isScanning}>{isScanning ? <><span className="console-spinner" aria-hidden />{t('topbar.scanning')}</> : t('topbar.scanAgain')}</button>
    </div>
  </header>
}
