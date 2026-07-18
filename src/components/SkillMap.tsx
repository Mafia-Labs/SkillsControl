import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { healthClass, healthLabelKey, projectName } from '../lib/skill-utils'
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
    const label = installation.scope === 'user' ? i18n.t('map.globalShort') : projectName(installation.projectPath ?? installation.path)
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
  const { t } = useTranslation()
  const [context, setContext] = useState<MapContext>('all')
  const activeProject = context !== 'all' && context !== 'global' ? projects.find((project) => project.path === context) ?? null : null
  const visibleSkills = skills.filter((skill) => skill.installations.some((installation) => matchesContext(installation, context)))

  return <section className="map-wrap">
    <div className="map-intro"><div><p className="eyebrow">{t('map.scopeMatrix')}</p><h2>{t('map.title')}</h2><p>{t('map.description')}</p></div><div className="legend"><span><i className="scope-dot project" />{t('common.project')}</span><span><i className="scope-dot user" />{t('common.global')}</span><span><i className="scope-dot muted" />{t('map.notInstalled')}</span></div></div>

    <div className="map-context" role="group" aria-label={t('map.folderContext')}>
      <span className="map-context-label">{t('map.viewing')}</span>
      <button className={`context-chip ${context === 'all' ? 'active' : ''}`} onClick={() => setContext('all')}>{t('map.allFolders')}</button>
      <button className={`context-chip ${context === 'global' ? 'active' : ''}`} onClick={() => setContext('global')}><i className="scope-dot user" />{t('map.globalContext')}</button>
      {projects.map((project) => <button key={project.path} className={`context-chip ${context === project.path ? 'active' : ''}`} title={project.path} onClick={() => setContext(project.path)}><i className="scope-dot project" />{project.name}</button>)}
    </div>
    {context === 'global' && <p className="context-note">{t('map.globalNote')}</p>}
    {activeProject && <p className="context-note">{t('map.projectNote', { name: activeProject.name })}</p>}

    <div className="map-table" role="grid" aria-label={t('map.skillScopeMatrix')}>
      <div className="map-row table-head" role="row"><span>{t('common.skill')}</span>{agentOrder.map((agent) => <span key={agent}>{t(`agents.${agent}`)}</span>)}<span>{t('common.health')}</span></div>
      {visibleSkills.length ? visibleSkills.map((skill) => {
        const contextInstallations = skill.installations.filter((installation) => matchesContext(installation, context))
        return <button key={skill.id} role="row" className={`map-row ${selectedId === skill.id ? 'selected' : ''}`} onClick={() => onSelect(skill.id)}>
          <span className="skill-cell"><strong>{skill.name}</strong><small>{locationSummary(skill)}</small></span>
          {agentOrder.map((agent) => <ScopeCell key={agent} installations={contextInstallations.filter((installation) => installation.agent === agent)} />)}
          <span className={`health-pill ${healthClass(skill, report.findings)}`}>{t(healthLabelKey(skill, report.findings))}</span>
        </button>
      }) : <div className="empty-row">{skills.length ? t('map.noSkillsInFolder') : t('map.noSkillsMatch')}</div>}
    </div>
  </section>
}

function ScopeCell({ installations }: { installations: Installation[] }) {
  const { t } = useTranslation()
  const projectInstallations = installations.filter((installation) => installation.scope === 'project')
  const projectCount = new Set(projectInstallations.map((installation) => installation.projectPath ?? installation.path)).size
  const user = installations.some((installation) => installation.scope === 'user')
  return <span className="scope-cell">{projectCount > 0 && <i className="scope-dot project" title={t('map.installedInProjects', { count: projectCount })} />}{user && <i className="scope-dot user" title={t('map.installedGlobally')} />}{projectCount === 0 && !user && <i className="scope-dot muted" title={t('map.notInstalled')} />}</span>
}
