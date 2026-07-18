import { catalog } from '../lib/demo-data'
import { formatTokenCount } from '../lib/skill-utils'
import type { CatalogSkill } from '../lib/types'
import { Empty } from './shared'
import { useTranslation } from 'react-i18next'

export function Discover({ query, onInstall }: { query: string, onInstall: (skill: CatalogSkill) => void }) {
  const { t } = useTranslation()
  const skills = catalog.filter((skill) => `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="discover">
    <div className="discover-heading"><p className="eyebrow">{t('discover.curatedLibrary')}</p><h2>{t('discover.title')}</h2><p>{t('discover.description')}</p></div>
    <div className="catalog-grid">{skills.length ? skills.map((skill) => <article className="catalog-card" key={skill.id}><div className="catalog-meta"><span>{skill.category}</span><span className="reviewed">✓ {skill.risk}</span></div><h3>{skill.name}</h3><p>{skill.description}</p><div className="catalog-footer"><span>{formatTokenCount(skill.contextTokens)} {t('discover.tokens')}</span><button className="primary-button compact" onClick={() => onInstall(skill)}>{t('common.install')} <span>→</span></button></div></article>) : <Empty icon="⌕" title={t('discover.noMatch')} detail={t('discover.tryDifferent')} />}</div>
    <aside className="curation-note"><span>✦</span><div><strong>{t('discover.trustTitle')}</strong><p>{t('discover.trustDescription')}</p></div></aside>
  </section>
}
