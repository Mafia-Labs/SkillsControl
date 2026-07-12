import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { catalog } from './lib/demo-data'
import { disableSkill, installCatalogSkill, previewDisable, scanSkills } from './lib/desktop'
import { agentLabels, countDuplicates, countUniqueProjects, formatTokenCount, getSkillHealth, healthLabel, severityOrder } from './lib/skill-utils'
import type { Agent, CatalogSkill, ChangePreview, Finding, Installation, ScanReport, Skill } from './lib/types'

type View = 'overview' | 'map' | 'discover' | 'health'
type ModalState = { kind: 'disable', installation: Installation, preview: ChangePreview } | { kind: 'install', skill: CatalogSkill } | null

const nav: Array<{ id: View, label: string, icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '◉' }, { id: 'map', label: 'Skill Map', icon: '⊞' },
  { id: 'discover', label: 'Discover', icon: '⌕' }, { id: 'health', label: 'Health', icon: '✦' }
]

const agentOrder: Agent[] = ['agents', 'codex', 'claude']

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setIsScanning(true); setError(null)
    try {
      const next = await scanSkills()
      setReport(next)
      setSelectedId((current) => current && next.skills.some((skill) => skill.id === current) ? current : next.skills[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scan could not complete.')
    } finally { setIsScanning(false) }
  }

  useEffect(() => { void refresh() }, [])

  const filteredSkills = useMemo(() => (report?.skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const selected = report?.skills.find((skill) => skill.id === selectedId) ?? null

  const requestDisable = async (installation: Installation) => {
    try { setModal({ kind: 'disable', installation, preview: await previewDisable(installation) }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare this change.') }
  }

  const applyModal = async (target?: string) => {
    if (!modal) return
    try {
      if (modal.kind === 'disable') { await disableSkill(modal.installation); setNotice('Skill disabled and retained in the local archive.') }
      else { await installCatalogSkill(modal.skill.id, target ?? 'agents'); setNotice(`${modal.skill.name} installed and validated.`) }
      setModal(null); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The change could not be applied.') }
  }

  return <main className="app-shell">
    <Sidebar view={view} onChange={setView} />
    <section className="workspace">
      <TopBar view={view} search={search} onSearch={setSearch} onScan={() => void refresh()} isScanning={isScanning} />
      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice(null)} />}
      {isScanning && !report ? <Loading /> : <div className="page-content">
        {view === 'overview' && report && <Overview report={report} onViewHealth={() => setView('health')} onViewMap={() => setView('map')} />}
        {view === 'map' && report && <SkillMap skills={filteredSkills} report={report} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === 'discover' && <Discover onInstall={(skill) => setModal({ kind: 'install', skill })} />}
        {view === 'health' && report && <Health report={report} onSelect={(id) => { setSelectedId(id); setView('map') }} />}
      </div>}
    </section>
    {view === 'map' && selected && report && <Inspector skill={selected} findings={getSkillHealth(selected, report.findings)} onDisable={requestDisable} />}
    {modal && <ChangeModal modal={modal} onCancel={() => setModal(null)} onApply={applyModal} />}
  </main>
}

function Sidebar({ view, onChange }: { view: View, onChange: (view: View) => void }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">S</span><span>Skill Control</span></div>
    <nav aria-label="Primary navigation">{nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}><span aria-hidden>{item.icon}</span>{item.label}</button>)}</nav>
    <div className="sidebar-footer"><span className="status-dot" /> Local-first<br /><small>No account connected</small></div>
  </aside>
}

function TopBar({ view, search, onSearch, onScan, isScanning }: { view: View, search: string, onSearch: (value: string) => void, onScan: () => void, isScanning: boolean }) {
  const title = nav.find((item) => item.id === view)?.label ?? 'Skill Control'
  return <header className="topbar"><div><p className="eyebrow">Local workspace</p><h1>{title}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search skills" aria-label="Search skills" /></label><button className="secondary-button" onClick={onScan} disabled={isScanning}>{isScanning ? 'Scanning…' : 'Scan again'}</button></div></header>
}

function Overview({ report, onViewHealth, onViewMap }: { report: ScanReport, onViewHealth: () => void, onViewMap: () => void }) {
  const errors = report.findings.filter((finding) => finding.severity === 'error').length
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length
  return <><section className="hero"><div><p className="eyebrow">System diagnosis</p><h2>Your agent skills, made legible.</h2><p>Inventory every local installation, find the risky ones, and deploy intentional configurations without hand-editing folders.</p></div><button className="primary-button" onClick={onViewMap}>Open Skill Map <span>→</span></button></section>
  <section className="stat-grid" aria-label="Inventory summary"><Stat value={report.skills.length} label="Skills found" detail="Across local scopes" /><Stat value={report.agents.length} label="Agents detected" detail={report.agents.length ? report.agents.map((agent) => agentLabels[agent as Agent]).join(' · ') : 'Run a scan to detect'} /><Stat value={countUniqueProjects(report)} label="Projects" detail="With discovered skills" /><Stat value={countDuplicates(report)} label="Duplicates" detail="Worth reviewing" /></section>
  <section className="two-column"><div className="panel diagnosis"><PanelHeading title="Recommended next actions" action="View all" onAction={onViewHealth} />{errors + warnings === 0 ? <Empty icon="✓" title="Everything looks healthy" detail="No structural issues were found in the scanned skills." /> : <><ActionItem label={`${errors} urgent issue${errors === 1 ? '' : 's'}`} detail="Fix invalid or outdated skills first" tone="error" onClick={onViewHealth} /><ActionItem label={`${warnings} review suggested`} detail="Inspect scripts and local modifications" tone="warning" onClick={onViewHealth} /><ActionItem label="Check scope collisions" detail={`${countDuplicates(report)} skills appear in more than one location`} tone="info" onClick={onViewMap} /></>}</div><div className="panel footprint"><PanelHeading title="Context footprint" /><div className="footprint-total">{formatTokenCount(report.skills.reduce((total, skill) => total + skill.contextTokens, 0))}<small>potential activation tokens</small></div><p>Estimate based on the scanned <code>SKILL.md</code> files. It indicates potential load, not actual agent token usage.</p><div className="meter"><span style={{ width: `${Math.min(100, report.skills.reduce((total, skill) => total + skill.contextTokens, 0) / 65)}%` }} /></div></div></section>
  </>
}

function Stat({ value, label, detail }: { value: number, label: string, detail: string }) { return <article className="stat"><strong>{value}</strong><span>{label}</span><small>{detail}</small></article> }
function PanelHeading({ title, action, onAction }: { title: string, action?: string, onAction?: () => void }) { return <div className="panel-heading"><h3>{title}</h3>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div> }
function ActionItem({ label, detail, tone, onClick }: { label: string, detail: string, tone: 'error' | 'warning' | 'info', onClick: () => void }) { return <button className="action-item" onClick={onClick}><span className={`severity ${tone}`} /><span><strong>{label}</strong><small>{detail}</small></span><b>→</b></button> }

const healthClass = (skill: Skill, findings: Finding[]) => healthLabel(skill, findings).replace(/\s+/g, '-').toLowerCase()

function SkillMap({ skills, report, selectedId, onSelect }: { skills: Skill[], report: ScanReport, selectedId: string | null, onSelect: (id: string) => void }) {
  return <section className="map-wrap"><div className="map-intro"><div><p className="eyebrow">Scope matrix</p><h2>Where every skill is active.</h2><p>Project copies take precedence over user installations. Select a row to inspect its files, health, and locations.</p></div><div className="legend"><span><i className="scope-dot project" />Project</span><span><i className="scope-dot user" />Global</span><span><i className="scope-dot muted" />Not installed</span></div></div><div className="map-table" role="grid" aria-label="Skill scope matrix"><div className="map-row table-head" role="row"><span>Skill</span>{agentOrder.map((agent) => <span key={agent}>{agentLabels[agent]}</span>)}<span>Health</span></div>{skills.length ? skills.map((skill) => <button key={skill.id} role="row" className={`map-row ${selectedId === skill.id ? 'selected' : ''}`} onClick={() => onSelect(skill.id)}><span className="skill-cell"><strong>{skill.name}</strong><small>{skill.installations.length} location{skill.installations.length === 1 ? '' : 's'}</small></span>{agentOrder.map((agent) => <ScopeCell key={agent} installations={skill.installations.filter((installation) => installation.agent === agent)} />)}<span className={`health-pill ${healthClass(skill, report.findings)}`}>{healthLabel(skill, report.findings)}</span></button>) : <div className="empty-row">No skills match this search.</div>}</div></section>
}

function ScopeCell({ installations }: { installations: Installation[] }) { const project = installations.some((installation) => installation.scope === 'project'); const user = installations.some((installation) => installation.scope === 'user'); return <span className="scope-cell">{project && <i className="scope-dot project" title="Installed in project" />}{user && <i className="scope-dot user" title="Installed globally" />}{!project && !user && <i className="scope-dot muted" title="Not installed" />}</span> }

function Inspector({ skill, findings, onDisable }: { skill: Skill, findings: Finding[], onDisable: (installation: Installation) => void }) {
  return <aside className="inspector"><div className="inspector-head"><div><p className="eyebrow">Skill inspector</p><h2>{skill.name}</h2></div><span className={`health-pill ${healthClass(skill, findings)}`}>{healthLabel(skill, findings)}</span></div><p className="inspector-description">{skill.description || 'No description is available.'}</p><InspectorSection title="Installed in">{skill.installations.map((installation) => <div className="location" key={installation.id}><span><i className={`scope-dot ${installation.scope}`} />{installation.scope === 'project' ? 'Project' : 'Global'} · {agentLabels[installation.agent]}</span><code title={installation.path}>{installation.path}</code><button className="icon-button" aria-label={`Disable ${skill.name} from ${installation.path}`} onClick={() => void onDisable(installation)}>⊘</button></div>)}</InspectorSection><InspectorSection title="Context footprint"><div className="token-number">{formatTokenCount(skill.contextTokens)} <small>estimated tokens</small></div><p className="muted-copy">Catalog metadata is loaded first. Full instructions load only when an agent activates this skill.</p></InspectorSection><InspectorSection title="Files"><ul className="file-list">{skill.files.map((file) => <li key={file}><span>⌁</span>{file}{skill.executableScripts.includes(file) && <b>executable</b>}</li>)}</ul></InspectorSection><InspectorSection title="Health">{findings.length ? <ul className="finding-list">{findings.map((finding) => <li key={finding.id}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div></li>)}</ul> : <p className="healthy-copy">✓ Structure looks valid and no risks were detected.</p>}</InspectorSection></aside>
}

function InspectorSection({ title, children }: { title: string, children: ReactNode }) { return <section className="inspector-section"><h3>{title}</h3>{children}</section> }

function Discover({ onInstall }: { onInstall: (skill: CatalogSkill) => void }) { return <section className="discover"><div className="discover-heading"><p className="eyebrow">Curated library</p><h2>Small, reviewed skill packs.</h2><p>Every entry has a known source, an explicit purpose, and a limited context footprint. No open marketplace noise.</p></div><div className="catalog-grid">{catalog.map((skill) => <article className="catalog-card" key={skill.id}><div className="catalog-meta"><span>{skill.category}</span><span className="reviewed">✓ {skill.risk}</span></div><h3>{skill.name}</h3><p>{skill.description}</p><div className="catalog-footer"><span>{formatTokenCount(skill.contextTokens)} tokens</span><button className="primary-button compact" onClick={() => onInstall(skill)}>Install <span>→</span></button></div></article>)}</div><aside className="curation-note"><span>✦</span><div><strong>How the library stays trustworthy</strong><p>Each skill is reviewed for structure, scope, scripts and documented compatibility before it appears here.</p></div></aside></section> }

function Health({ report, onSelect }: { report: ScanReport, onSelect: (id: string) => void }) { const findings = [...report.findings].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)); return <section className="health-page"><div className="health-heading"><div><p className="eyebrow">Health check</p><h2>Fix what can affect your agents.</h2><p>These checks are structural and local. They never execute a skill or upload its contents.</p></div><span className="check-status">✓ Scan complete</span></div><div className="health-summary"><span><i className="severity error" />{findings.filter((finding) => finding.severity === 'error').length} urgent</span><span><i className="severity warning" />{findings.filter((finding) => finding.severity === 'warning').length} review</span><span><i className="severity info" />{findings.filter((finding) => finding.severity === 'info').length} informational</span></div><div className="findings-table">{findings.length ? findings.map((finding) => <button key={finding.id} className="finding-row" onClick={() => onSelect(finding.skillId)}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><code>{report.skills.find((skill) => skill.id === finding.skillId)?.name ?? finding.skillId}</code><b>→</b></button>) : <Empty icon="✓" title="No health findings" detail="The scanned skills meet the current structural checks." />}</div></section> }

