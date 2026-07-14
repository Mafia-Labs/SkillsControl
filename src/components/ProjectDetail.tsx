import { agentLabels, healthClass, healthLabel } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, Skill } from '../lib/types'
import { Empty } from './shared'

const localRoot = (path: string, projectPath: string) => {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.indexOf('/.claude/')
  const agentsIndex = normalized.indexOf('/.agents/')
  const cut = index >= 0 ? index : agentsIndex
  return cut >= 0 ? normalized.slice(cut + 1) : normalized.replace(`${projectPath.replace(/\\/g, '/')}/`, '')
}

export function ProjectDetail({ inventory, findings, onBack, onInspect, onQuarantine, onLocalize }: {
  inventory: ProjectInventory
  findings: Finding[]
  onBack: () => void
  onInspect: (skillId: string) => void
  onQuarantine: (installation: Installation) => void
  onLocalize: (skill: Skill, installation: Installation) => void
}) {
  const installedIds = new Set(inventory.skills.map((entry) => entry.skill.id))
  const applicableGlobals = inventory.globalSkills.filter((skill) => !installedIds.has(skill.id))

  return <section className="project-detail">
    <button className="text-button back-button" onClick={onBack}>← Proyectos</button>
    <div className="project-detail-head">
      <div>
        <p className="eyebrow">Proyecto</p>
        <h2>{inventory.name}</h2>
        <code className="project-path" title={inventory.path}>{inventory.path}</code>
      </div>
      <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{agentLabels[agent]}</span>) : <span className="agent-badge muted">Sin agente activo</span>}</div>
    </div>

    <div className="panel">
      <div className="panel-heading"><h3>Skills instaladas aquí</h3><span className="count-chip">{inventory.skills.length}</span></div>
      {inventory.skills.length ? <div className="skill-table" role="grid" aria-label="Skills instaladas en el proyecto">
        <div className="skill-table-row table-head" role="row"><span>Skill</span><span>Agente</span><span>Ruta local</span><span>Salud</span><span>Acciones</span></div>
        {inventory.skills.map((entry) => {
          const divergent = new Set(entry.skill.installations.map((installation) => installation.contentHashSha256)).size > 1
          return <div className="skill-table-row" role="row" key={entry.skill.id}>
            <span className="skill-cell"><strong>{entry.skill.name}</strong>{divergent && <small className="divergent-flag">hash divergente entre copias</small>}</span>
            <span className="agent-cell">{[...new Set(entry.installations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{agentLabels[agent]}</span>)}</span>
            <span className="path-cell">{entry.installations.map((installation) => <code key={installation.id} title={installation.path}>{localRoot(installation.path, inventory.path)}</code>)}</span>
            <span className={`health-pill ${healthClass(entry.skill, findings)}`}>{healthLabel(entry.skill, findings)}</span>
            <span className="row-actions">
              <button className="secondary-button compact" onClick={() => onInspect(entry.skill.id)}>Inspeccionar</button>
              {entry.installations.map((installation) => <button className="icon-button" key={installation.id} aria-label={`Poner en cuarentena ${entry.skill.name} (${agentLabels[installation.agent]})`} title="Poner en cuarentena esta copia" onClick={() => onQuarantine(installation)}>⊘</button>)}
            </span>
          </div>
        })}
      </div> : <Empty icon="◇" title="Este proyecto no tiene skills todavía" detail="Instala una skill local o convierte una copia global en local desde la sección de abajo." />}
    </div>

    {applicableGlobals.length > 0 && <div className="panel">
      <div className="panel-heading"><h3>Copias globales que también aplican aquí</h3><span className="count-chip">{applicableGlobals.length}</span></div>
      <p className="muted-copy">Estas skills están instaladas globalmente (<code>~/.claude/skills</code> o <code>~/.agents/skills</code>), así que los agentes también las ven al trabajar en este proyecto. Conviértelas en locales para acotarlas a esta carpeta.</p>
      <div className="global-list">{applicableGlobals.map((skill) => {
        const source = skill.installations.find((installation) => installation.scope === 'user') ?? skill.installations[0]
        return <div className="global-row" key={skill.id}>
          <span><strong>{skill.name}</strong><small>{skill.description || 'Sin descripción.'}</small></span>
          <div className="row-actions">
            <button className="secondary-button compact" onClick={() => onInspect(skill.id)}>Inspeccionar</button>
            {source && <button className="primary-button compact" onClick={() => onLocalize(skill, source)}>Convertir en local</button>}
          </div>
        </div>
      })}</div>
    </div>}
  </section>
}
