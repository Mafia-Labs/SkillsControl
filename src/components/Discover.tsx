import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogEntry } from '../lib/types'
import { Empty, Loading } from './shared'

const INITIAL_VISIBLE = 30

export function Discover({ query, catalog, loading, error, onRetry, onInstall }: {
  query: string
  catalog: CatalogEntry[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onInstall: (entry: CatalogEntry) => void
}) {
  const { t } = useTranslation()
  const [technology, setTechnology] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE)
  const entries = catalog ?? []
  const technologies = useMemo(() => [...new Set(entries.flatMap((entry) => entry.techs))].sort((a, b) => a.localeCompare(b)), [entries])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries.filter((entry) => {
      const matchesTechnology = !technology || entry.techs.includes(technology)
      const matchesQuery = !normalizedQuery || `${entry.name} ${entry.description} ${entry.techs.join(' ')}`.toLowerCase().includes(normalizedQuery)
      return matchesTechnology && matchesQuery
    })
  }, [entries, query, technology])
  const visible = filtered.slice(0, visibleLimit)
  const remaining = filtered.length - visible.length

  useEffect(() => { setVisibleLimit(INITIAL_VISIBLE) }, [query, technology])

  return <section className="discover">
    <div className="discover-heading"><p className="eyebrow">{t('discover.curatedLibrary')}</p><h2>{t('discover.title')}</h2><p>{t('discover.description')}</p></div>
    {error ? <>
      <Empty icon="!" title={t('discover.loadError')} detail={error} />
      <button className="secondary-button" onClick={onRetry}>{t('discover.retry')}</button>
    </> : loading || !catalog ? <Loading label={t('discover.loadingCatalog')} />
      : <>
        <div className="discover-toolbar">
          <label className="select-label">{t('discover.filterTechnology')}
            <select aria-label={t('discover.filterTechnology')} value={technology} onChange={(event) => setTechnology(event.target.value)}>
              <option value="">{t('discover.allTechnologies')}</option>
              {technologies.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <span className="muted-copy">{t('discover.resultsCount', { visible: visible.length, total: filtered.length })}</span>
        </div>
        <div className="catalog-grid">{visible.length ? visible.map((entry) => <article className="catalog-card" key={entry.id}>
          {entry.techs.length > 0 && <div className="stack-chips">{entry.techs.map((tech) => <span className="stack-chip" key={tech}>{tech}</span>)}</div>}
          <h3>{entry.name}</h3>
          <p>{entry.description}</p>
          <div className="catalog-footer"><code className="recommend-source">{entry.sourceRepo}</code><button className="primary-button compact" onClick={() => onInstall(entry)}>{t('common.install')} <span>→</span></button></div>
        </article>) : <Empty icon="⌕" title={t('discover.noMatch')} detail={t('discover.tryDifferent')} />}</div>
        {remaining > 0 && <button className="secondary-button" onClick={() => setVisibleLimit((current) => current + INITIAL_VISIBLE)}>{t('discover.showMore', { count: remaining })}</button>}
      </>}
    <aside className="curation-note"><span>✦</span><div><strong>{t('discover.trustTitle')}</strong><p>{t('discover.trustDescription')}</p></div></aside>
  </section>
}
