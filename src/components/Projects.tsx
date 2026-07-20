import { abbreviatePath as abbreviate, healthLabelKey } from '../lib/skill-utils'
import type { Finding, ProjectInventory } from '../lib/types'
import { Empty } from './shared'
import { useTranslation } from 'react-i18next'

type ProjectHealth = { key: string, tone: 'error' | 'warning' | 'info' }

const aggregateHealth = (inventory: ProjectInventory, findings: Finding[]): ProjectHealth => {
  const labels = inventory.skills.map((entry) => healthLabelKey(entry.skill, findings))
  if (labels.includes('health.needsAttention')) return { key: 'health.needsAttention', tone: 'error' }
  if (labels.includes('health.reviewSuggested')) return { key: 'health.reviewSuggested', tone: 'warning' }
  return { key: 'health.healthy', tone: 'info' }
}

export function Projects({ inventories, findings, workspaceRoots, isDemo, onAddFolder, onRemoveFolder, onOpen }: {
  inventories: ProjectInventory[]
  findings: Finding[]
  workspaceRoots: string[]
  isDemo: boolean
  onAddFolder: () => void
  onRemoveFolder: (root: string) => void
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  const rootInventories = inventories.filter((inventory) => !inventory.parentPath || !inventories.some((candidate) => candidate.path === inventory.parentPath))
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

    {rootInventories.length ? <div className="project-grid">
      {rootInventories.map((inventory) => {
        const health = aggregateHealth(inventory, findings)
        const preview = inventory.skills.slice(0, 4)
        const remaining = inventory.skills.length - preview.length
        const childScopes = inventories.filter((candidate) => candidate.parentPath === inventory.path)
        return <article className="project-card" key={inventory.path}>
          <button className="project-card-open" onClick={() => onOpen(inventory.path)} aria-label={t('projects.openProject', { name: inventory.name })}>
            <div className="project-card-head">
              <div><h3>{inventory.name}</h3><code className="project-path" title={inventory.path}>{abbreviate(inventory.path)}</code></div>
              {inventory.skills.length > 0 && <span className={`health-pill ${health.tone}`}>{t(health.key)}</span>}
            </div>
            <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{t(`agents.${agent}`)}</span>) : <span className="agent-badge muted">{t('projects.noActiveAgent')}</span>}</div>
            {inventory.skills.length ? <>
              <p className="project-skill-count">{t('projects.skillCount', { count: inventory.skills.length })}</p>
              <div className="skill-chips">{preview.map((entry) => <span className="skill-chip" key={entry.skill.id}>{entry.skill.name}</span>)}{remaining > 0 && <span className="skill-chip muted">+{remaining}</span>}</div>
            </> : <div className="project-empty">
              <p>{t('projects.noSkillsYet')}</p>
              <span className="primary-button compact">{t('projects.analyzeRecommend')} <span>→</span></span>
            </div>}
          </button>
          {childScopes.length > 0 && <div className="scope-tree" aria-label={t('projects.nestedScopes')}>
            <span className="scope-tree-label">{t('projects.nestedScopes')}</span>
            <div className="scope-list">{childScopes.map((child) => <button className="scope-chip" key={child.path} onClick={() => onOpen(child.path)} aria-label={t('projects.openScope', { name: child.name })}>
              <strong>{child.name}</strong><code>{child.relativePath ?? child.path}</code>
            </button>)}</div>
          </div>}
        </article>
      })}
    </div> : <Empty icon="◇" title={t('projects.noProjects')} detail={t('projects.noProjectsDetail')} />}
  </section>
}