function ChangeModal({ modal, onCancel, onApply }: { modal: Exclude<ModalState, null>, onCancel: () => void, onApply: (target?: string) => void }) { const [target, setTarget] = useState('agents'); const install = modal.kind === 'install'; return <div className="modal-backdrop" role="presentation"><section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title"><div className="modal-icon">{install ? '↓' : '⊘'}</div><p className="eyebrow">Review change</p><h2 id="change-title">{install ? `Install ${modal.skill.name}` : modal.preview.title}</h2>{install ? <><p>Choose the scope where this curated skill should be available.</p><label className="select-label">Install location<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="agents">Global · Agent Skills</option><option value="codex">Global · Codex</option><option value="claude">Global · Claude</option><option value="project">Current project · .agents/skills</option></select></label><div className="change-list"><strong>Skill Control will</strong><span>• Create a new folder and validated <code>SKILL.md</code></span><span>• Never overwrite an existing installation</span></div></> : <><div className="change-list"><strong>Changes</strong>{modal.preview.changes.map((change) => <span key={change}>• {change}</span>)}</div><div className="warning-box"><strong>Heads up</strong>{modal.preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></>}<div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className={install ? 'primary-button' : 'danger-button'} onClick={() => void onApply(target)}>{install ? 'Install skill' : 'Disable skill'}</button></div></section></div> }
function Banner({ tone, message, onDismiss }: { tone: 'error' | 'success', message: string, onDismiss: () => void }) { return <div className={`banner ${tone}`} role="status"><span>{tone === 'success' ? '✓' : '!'}</span>{message}<button onClick={onDismiss} aria-label="Dismiss message">×</button></div> }
function Empty({ icon, title, detail }: { icon: string, title: string, detail: string }) { return <div className="empty"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div> }
function Loading() { return <div className="loading"><span className="loader" />Reading local skill folders…</div> }
