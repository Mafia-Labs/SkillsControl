import { severityOrder } from '../lib/skill-utils'
import type { ArchiveEntry, ScanReport } from '../lib/types'
import { Empty } from './shared'

export function Health({ query, report, archives, onSelect, onRestore }: {
  query: string
  report: ScanReport
  archives: ArchiveEntry[]
  onSelect: (id: string) => void
  onRestore: (archive: ArchiveEntry) => void
}) {
  const findings = [...report.findings]
    .filter((finding) => `${finding.title} ${finding.detail} ${report.skills.find((skill) => skill.id === finding.skillId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
  return <section className="health-page">
    <div className="health-heading"><div><p className="eyebrow">Security check</p><h2>Fix what can affect your agents.</h2><p>These checks are deterministic and local. They never execute a skill or upload its contents.</p></div><span className="check-status">✓ Scan complete</span></div>
    <div className="health-summary"><span><i className="severity critical" />{findings.filter((finding) => finding.severity === 'critical').length} blocked</span><span><i className="severity error" />{findings.filter((finding) => finding.severity === 'error').length} urgent</span><span><i className="severity warning" />{findings.filter((finding) => finding.severity === 'warning').length} review</span><span><i className="severity info" />{findings.filter((finding) => finding.severity === 'info').length} informational</span></div>
    <div className="findings-table">{findings.length ? findings.map((finding) => <button key={finding.id} className="finding-row" onClick={() => onSelect(finding.skillId)}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><code>{report.skills.find((skill) => skill.id === finding.skillId)?.name ?? finding.skillId}</code><b>→</b></button>) : <Empty icon="✓" title="No health findings" detail="The scanned skills meet the current structural checks." />}</div>
    {archives.length > 0 && <section className="archive-section"><div className="archive-heading"><div><p className="eyebrow">Safety archive</p><h3>Disabled skills</h3></div><span>{archives.length} retained locally</span></div>{archives.map((archive) => <div className="archive-row" key={archive.id}><div><strong>{archive.skillName}</strong><code>{archive.sourcePath}</code></div><button className="secondary-button" onClick={() => onRestore(archive)}>Restore</button></div>)}</section>}
  </section>
}
