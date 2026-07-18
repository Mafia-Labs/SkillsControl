import { useMemo, useState, type ChangeEvent } from 'react'
import { agentLabels } from '../lib/skill-utils'
import type { Agent, CatalogSkill, ChangePreview, Installation, InstallTarget, ProjectSummary, Scope, Skill, SkillRecommendation } from '../lib/types'
import { ProcessConsole, type ConsoleLine } from './ProcessConsole'

type ModalState =
  | { kind: 'disable', installation: Installation, preview: ChangePreview }
  | { kind: 'install', skill: CatalogSkill }
  | { kind: 'install-listed', recommendation: SkillRecommendation, projectPath: string }
  | { kind: 'localize', skill: Skill, source: Installation }

const applyScript = (modal: ModalState, paths: string[]): ConsoleLine[] => {
  if (modal.kind === 'disable') {
    const name = modal.installation.path.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] ?? 'skill'
    return [
      { id: 'cmd', text: `skillctl quarantine ${name}`, tone: 'cmd', delay: 120 },
      { id: 'backup', text: 'Creating reversible backup in the local archive', tone: 'step', delay: 620 },
      { id: 'move', text: 'Moving the copy out of the agent load path', tone: 'step', delay: 560 },
      { id: 'verify', text: 'Confirming the original location is clean', tone: 'step', delay: 540 }
    ]
  }
  if (modal.kind === 'localize') return [
    { id: 'cmd', text: `skillctl copy ${modal.skill.name} --to project`, tone: 'cmd', delay: 120 },
    { id: 'read', text: 'Reading the global skill folder', tone: 'step', delay: 620 },
    { id: 'copy', text: `Writing ${paths[0] ?? 'the local copy'}`, tone: 'step', delay: 560 },
    { id: 'hash', text: 'Re-hashing the copy · SHA-256', tone: 'step', delay: 540 }
  ]
  const listed = modal.kind === 'install-listed'
  const skillId = listed ? modal.recommendation.skillId : modal.skill.id
  return [
    { id: 'cmd', text: `skillctl install ${skillId} --verify`, tone: 'cmd', delay: 120 },
    { id: 'resolve', text: listed ? 'Resolving in the MafiaIA Skill List · pinned commit' : 'Resolving in the curated catalog', tone: 'step', delay: 520 },
    { id: 'download', text: listed ? `Downloading pinned files · ${modal.recommendation.sourceRepo}` : 'Downloading skill files', tone: 'step', delay: 480 },
    { id: 'verify', text: 'Verifying SHA-256 against the curated hash', tone: 'step', delay: 500 },
    ...paths.slice(0, 2).map((path, index) => ({ id: `write-${index}`, text: `Writing ${path}`, tone: 'step' as const, delay: 380 }))
  ]
}

export function ChangeModal({ modal, projects, applying, onCancel, onApply }: {
  modal: ModalState
  projects: ProjectSummary[]
  applying: boolean
  onCancel: () => void
  onApply: (scope?: Scope, target?: InstallTarget, projectPath?: string) => void
}) {
  const install = modal.kind === 'install'
  const listed = modal.kind === 'install-listed'
  const localize = modal.kind === 'localize'
  const compatibleAgents: Agent[] = install ? modal.skill.compatibility : listed ? ['codex', 'claude'] : localize ? [modal.source.agent] : []
  const [scope, setScope] = useState<Scope>(listed || projects.length ? 'project' : 'user')
  const [target, setTarget] = useState<InstallTarget>(compatibleAgents.length > 1 ? 'all' : compatibleAgents[0] ?? 'codex')
  const [projectPath, setProjectPath] = useState(listed ? modal.projectPath : projects[0]?.path ?? '')
  const skillId = modal.kind === 'disable' ? '' : listed ? modal.recommendation.skillId : modal.skill.id
  const effectiveScope: Scope = localize ? 'project' : scope
  const effectiveTarget: InstallTarget = localize ? modal.source.agent : target
  const installPaths = modal.kind !== 'disable' ? previewPaths(effectiveScope, effectiveTarget, skillId, projectPath) : []
  const projectRequired = modal.kind !== 'disable' && effectiveScope === 'project' && !projectPath
  const script = useMemo(() => applying ? applyScript(modal, installPaths) : null, [applying]) // eslint-disable-line react-hooks/exhaustive-deps

  if (applying && script) return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{modal.kind === 'disable' ? '⊘' : '↓'}</div>
      <p className="eyebrow">Applying change</p>
      <h2 id="change-title">{install ? `Install ${modal.skill.name}` : listed ? `Install ${modal.recommendation.skillId}` : localize ? `Install ${modal.skill.name} in a project` : modal.preview.title}</h2>
      <div className="console-modal"><ProcessConsole title="skill-control — apply" lines={script} done={false} /></div>
    </section>
  </div>

  return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{modal.kind === 'disable' ? '⊘' : '↓'}</div>
      <p className="eyebrow">Review change</p>
      <h2 id="change-title">{install ? `Install ${modal.skill.name}` : listed ? `Install ${modal.recommendation.skillId}` : localize ? `Install ${modal.skill.name} in a project` : modal.preview.title}</h2>
      {listed && <>
        <p>{modal.recommendation.description || 'Curated skill from the MafiaIA Skill List.'}</p>
        <div className="change-list">
          <strong>Verified source</strong>
          <span>• From the curated list, pinned to an exact commit of <code>{modal.recommendation.sourceRepo}</code></span>
          <span>• Content is downloaded and its SHA-256 verified before anything is written</span>
        </div>
        <label className="select-label">Scope
          <select value={scope} onChange={(event: ChangeEvent<HTMLSelectElement>) => setScope(event.target.value as Scope)}>
            {projects.length > 0 && <option value="project">Project or folder · recommended</option>}
            <option value="user">Global · every project</option>
          </select>
        </label>
        <label className="select-label">Available to
          <select value={target} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value as InstallTarget)}>
            <option value="all">All compatible agents · recommended</option>
            {compatibleAgents.map((agent) => <option value={agent} key={agent}>{agentLabels[agent]}</option>)}
          </select>
        </label>
        {scope === 'project' && <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />}
        <InstallPlan paths={installPaths} multiple={installPaths.length > 1} />
      </>}
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
      </> : modal.kind === 'disable' ? <>
        <div className="change-list"><strong>Changes</strong>{modal.preview.changes.map((change) => <span key={change}>• {change}</span>)}</div>
        <div className="warning-box"><strong>Heads up</strong>{modal.preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      </> : null}
      <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className={modal.kind === 'disable' ? 'danger-button' : 'primary-button'} disabled={projectRequired} onClick={() => onApply(effectiveScope, effectiveTarget, projectPath)}>{modal.kind === 'disable' ? 'Quarantine skill' : localize ? 'Copy to project' : listed ? 'Install verified skill' : 'Install skill'}</button></div>
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
