import { formatTokenCount, healthClass, healthLabelKey } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, Skill } from '../lib/types'
import { Empty } from './shared'
import { useTranslation } from 'react-i18next'

const abbreviate = (path: string) => path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')

type ProjectHealth = { key: string, tone: 'error' | 'warning' | 'info' }

const aggregateHealth = (inventory: ProjectInventory, findings: Finding[]): ProjectHealth => {
  const labels = inventory.skills.map((entry) => healthLabelKey(entry.skill, findings))
  if (labels.includes('health.needsAttention')) return { key: 'health.needsAttention', tone: 'error' }
  if (labels.includes('health.reviewSuggested')) return { key: 'health.reviewSuggested', tone: 'warning' }
  return { key: 'health.healthy', tone: 'info' }
}

export function Projects({ inventories, findings, globalSkills, workspaceRoots, isDemo, onAddFolder, onRemoveFolder, onOpen, onInspect, onLocalize, onQuarantine }: {
  inventories: ProjectInventory[]
  findings: Finding[]
  globalSkills: Skill[]
  workspaceRoots: string[]
  isDemo: boolean
  onAddFolder: () => void
  onRemoveFolder: (root: string) => void
  onOpen: (path: string) => void
  onInspect: (skillId: string) => void
  onLocalize: (skill: Skill, installation: Installation) => void
  onQuarantine: (installation: Installation) => void
}) {
  const { t } = useTranslation()
  return <section className="projects">
    <div className="projects-heading">
      <div><p className="eyebrow">{t('projects.yourFolders')}</p><h2>{t('projects.title')}</h2><p>{t('projects.description')}</p></div>
    </div>

    <div className="workspace-roots" aria-label={t('projects.workspaceFolders')}>
      {workspaceRoots.length ? workspaceRoots.map((root) => <span className="root-chip" key={root}>
        <code title={root}>{abbreviate(root)}</code>
        <button className="root-remove" aria-label={t('projects.removeFromWorkspace', { root })} onClick={() => onRemoveFolder(root)}>×</button>
      </span>) : <span className="root-empty">{t('projects.noFolders')}</span>}
      <button className="secondary-button compact" onClick={onAddFolder}>{t('common.addFolder')}</button>
    </div>

    {isDemo && <p className="demo-hint">{t('projects.demoHint')}</p>}

    {inventories.length ? <div className="project-grid">
      {inventories.map((inventory) => {
        const health = aggregateHealth(inventory, findings)
        const preview = inventory.skills.slice(0, 4)
        const remaining = inventory.skills.length - preview.length
        return <article className="project-card" key={inventory.path}>
          <button className="project-card-open" onClick={() => onOpen(inventory.path)} aria-label={t('projects.openProject', { name: inventory.name })}>
            <div className="project-card-head">
              <div><h3>{inventory.name}</h3><code className="project-path" title={inventory.path}>{abbreviate(inventory.path)}</code></div>
              {inventory.skills.length > 0 && <span className={`health-pill ${health.tone}`}>{t(health.key)}</span>}
            </div>
            <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{t(`agents.${agent}`)}</span>) : <span className="agent-badge muted">{t('projects.noActiveAgent')}</span>}</div>
          </button>
          {inventory.skills.length ? <>
            <p className="project-skill-count">{t('projects.skillCount', { count: inventory.skills.length })}</p>
            <div className="skill-chips">{preview.map((entry) => <span className="skill-chip" key={entry.skill.id}>{entry.skill.name}</span>)}{remaining > 0 && <span className="skill-chip muted">+{remaining}</span>}</div>
          </> : <div className="project-empty">
            <p>{t('projects.noSkillsYet')}</p>
            <button className="primary-button compact" onClick={() => onOpen(inventory.path)}>{t('projects.analyzeRecommend')} <span>→</span></button>
          </div>}
        </article>
      })}
    </div> : <Empty icon="◇" title={t('projects.noProjects')} detail={t('projects.noProjectsDetail')} />}

    <div className="panel global-panel" aria-label={t('projects.globallyInstalledSkills')}>
      <div className="panel-heading-row">
        <div className="panel-heading"><h3>{t('projects.globalSkills')}</h3><span className="count-chip">{globalSkills.length}</span></div>
        {globalSkills.length > 0 && <span className="global-caution">⚠ {t('projects.globalCaution')}</span>}
      </div>
      <p className="muted-copy global-intro">{t('projects.globalIntro')}</p>
      {globalSkills.length ? <div className="global-list">{globalSkills.map((skill) => {
        const userInstallations = skill.installations.filter((installation) => installation.scope === 'user')
        const source = userInstallations[0] ?? skill.installations[0]
        return <div className="global-row" key={skill.id}>
          <span className="global-main">
            <strong>{skill.name}</strong>
            <small>{skill.description || t('common.noDescription')}</small>
            {userInstallations.map((installation) => <code className="global-path" key={installation.id} title={installation.path}>{abbreviate(installation.path)}</code>)}
          </span>
          <span className="agent-cell">{[...new Set(userInstallations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{t(`agents.${agent}`)}</span>)}</span>
          <span className="global-tokens" title={t('projects.approximateContextCost')}>{formatTokenCount(skill.contextTokens)} {t('common.tokens')}</span>
          <span className={`health-pill ${healthClass(skill, findings)}`}>{t(healthLabelKey(skill, findings))}</span>
          <div className="row-actions">
            <button className="secondary-button compact" onClick={() => onInspect(skill.id)}>{t('common.inspect')}</button>
            {source && <button className="secondary-button compact" title={t('projects.moveToProjectTitle')} onClick={() => onLocalize(skill, source)}>{t('common.moveToProject')}</button>}
            {userInstallations.map((installation) => <button className="icon-button" key={installation.id} aria-label={t('projects.quarantineGlobalAria', { name: skill.name, agent: t(`agents.${installation.agent}`) })} title={t('projects.quarantineGlobalTitle')} onClick={() => onQuarantine(installation)}>⊘</button>)}
          </div>
        </div>
      })}</div> : <p className="global-empty-copy">{t('projects.noGlobalSkills')}</p>}
    </div>
  </section>
}
