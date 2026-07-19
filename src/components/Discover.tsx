import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCatalogSkills } from '../lib/desktop'
import type { CatalogEntry } from '../lib/types'
import { Empty, Loading } from './shared'

export function Discover({ query, onInstall }: { query: string, onInstall: (entry: CatalogEntry) => void }) {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    listCatalogSkills()
      .then((entries) => { if (!cancelled) setCatalog(entries) })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [])

  const skills = (catalog ?? []).filter((entry) => `${entry.name} ${entry.description} ${entry.techs.join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  return <section className="discover">
    <div className="discover-heading"><p className="eyebrow">{t('discover.curatedLibrary')}</p><h2>{t('discover.title')}</h2><p>{t('discover.description')}</p></div>
    {error ? <Empty icon="!" title={t('discover.loadError')} detail={error} />
      : !catalog ? <Loading label={t('discover.loadingCatalog')} />
        : <div className="catalog-grid">{skills.length ? skills.map((entry) => <article className="catalog-card" key={entry.id}>
          {entry.techs.length > 0 && <div className="stack-chips">{entry.techs.map((tech) => <span className="stack-chip" key={tech}>{tech}</span>)}</div>}
          <h3>{entry.name}</h3>
          <p>{entry.description}</p>
          <div className="catalog-footer"><code className="recommend-source">{entry.sourceRepo}</code><button className="primary-button compact" onClick={() => onInstall(entry)}>{t('common.install')} <span>→</span></button></div>
        </article>) : <Empty icon="⌕" title={t('discover.noMatch')} detail={t('discover.tryDifferent')} />}</div>}
    <aside className="curation-note"><span>✦</span><div><strong>{t('discover.trustTitle')}</strong><p>{t('discover.trustDescription')}</p></div></aside>
  </section>
}
