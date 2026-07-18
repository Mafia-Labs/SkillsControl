import { useState } from 'react'
import { agentLabels, healthClass, healthLabel, projectName } from '../lib/skill-utils'
import type { Agent, Installation, ProjectSummary, ScanReport, Skill } from '../lib/types'

const agentOrder: Agent[] = ['codex', 'claude']

type MapContext = 'all' | 'global' | string

const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '')

const matchesContext = (installation: Installation, context: MapContext) => {
  if (context === 'all') return true
  if (context === 'global') return installation.scope === 'user'
  // A project context shows what agents actually see there: local copies plus global installs.
  if (installation.scope === 'user') return true
  const root = normalize(context)
  const owner = installation.projectPath ? normalize(installation.projectPath) : normalize(installation.path)
  return owner === root || owner.startsWith(`${root}/`)
}

const locationSummary = (skill: Skill) => {
  const parts: string[] = []
  for (const installation of skill.installations) {
    const label = installation.scope === 'user' ? '~ global' : projectName(installation.projectPath ?? installation.path)
    if (!parts.includes(label)) parts.push(label)
  }
  const shown = parts.slice(0, 3)
  return shown.join(' · ') + (parts.length > shown.length ? ` · +${parts.length - shown.length}` : '')
}

export function SkillMap({ skills, report, projects, selectedId, onSelect }: {
  skills: Skill[]
  report: ScanReport
  projects: ProjectSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [context, setContext] = useState<MapContext>('all')
  const activeProject = context !== 'all' && context !== 'global' ? projects.find((project) => project.path === context) ?? null : null
  const visibleSkills = skills.filter((skill) => skill.installations.some((installation) => matchesContext(installation, context)))

  return <section className="map-wrap">
    <div className="map-intro"><div><p className="eyebrow">Scope matrix</p><h2>Where every skill is active.</h2><p>Local copies limit a skill to the repository or folder that needs it. Same-name copies can coexist or resolve differently by agent, so Skill Control shows every physical installation instead of assuming one universal precedence rule.</p></div><div className="legend"><span><i className="scope-dot project" />Project</span><span><i className="scope-dot user" />Global</span><span><i className="scope-dot muted" />Not installed</span></div></div>

    <div className="map-context" role="group" aria-label="Folder context">
      <span className="map-context-label">Viewing</span>
      <button className={`context-chip ${context === 'all' ? 'active' : ''}`} onClick={() => setContext('all')}>All folders</button>
      <button className={`context-chip ${context === 'global' ? 'active' : ''}`} onClick={() => setContext('global')}><i className="scope-dot user" />Global · ~</button>
      {projects.map((project) => <button key={project.path} className={`context-chip ${context === project.path ? 'active' : ''}`} title={project.path} onClick={() => setContext(project.path)}><i className="scope-dot project" />{project.name}</button>)}
    </div>
    {context === 'global' && <p className="context-note">Skills installed in the global scopes (<code>~/.claude/skills</code>, <code>~/.agents/skills</code>). These apply to every project on this machine.</p>}
    {activeProject && <p className="context-note">Everything an agent sees while working in <strong>{activeProject.name}</strong> — local copies in this folder plus the global installs that also apply.</p>}

    <div className="map-table" role="grid" aria-label="Skill scope matrix">
      <div className="map-row table-head" role="row"><span>Skill</span>{agentOrder.map((agent) => <span key={agent}>{agentLabels[agent]}</span>)}<span>Health</span></div>
      {visibleSkills.length ? visibleSkills.map((skill) => {
        const contextInstallations = skill.installations.filter((installation) => matchesContext(installation, context))
        return <button key={skill.id} role="row" className={`map-row ${selectedId === skill.id ? 'selected' : ''}`} onClick={() => onSelect(skill.id)}>
          <span className="skill-cell"><strong>{skill.name}</strong><small>{locationSummary(skill)}</small></span>
          {agentOrder.map((agent) => <ScopeCell key={agent} installations={contextInstallations.filter((installation) => installation.agent === agent)} />)}
          <span className={`health-pill ${healthClass(skill, report.findings)}`}>{healthLabel(skill, report.findings)}</span>
        </button>
      }) : <div className="empty-row">{skills.length ? 'No skills are installed in this folder yet.' : 'No skills match this search.'}</div>}
    </div>
  </section>
}

function ScopeCell({ installations }: { installations: Installation[] }) {
  const projectInstallations = installations.filter((installation) => installation.scope === 'project')
  const projectCount = new Set(projectInstallations.map((installation) => installation.projectPath ?? installation.path)).size
  const user = installations.some((installation) => installation.scope === 'user')
  return <span className="scope-cell">{projectCount > 0 && <i className="scope-dot project" title={`Installed in ${projectCount} project scope${projectCount === 1 ? '' : 's'}`} />}{user && <i className="scope-dot user" title="Installed globally" />}{projectCount === 0 && !user && <i className="scope-dot muted" title="Not installed" />}</span>
}
