import { countDuplicates, countUniqueProjects, formatTokenCount } from '../lib/skill-utils'
import type { Agent, ScanReport } from '../lib/types'
import { Empty, PanelHeading } from './shared'
import { useTranslation } from 'react-i18next'

export function Overview({ report, onViewHealth, onViewMap }: { report: ScanReport, onViewHealth: () => void, onViewMap: () => void }) {
  const { t } = useTranslation()
  const errors = report.findings.filter((finding) => finding.severity === 'error').length
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length
  const tokenTotal = report.skills.reduce((total, skill) => total + skill.contextTokens, 0)
  const meterPercent = Math.min(100, Math.max(0, Math.round(tokenTotal / 650) * 10))
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

function Stat({ value, label, detail }: { value: number, label: string, detail: string }) {
  return <article className="stat"><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>
}

function ActionItem({ label, detail, tone, onClick }: { label: string, detail: string, tone: 'error' | 'warning' | 'info', onClick: () => void }) {
  return <button className="action-item" onClick={onClick}><span className={`severity ${tone}`} /><span><strong>{label}</strong><small>{detail}</small></span><b>→</b></button>
}
