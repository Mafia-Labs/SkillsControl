import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogEntry, CatalogPack } from '../lib/types'
import { Empty, Loading } from './shared'

const INITIAL_VISIBLE = 30

export function Discover({ query, catalog, loading, error, onRetry, onInstall, packs, packsLoading, packsError, onRetryPacks, onInstallPack }: {
  query: string
  catalog: CatalogEntry[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onInstall: (entry: CatalogEntry) => void
  packs: CatalogPack[] | null
  packsLoading: boolean
  packsError: string | null
  onRetryPacks: () => void
  onInstallPack: (pack: CatalogPack, skillIds: string[]) => void
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
    <PacksSection packs={packs} loading={packsLoading} error={packsError} onRetry={onRetryPacks} onInstallPack={onInstallPack} />
    <h3 className="discover-section-title">{t('discover.individualSkills')}</h3>
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

function PacksSection({ packs, loading, error, onRetry, onInstallPack }: {
  packs: CatalogPack[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onInstallPack: (pack: CatalogPack, skillIds: string[]) => void
}) {
  const { t } = useTranslation()
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Record<string, string[]>>({})

  const selectionFor = (pack: CatalogPack) => selection[pack.id] ?? pack.entries.map((entry) => entry.id)

  const toggleExpand = (pack: CatalogPack) => {
    setExpandedPackId((current) => current === pack.id ? null : pack.id)
    setSelection((current) => current[pack.id] ? current : { ...current, [pack.id]: pack.entries.map((entry) => entry.id) })
  }

  const toggleSkill = (pack: CatalogPack, skillId: string) => {
    setSelection((current) => {
      const active = current[pack.id] ?? pack.entries.map((entry) => entry.id)
      const next = active.includes(skillId) ? active.filter((id) => id !== skillId) : [...active, skillId]
      return { ...current, [pack.id]: next }
    })
  }

  if (error) return <>
    <h3 className="discover-section-title">{t('discover.packs.title')}</h3>
    <Empty icon="!" title={t('discover.packs.loadError')} detail={error} />
    <button className="secondary-button" onClick={onRetry}>{t('discover.retry')}</button>
  </>

  if (loading || !packs) return <>
    <h3 className="discover-section-title">{t('discover.packs.title')}</h3>
    <Loading label={t('discover.packs.loading')} />
  </>

  if (!packs.length) return null

  return <>
    <div className="discover-section-head">
      <h3 className="discover-section-title">{t('discover.packs.title')}</h3>
      <p className="muted-copy">{t('discover.packs.description')}</p>
    </div>
    <div className="packs-grid">{packs.map((pack) => {
      const expanded = expandedPackId === pack.id
      const selected = selectionFor(pack)
      return <article className="pack-card" key={pack.id}>
        <div className="stack-chips"><span className="stack-chip">{t(`discover.packs.category.${pack.category}`, pack.category)}</span></div>
        <h3>{pack.name}</h3>
        <p>{pack.description}</p>
        <div className="catalog-footer">
          <span className="muted-copy">{t('discover.packs.skillCount', { count: pack.entries.length })}</span>
          <div className="pack-card-actions">
            <button className="secondary-button compact" onClick={() => toggleExpand(pack)}>{expanded ? t('discover.packs.hideSkills') : t('discover.packs.viewSkills')}</button>
            <button className="primary-button compact" onClick={() => onInstallPack(pack, pack.entries.map((entry) => entry.id))}>{t('discover.packs.installPack')} <span>→</span></button>
          </div>
        </div>
        {expanded && <div className="pack-skill-list">
          <div className="pack-skill-list-head">
            <button className="secondary-button compact" onClick={() => setSelection((current) => ({ ...current, [pack.id]: pack.entries.map((entry) => entry.id) }))}>{t('discover.packs.selectAll')}</button>
            <button className="secondary-button compact" onClick={() => setSelection((current) => ({ ...current, [pack.id]: [] }))}>{t('discover.packs.selectNone')}</button>
          </div>
          {pack.entries.map((entry) => <label className="checkbox-row" key={entry.id} htmlFor={`pack-skill-${entry.id}`}>
            <input id={`pack-skill-${entry.id}`} type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggleSkill(pack, entry.id)} />
            <span><strong>{entry.name}</strong> — {entry.description}</span>
          </label>)}
          <button className="primary-button compact" disabled={!selected.length} onClick={() => onInstallPack(pack, selected)}>{t('discover.packs.installSelected', { count: selected.length })}</button>
        </div>}
      </article>
    })}</div>
  </>
}
