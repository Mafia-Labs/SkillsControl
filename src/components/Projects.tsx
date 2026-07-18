import { agentLabels, formatTokenCount, healthClass, healthLabel } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, Skill } from '../lib/types'
import { Empty } from './shared'

const abbreviate = (path: string) => path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')

type ProjectHealth = { label: string, tone: 'error' | 'warning' | 'info' }

const aggregateHealth = (inventory: ProjectInventory, findings: Finding[]): ProjectHealth => {
  const labels = inventory.skills.map((entry) => healthLabel(entry.skill, findings))
  if (labels.includes('Needs attention')) return { label: 'Needs attention', tone: 'error' }
  if (labels.includes('Review suggested')) return { label: 'Review suggested', tone: 'warning' }
  return { label: 'Healthy', tone: 'info' }
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
  return <section className="projects">
    <div className="projects-heading">
      <div><p className="eyebrow">Your folders</p><h2>A skill lives inside a project.</h2><p>Every folder you add is scanned for local Codex and Claude Code skills. Open a project to see exactly what it has and what it is missing.</p></div>
    </div>

    <div className="workspace-roots" aria-label="Workspace folders">
      {workspaceRoots.length ? workspaceRoots.map((root) => <span className="root-chip" key={root}>
        <code title={root}>{abbreviate(root)}</code>
        <button className="root-remove" aria-label={`Remove ${root} from the workspace`} onClick={() => onRemoveFolder(root)}>×</button>
      </span>) : <span className="root-empty">No folders added yet.</span>}
      <button className="secondary-button compact" onClick={onAddFolder}>Add folder</button>
    </div>

    {isDemo && <p className="demo-hint">Demo mode: these projects are example data.</p>}

    {inventories.length ? <div className="project-grid">
      {inventories.map((inventory) => {
        const health = aggregateHealth(inventory, findings)
        const preview = inventory.skills.slice(0, 4)
        const remaining = inventory.skills.length - preview.length
        return <article className="project-card" key={inventory.path}>
          <button className="project-card-open" onClick={() => onOpen(inventory.path)} aria-label={`Open ${inventory.name}`}>
            <div className="project-card-head">
              <div><h3>{inventory.name}</h3><code className="project-path" title={inventory.path}>{abbreviate(inventory.path)}</code></div>
              {inventory.skills.length > 0 && <span className={`health-pill ${health.tone}`}>{health.label}</span>}
            </div>
            <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{agentLabels[agent]}</span>) : <span className="agent-badge muted">No active agent</span>}</div>
          </button>
          {inventory.skills.length ? <>
            <p className="project-skill-count">{inventory.skills.length} skill{inventory.skills.length === 1 ? '' : 's'} installed</p>
            <div className="skill-chips">{preview.map((entry) => <span className="skill-chip" key={entry.skill.id}>{entry.skill.name}</span>)}{remaining > 0 && <span className="skill-chip muted">+{remaining}</span>}</div>
          </> : <div className="project-empty">
            <p>This project has no skills yet.</p>
            <button className="primary-button compact" onClick={() => onOpen(inventory.path)}>Analyze and recommend <span>→</span></button>
          </div>}
        </article>
      })}
    </div> : <Empty icon="◇" title="No projects yet" detail="Add a folder that contains Codex or Claude Code skills to get started." />}

    <div className="panel global-panel" aria-label="Globally installed skills">
      <div className="panel-heading-row">
        <div className="panel-heading"><h3>Global skills</h3><span className="count-chip">{globalSkills.length}</span></div>
        {globalSkills.length > 0 && <span className="global-caution">⚠ Loaded in every project</span>}
      </div>
      <p className="muted-copy global-intro">These live in <code>~/.claude/skills</code> or <code>~/.agents/skills</code>, so every agent loads them in <em>every</em> project. Keep only skills that are genuinely universal — move the rest into the project that actually uses them, or quarantine what you no longer need.</p>
      {globalSkills.length ? <div className="global-list">{globalSkills.map((skill) => {
        const userInstallations = skill.installations.filter((installation) => installation.scope === 'user')
        const source = userInstallations[0] ?? skill.installations[0]
        return <div className="global-row" key={skill.id}>
          <span className="global-main">
            <strong>{skill.name}</strong>
            <small>{skill.description || 'No description.'}</small>
            {userInstallations.map((installation) => <code className="global-path" key={installation.id} title={installation.path}>{abbreviate(installation.path)}</code>)}
          </span>
          <span className="agent-cell">{[...new Set(userInstallations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{agentLabels[agent]}</span>)}</span>
          <span className="global-tokens" title="Approximate context cost">{formatTokenCount(skill.contextTokens)} tokens</span>
          <span className={`health-pill ${healthClass(skill, findings)}`}>{healthLabel(skill, findings)}</span>
          <div className="row-actions">
            <button className="secondary-button compact" onClick={() => onInspect(skill.id)}>Inspect</button>
            {source && <button className="secondary-button compact" title="Copy into a project folder, then quarantine the global copy" onClick={() => onLocalize(skill, source)}>Move to project</button>}
            {userInstallations.map((installation) => <button className="icon-button" key={installation.id} aria-label={`Quarantine the global copy of ${skill.name} (${agentLabels[installation.agent]})`} title="Quarantine this global copy" onClick={() => onQuarantine(installation)}>⊘</button>)}
          </div>
        </div>
      })}</div> : <p className="global-empty-copy">No skills installed globally — everything is scoped to a project. That is the recommended setup.</p>}
    </div>
  </section>
}
