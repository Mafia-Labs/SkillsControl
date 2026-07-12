import { catalog } from '../lib/demo-data'
import { formatTokenCount } from '../lib/skill-utils'
import type { CatalogSkill } from '../lib/types'
import { Empty } from './shared'

export function Discover({ query, onInstall }: { query: string, onInstall: (skill: CatalogSkill) => void }) {
  const skills = catalog.filter((skill) => `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="discover">
    <div className="discover-heading"><p className="eyebrow">Curated library</p><h2>Small, reviewed skill packs.</h2><p>Every entry has a known source, an explicit purpose, and a limited context footprint. No open marketplace noise.</p></div>
    <div className="catalog-grid">{skills.length ? skills.map((skill) => <article className="catalog-card" key={skill.id}><div className="catalog-meta"><span>{skill.category}</span><span className="reviewed">✓ {skill.risk}</span></div><h3>{skill.name}</h3><p>{skill.description}</p><div className="catalog-footer"><span>{formatTokenCount(skill.contextTokens)} tokens</span><button className="primary-button compact" onClick={() => onInstall(skill)}>Install <span>→</span></button></div></article>) : <Empty icon="⌕" title="No curated skills match" detail="Try a different term or clear the search." />}</div>
    <aside className="curation-note"><span>✦</span><div><strong>How the library stays trustworthy</strong><p>Each skill is reviewed for structure, scope, scripts and documented compatibility before it appears here.</p></div></aside>
  </section>
}
