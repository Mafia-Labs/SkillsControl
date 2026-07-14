import { agentLabels, healthLabel } from '../lib/skill-utils'
import type { Finding, ProjectInventory } from '../lib/types'
import { Empty } from './shared'

const abbreviate = (path: string) => path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')

type ProjectHealth = { label: string, tone: 'error' | 'warning' | 'info' }

const aggregateHealth = (inventory: ProjectInventory, findings: Finding[]): ProjectHealth => {
  const labels = inventory.skills.map((entry) => healthLabel(entry.skill, findings))
  if (labels.includes('Needs attention')) return { label: 'Requiere atención', tone: 'error' }
  if (labels.includes('Review suggested')) return { label: 'Revisión sugerida', tone: 'warning' }
  return { label: 'Saludable', tone: 'info' }
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
  return <section className="projects">
    <div className="projects-heading">
      <div><p className="eyebrow">Tus carpetas</p><h2>Un skill vive dentro de un proyecto.</h2><p>Cada carpeta añadida se escanea en busca de skills locales de Codex y Claude Code. Abre un proyecto para ver exactamente qué tiene y qué le falta.</p></div>
    </div>

    <div className="workspace-roots" aria-label="Carpetas del workspace">
      {workspaceRoots.length ? workspaceRoots.map((root) => <span className="root-chip" key={root}>
        <code title={root}>{abbreviate(root)}</code>
        <button className="root-remove" aria-label={`Quitar ${root} del workspace`} onClick={() => onRemoveFolder(root)}>×</button>
      </span>) : <span className="root-empty">No hay carpetas añadidas todavía.</span>}
      <button className="secondary-button compact" onClick={onAddFolder}>Añadir carpeta</button>
    </div>

    {isDemo && <p className="demo-hint">Modo demostración: estos proyectos son datos de ejemplo.</p>}

    {inventories.length ? <div className="project-grid">
      {inventories.map((inventory) => {
        const health = aggregateHealth(inventory, findings)
        const preview = inventory.skills.slice(0, 4)
        const remaining = inventory.skills.length - preview.length
        return <article className="project-card" key={inventory.path}>
          <button className="project-card-open" onClick={() => onOpen(inventory.path)} aria-label={`Abrir ${inventory.name}`}>
            <div className="project-card-head">
              <div><h3>{inventory.name}</h3><code className="project-path" title={inventory.path}>{abbreviate(inventory.path)}</code></div>
              {inventory.skills.length > 0 && <span className={`health-pill ${health.tone}`}>{health.label}</span>}
            </div>
            <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{agentLabels[agent]}</span>) : <span className="agent-badge muted">Sin agente activo</span>}</div>
          </button>
          {inventory.skills.length ? <>
            <p className="project-skill-count">{inventory.skills.length} skill{inventory.skills.length === 1 ? '' : 's'} instalada{inventory.skills.length === 1 ? '' : 's'}</p>
            <div className="skill-chips">{preview.map((entry) => <span className="skill-chip" key={entry.skill.id}>{entry.skill.name}</span>)}{remaining > 0 && <span className="skill-chip muted">+{remaining}</span>}</div>
          </> : <div className="project-empty">
            <p>Este proyecto no tiene skills todavía.</p>
            <button className="primary-button compact" onClick={() => onOpen(inventory.path)}>Analizar y recomendar <span>→</span></button>
          </div>}
        </article>
      })}
    </div> : <Empty icon="◇" title="Aún no hay proyectos" detail="Añade una carpeta con skills de Codex o Claude Code para empezar." />}
  </section>
}
