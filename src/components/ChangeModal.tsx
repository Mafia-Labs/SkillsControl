import { useState, type ChangeEvent } from 'react'
import { agentLabels } from '../lib/skill-utils'
import type { Agent, CatalogSkill, ChangePreview, Installation, InstallTarget, ProjectSummary, Scope, Skill } from '../lib/types'

type ModalState =
  | { kind: 'disable', installation: Installation, preview: ChangePreview }
  | { kind: 'install', skill: CatalogSkill }
  | { kind: 'localize', skill: Skill, source: Installation }

export function ChangeModal({ modal, projects, onCancel, onApply }: {
  modal: ModalState
  projects: ProjectSummary[]
  onCancel: () => void
  onApply: (scope?: Scope, target?: InstallTarget, projectPath?: string) => void
}) {
  const install = modal.kind === 'install'
  const localize = modal.kind === 'localize'
  const compatibleAgents = install ? modal.skill.compatibility : localize ? [modal.source.agent] : []
  const [scope, setScope] = useState<Scope>(projects.length ? 'project' : 'user')
  const [target, setTarget] = useState<InstallTarget>(compatibleAgents.length > 1 ? 'all' : compatibleAgents[0] ?? 'codex')
  const [projectPath, setProjectPath] = useState(projects[0]?.path ?? '')
  const skillId = modal.kind === 'disable' ? '' : modal.skill.id
  const effectiveScope: Scope = localize ? 'project' : scope
  const effectiveTarget: InstallTarget = localize ? modal.source.agent : target
  const installPaths = modal.kind !== 'disable' ? previewPaths(effectiveScope, effectiveTarget, skillId, projectPath) : []
  const projectRequired = modal.kind !== 'disable' && effectiveScope === 'project' && !projectPath

  return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{modal.kind === 'disable' ? '⊘' : '↓'}</div>
      <p className="eyebrow">Review change</p>
      <h2 id="change-title">{install ? `Install ${modal.skill.name}` : localize ? `Install ${modal.skill.name} in a project` : modal.preview.title}</h2>
      {install ? <>
        <p>Project scope is recommended: the skill stays available to agents working in this folder without affecting unrelated projects.</p>
        <label className="select-label">Scope
          <select value={scope} onChange={(event: ChangeEvent<HTMLSelectElement>) => setScope(event.target.value as Scope)}>
            {projects.length > 0 && <option value="project">Project or folder · recommended</option>}
            <option value="user">Global · every project</option>
          </select>
        </label>
        <label className="select-label">Available to
          <select value={target} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value as InstallTarget)}>
            {compatibleAgents.length > 1 && <option value="all">All compatible agents · recommended</option>}
            {compatibleAgents.map((agent) => <option value={agent} key={agent}>{agentLabels[agent]}</option>)}
          </select>
        </label>
        {scope === 'project' && <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />}
        <InstallPlan paths={installPaths} multiple={installPaths.length > 1} />
      </> : localize ? <>
        <p>Copy the complete skill folder into a project for the same agent. The source stays untouched so you can verify the local copy before disabling the global one.</p>
        <div className="change-list"><strong>Source</strong><span><code>{modal.source.path}</code></span><span>• Runtime: {agentLabels[modal.source.agent]}</span></div>
        <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />
        <InstallPlan paths={installPaths} multiple={false} />
      </> : <>
        <div className="change-list"><strong>Changes</strong>{modal.preview.changes.map((change) => <span key={change}>• {change}</span>)}</div>
        <div className="warning-box"><strong>Heads up</strong>{modal.preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      </>}
      <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className={modal.kind === 'disable' ? 'danger-button' : 'primary-button'} disabled={projectRequired} onClick={() => onApply(effectiveScope, effectiveTarget, projectPath)}>{modal.kind === 'disable' ? 'Quarantine skill' : localize ? 'Copy to project' : 'Install skill'}</button></div>
    </section>
  </div>
}

function ProjectSelector({ projects, value, onChange }: { projects: ProjectSummary[], value: string, onChange: (value: string) => void }) {
  return <label className="select-label">Project or folder
    <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
      {projects.map((project) => <option value={project.path} key={project.path}>{project.name} — {project.path}</option>)}
    </select>
  </label>
}

function InstallPlan({ paths, multiple }: { paths: string[], multiple: boolean }) {
  return <div className="change-list"><strong>Skill Control will</strong>{paths.map((path) => <span key={path}>• Create <code>{path}</code></span>)}<span>• Never overwrite an existing installation</span>{multiple && <span>• Roll back every new copy if one target fails</span>}</div>
}

function previewPaths(scope: Scope, target: InstallTarget, skillId: string, projectPath?: string) {
  const agents: Agent[] = target === 'all' ? ['codex', 'claude'] : [target]
  const root = scope === 'project' ? projectPath : '~'
  return agents.map((agent) => `${root}/${agent === 'codex' ? '.agents/skills' : '.claude/skills'}/${skillId}`)
}

export type { ModalState }
