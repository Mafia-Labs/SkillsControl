import { agentLabels, healthClass, healthLabel } from '../lib/skill-utils'
import type { Agent, Installation, ScanReport, Skill } from '../lib/types'

const agentOrder: Agent[] = ['codex', 'claude']

export function SkillMap({ skills, report, selectedId, onSelect }: { skills: Skill[], report: ScanReport, selectedId: string | null, onSelect: (id: string) => void }) {
  return <section className="map-wrap">
    <div className="map-intro"><div><p className="eyebrow">Scope matrix</p><h2>Where every skill is active.</h2><p>Local copies limit a skill to the repository or folder that needs it. Same-name copies can coexist or resolve differently by agent, so Skill Control shows every physical installation instead of assuming one universal precedence rule.</p></div><div className="legend"><span><i className="scope-dot project" />Project</span><span><i className="scope-dot user" />Global</span><span><i className="scope-dot muted" />Not installed</span></div></div>
    <div className="map-table" role="grid" aria-label="Skill scope matrix">
      <div className="map-row table-head" role="row"><span>Skill</span>{agentOrder.map((agent) => <span key={agent}>{agentLabels[agent]}</span>)}<span>Health</span></div>
      {skills.length ? skills.map((skill) => <button key={skill.id} role="row" className={`map-row ${selectedId === skill.id ? 'selected' : ''}`} onClick={() => onSelect(skill.id)}>
        <span className="skill-cell"><strong>{skill.name}</strong><small>{skill.installations.length} location{skill.installations.length === 1 ? '' : 's'}</small></span>
        {agentOrder.map((agent) => <ScopeCell key={agent} installations={skill.installations.filter((installation) => installation.agent === agent)} />)}
        <span className={`health-pill ${healthClass(skill, report.findings)}`}>{healthLabel(skill, report.findings)}</span>
      </button>) : <div className="empty-row">No skills match this search.</div>}
    </div>
  </section>
}

function ScopeCell({ installations }: { installations: Installation[] }) {
  const projectInstallations = installations.filter((installation) => installation.scope === 'project')
  const projectCount = new Set(projectInstallations.map((installation) => installation.projectPath ?? installation.path)).size
  const user = installations.some((installation) => installation.scope === 'user')
  return <span className="scope-cell">{projectCount > 0 && <i className="scope-dot project" title={`Installed in ${projectCount} project scope${projectCount === 1 ? '' : 's'}`} />}{user && <i className="scope-dot user" title="Installed globally" />}{projectCount === 0 && !user && <i className="scope-dot muted" title="Not installed" />}</span>
}
