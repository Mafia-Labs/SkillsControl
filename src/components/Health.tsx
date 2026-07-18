import { severityOrder } from '../lib/skill-utils'
import type { ArchiveEntry, ScanReport } from '../lib/types'
import { Empty } from './shared'
import { useTranslation } from 'react-i18next'

export function Health({ query, report, archives, onSelect, onRestore }: {
  query: string
  report: ScanReport
  archives: ArchiveEntry[]
  onSelect: (id: string) => void
  onRestore: (archive: ArchiveEntry) => void
}) {
  const { t } = useTranslation()
  const findings = [...report.findings]
    .filter((finding) => `${finding.title} ${finding.detail} ${report.skills.find((skill) => skill.id === finding.skillId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
  return <section className="health-page">
    <div className="health-heading"><div><p className="eyebrow">{t('healthPage.securityCheck')}</p><h2>{t('healthPage.title')}</h2><p>{t('healthPage.description')}</p></div><span className="check-status">{t('healthPage.scanComplete')}</span></div>
    <div className="health-summary"><span><i className="severity critical" />{t('healthPage.blocked', { count: findings.filter((finding) => finding.severity === 'critical').length })}</span><span><i className="severity error" />{t('healthPage.urgent', { count: findings.filter((finding) => finding.severity === 'error').length })}</span><span><i className="severity warning" />{t('healthPage.review', { count: findings.filter((finding) => finding.severity === 'warning').length })}</span><span><i className="severity info" />{t('healthPage.informational', { count: findings.filter((finding) => finding.severity === 'info').length })}</span></div>
    <div className="findings-table">{findings.length ? findings.map((finding) => <button key={finding.id} className="finding-row" onClick={() => onSelect(finding.skillId)}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><code>{report.skills.find((skill) => skill.id === finding.skillId)?.name ?? finding.skillId}</code><b>→</b></button>) : <Empty icon="✓" title={t('healthPage.noFindings')} detail={t('healthPage.noFindingsDetail')} />}</div>
    {archives.length > 0 && <section className="archive-section"><div className="archive-heading"><div><p className="eyebrow">{t('healthPage.safetyArchive')}</p><h3>{t('healthPage.disabledSkills')}</h3></div><span>{t('healthPage.retainedLocally', { count: archives.length })}</span></div>{archives.map((archive) => <div className="archive-row" key={archive.id}><div><strong>{archive.skillName}</strong><code>{archive.sourcePath}</code></div><button className="secondary-button" onClick={() => onRestore(archive)}>{t('common.restore')}</button></div>)}</section>}
  </section>
}
