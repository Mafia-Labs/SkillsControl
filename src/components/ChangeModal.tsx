import { useState } from 'react'
import type { CatalogSkill, ChangePreview, Installation } from '../lib/types'

type ModalState = { kind: 'disable', installation: Installation, preview: ChangePreview } | { kind: 'install', skill: CatalogSkill }

export function ChangeModal({ modal, projects, onCancel, onApply }: { modal: ModalState, projects: string[], onCancel: () => void, onApply: (target?: string, projectPath?: string) => void }) {
  const [target, setTarget] = useState('agents')
  const [projectPath, setProjectPath] = useState(projects[0] ?? '')
  const install = modal.kind === 'install'
  const installPath = install ? previewPath(target, modal.skill.id, projectPath) : null
  return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{install ? '↓' : '⊘'}</div>
      <p className="eyebrow">Review change</p>
      <h2 id="change-title">{install ? `Install ${modal.skill.name}` : modal.preview.title}</h2>
      {install ? <>
        <p>Choose the scope where this curated skill should be available.</p>
        <label className="select-label">Install location
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="agents">Global · Agent Skills</option><option value="codex">Global · Codex</option><option value="claude">Global · Claude</option>
            {projects.length > 0 && <option value="project">Project · .agents/skills</option>}
          </select>
        </label>
        {target === 'project' && <label className="select-label">Project
          <select value={projectPath} onChange={(event) => setProjectPath(event.target.value)}>{projects.map((project) => <option value={project} key={project}>{project.split('/').slice(-1)[0]}</option>)}</select>
        </label>}
        <div className="change-list"><strong>Skill Control will</strong><span>• Create <code>{installPath}/SKILL.md</code></span><span>• Never overwrite an existing installation</span></div>
      </> : <>
        <div className="change-list"><strong>Changes</strong>{modal.preview.changes.map((change) => <span key={change}>• {change}</span>)}</div>
        <div className="warning-box"><strong>Heads up</strong>{modal.preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      </>}
      <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className={install ? 'primary-button' : 'danger-button'} onClick={() => onApply(target, projectPath)}>{install ? 'Install skill' : 'Disable skill'}</button></div>
    </section>
  </div>
}

function previewPath(target: string, skillId: string, projectPath?: string) {
  if (target === 'project') return `${projectPath}/.agents/skills/${skillId}`
  return `~/.${target}/skills/${skillId}`
}

export type { ModalState }
