import { agentLabels, countDuplicates, countUniqueProjects, formatTokenCount } from '../lib/skill-utils'
import type { Agent, ScanReport } from '../lib/types'
import { Empty, PanelHeading } from './shared'

export function Overview({ report, onViewHealth, onViewMap }: { report: ScanReport, onViewHealth: () => void, onViewMap: () => void }) {
  const errors = report.findings.filter((finding) => finding.severity === 'error').length
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length
  const tokenTotal = report.skills.reduce((total, skill) => total + skill.contextTokens, 0)
  const meterPercent = Math.min(100, Math.max(0, Math.round(tokenTotal / 650) * 10))
  return <>
    <section className="hero">
      <div><p className="eyebrow">SkillsDock · System diagnosis</p><h2>Every skill. Every agent. Under control.</h2><p>Inventory global and folder-scoped installations, find risky or divergent copies, and deploy the smallest configuration each project needs.</p></div>
      <button className="primary-button" onClick={onViewMap}>Open Skill Map <span>→</span></button>
    </section>
    <section className="stat-grid" aria-label="Inventory summary">
      <Stat value={report.skills.length} label="Skills found" detail="Across local scopes" />
      <Stat value={report.agents.length} label="Agents detected" detail={report.agents.length ? report.agents.map((agent) => agentLabels[agent as Agent]).join(' · ') : 'Run a scan to detect'} />
      <Stat value={countUniqueProjects(report)} label="Project scopes" detail="Available for local install" />
      <Stat value={countDuplicates(report)} label="Overlaps" detail="Overrides or divergent copies" />
    </section>
    <section className="two-column">
      <div className="panel diagnosis"><PanelHeading title="Recommended next actions" action="View all" onAction={onViewHealth} />
        {errors + warnings === 0 ? <Empty icon="✓" title="Everything looks healthy" detail="No structural issues were found in the scanned skills." /> : <>
          <ActionItem label={`${errors} urgent issue${errors === 1 ? '' : 's'}`} detail="Fix invalid skill definitions first" tone="error" onClick={onViewHealth} />
          <ActionItem label={`${warnings} review suggested`} detail="Inspect scripts and divergent copies" tone="warning" onClick={onViewHealth} />
          <ActionItem label="Reduce global scope" detail={`${countDuplicates(report)} skills overlap across scopes or content`} tone="info" onClick={onViewMap} />
        </>}
      </div>
      <div className="panel footprint"><PanelHeading title="Context footprint" />
        <div className="footprint-total">{formatTokenCount(tokenTotal)}<small>potential activation tokens</small></div>
        <p>Estimate based on scanned <code>SKILL.md</code> files. Project-local installation limits discovery to relevant workspaces, but this is not a billable-token measurement.</p>
        <div className="meter"><span className={`meter-fill meter-${meterPercent}`} /></div>
      </div>
    </section>
  </>
}

function Stat({ value, label, detail }: { value: number, label: string, detail: string }) {
  return <article className="stat"><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>
}

function ActionItem({ label, detail, tone, onClick }: { label: string, detail: string, tone: 'error' | 'warning' | 'info', onClick: () => void }) {
  return <button className="action-item" onClick={onClick}><span className={`severity ${tone}`} /><span><strong>{label}</strong><small>{detail}</small></span><b>→</b></button>
}
