import { useState } from 'react'
import { abbreviatePath, countDuplicates, countUniqueProjects, formatTokenCount, healthClass, healthLabelKey } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, ScanReport, Skill } from '../lib/types'
import { Empty, PanelHeading } from './shared'
import { useTranslation } from 'react-i18next'

export function Overview({ report, inventories, globalSkills, onViewHealth, onViewMap, onOpenProject, onInspect, onUninstall }: {
  report: ScanReport
  inventories: ProjectInventory[]
  globalSkills: Skill[]
  onViewHealth: () => void
  onViewMap: () => void
  onOpenProject: (path: string) => void
  onInspect: (skillId: string) => void
  onUninstall: (installations: Installation[]) => void
}) {
  const { t } = useTranslation()
  const errors = report.findings.filter((finding) => finding.severity === 'error').length
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length
  const tokenTotal = report.skills.reduce((total, skill) => total + skill.contextTokens, 0)
  const meterPercent = Math.min(100, Math.max(0, Math.round(tokenTotal / 650) * 10))
  const rootInventories = inventories.filter((inventory) => !inventory.parentPath || !inventories.some((candidate) => candidate.path === inventory.parentPath))
  return <>
    <section className="hero">
      <div><p className="eyebrow">{t('health.systemDiagnosis')}</p><h2>{t('health.heroTitle')}</h2><p>{t('health.heroDescription')}</p></div>
      <button className="primary-button" onClick={onViewMap}>{t('health.openSkillMap')} <span>→</span></button>
    </section>
    <section className="stat-grid" aria-label={t('health.inventorySummary')}>
      <Stat value={report.skills.length} label={t('health.skillsFound')} detail={t('health.acrossLocalScopes')} />
      <Stat value={report.agents.length} label={t('health.agentsDetected')} detail={report.agents.length ? report.agents.map((agent) => t(`agents.${agent}`)).join(' · ') : t('health.runScanToDetect')} />
      <Stat value={countUniqueProjects(report)} label={t('health.projectScopes')} detail={t('health.availableForLocalInstall')} />
      <Stat value={countDuplicates(report)} label={t('health.overlaps')} detail={t('health.overridesOrDivergentCopies')} />
    </section>
    <section className="panel global-panel" aria-label={t('projects.globallyInstalledSkills')}>
      <div className="panel-heading-row">
        <div className="panel-heading"><h3>{t('projects.globalSkills')}</h3><span className="count-chip">{globalSkills.length}</span></div>
        {globalSkills.length > 0 && <span className="global-caution">⚠ {t('projects.globalCaution')}</span>}
      </div>
      {globalSkills.length
        ? <div className="global-list">{globalSkills.map((skill) => <GlobalSkillRow key={skill.id} skill={skill} findings={report.findings} onInspect={onInspect} onUninstall={onUninstall} />)}</div>
        : <p className="global-empty-copy">{t('projects.noGlobalSkills')}</p>}
    </section>
    <section className="panel global-panel" aria-label={t('overview.scannedFolders')}>
      <div className="panel-heading-row">
        <div className="panel-heading"><h3>{t('overview.scannedFolders')}</h3><span className="count-chip">{rootInventories.length}</span></div>
      </div>
      {rootInventories.length ? <div className="global-list">{rootInventories.map((inventory) => <button className="folder-row" key={inventory.path} onClick={() => onOpenProject(inventory.path)} aria-label={t('projects.openProject', { name: inventory.name })}>
        <span className="folder-main">
          <strong>{inventory.name}</strong>
          <code className="global-path" title={inventory.path}>{abbreviatePath(inventory.path)}</code>
        </span>
        <span className="agent-cell">{inventory.agents.map((agent) => <span className="agent-badge sm" key={agent}>{t(`agents.${agent}`)}</span>)}</span>
        <span className="folder-count">{t('projects.skillCount', { count: inventory.skills.length })}</span>
        <b aria-hidden>→</b>
      </button>)}</div> : <Empty icon="◇" title={t('projects.noProjects')} detail={t('projects.noProjectsDetail')} />}
    </section>
    <section className="two-column">
      <div className="panel diagnosis"><PanelHeading title={t('health.recommendedNextActions')} action={t('health.viewAll')} onAction={onViewHealth} />
        {errors + warnings === 0 ? <Empty icon="✓" title={t('health.everythingHealthy')} detail={t('health.noStructuralIssues')} /> : <>
          <ActionItem label={t('health.urgentIssue', { count: errors })} detail={t('health.fixInvalidDefinitions')} tone="error" onClick={onViewHealth} />
          <ActionItem label={t('health.reviewSuggestedCount', { count: warnings })} detail={t('health.inspectScripts')} tone="warning" onClick={onViewHealth} />
          <ActionItem label={t('health.reduceGlobalScope')} detail={t('health.overlap', { count: countDuplicates(report) })} tone="info" onClick={onViewMap} />
        </>}
      </div>
      <div className="panel footprint"><PanelHeading title={t('health.contextFootprint')} />
        <div className="footprint-total">{formatTokenCount(tokenTotal)}<small>{t('common.potentialActivationTokens')}</small></div>
        <p>{t('health.footprintDescription')}</p>
        <div className="meter"><span className={`meter-fill meter-${meterPercent}`} /></div>
      </div>
    </section>
  </>
}

function GlobalSkillRow({ skill, findings, onInspect, onUninstall }: {
  skill: Skill
  findings: Finding[]
  onInspect: (skillId: string) => void
  onUninstall: (installations: Installation[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const userInstallations = skill.installations.filter((installation) => installation.scope === 'user')
  return <div className={`global-row expandable ${open ? 'open' : ''}`}>
    <button className="global-row-head" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={t(open ? 'overview.hideDetails' : 'overview.showDetails', { name: skill.name })}>
      <span className="chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      <strong>{skill.name}</strong>
      <span className={`health-pill ${healthClass(skill, findings)}`}>{t(healthLabelKey(skill, findings))}</span>
    </button>
    {open && <div className="global-row-details">
      <small>{skill.description || t('common.noDescription')}</small>
      {userInstallations.map((installation) => <code className="global-path" key={installation.id} title={installation.path}>{abbreviatePath(installation.path)}</code>)}
      <div className="global-row-meta">
        <span className="agent-cell">{[...new Set(userInstallations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{t(`agents.${agent}`)}</span>)}</span>
        <span className="global-tokens" title={t('projects.approximateContextCost')}>{formatTokenCount(skill.contextTokens)} {t('common.tokens')}</span>
      </div>
      <div className="row-actions">
        <button className="secondary-button compact" onClick={() => onInspect(skill.id)}>{t('common.inspect')}</button>
        {userInstallations.length > 0 && <button className="danger-button compact" onClick={() => onUninstall(userInstallations)}>{t('common.uninstallGlobal', { count: userInstallations.length })}</button>}
      </div>
    </div>}
  </div>
}

function Stat({ value, label, detail }: { value: number, label: string, detail: string }) {
  return <article className="stat"><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>
}

function ActionItem({ label, detail, tone, onClick }: { label: string, detail: string, tone: 'error' | 'warning' | 'info', onClick: () => void }) {
  return <button className="action-item" onClick={onClick}><span className={`severity ${tone}`} /><span><strong>{label}</strong><small>{detail}</small></span><b>→</b></button>
}
