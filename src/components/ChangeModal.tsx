import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import type { Agent, CatalogSkill, ChangePreview, Installation, InstallTarget, ProjectSummary, Scope, Skill, SkillRecommendation } from '../lib/types'
import { ProcessConsole, type ConsoleLine } from './ProcessConsole'

type ModalState =
  | { kind: 'disable', installations: Installation[], preview: ChangePreview }
  | { kind: 'install', skill: CatalogSkill }
  | { kind: 'install-listed', recommendation: SkillRecommendation, projectPath: string }
  | { kind: 'localize', skill: Skill, source: Installation }

const applyScript = (modal: ModalState, paths: string[]): ConsoleLine[] => {
  if (modal.kind === 'disable') {
    const name = modal.installations[0]?.path.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] ?? 'skill'
    return [
      { id: 'cmd', text: i18n.t('console.uninstallCommand', { name, count: modal.installations.length }), tone: 'cmd', delay: 120 },
      { id: 'backup', text: i18n.t('console.creatingBackup'), tone: 'step', delay: 620 },
      { id: 'move', text: i18n.t('console.movingCopy'), tone: 'step', delay: 560 },
      { id: 'verify', text: i18n.t('console.confirmingClean'), tone: 'step', delay: 540 }
    ]
  }
  if (modal.kind === 'localize') return [
    { id: 'cmd', text: i18n.t('console.copyCommand', { name: modal.skill.name }), tone: 'cmd', delay: 120 },
    { id: 'read', text: i18n.t('console.readingGlobal'), tone: 'step', delay: 620 },
    { id: 'copy', text: i18n.t('console.writingPath', { path: paths[0] ?? i18n.t('common.localCopy') }), tone: 'step', delay: 560 },
    { id: 'hash', text: i18n.t('console.rehashing'), tone: 'step', delay: 540 }
  ]
  const listed = modal.kind === 'install-listed'
  const skillId = listed ? modal.recommendation.skillId : modal.skill.id
  return [
    { id: 'cmd', text: i18n.t('console.installCommand', { skillId }), tone: 'cmd', delay: 120 },
    { id: 'resolve', text: listed ? i18n.t('console.resolvingListed') : i18n.t('console.resolvingCatalog'), tone: 'step', delay: 520 },
    { id: 'download', text: listed ? i18n.t('console.downloadingPinned', { repo: modal.recommendation.sourceRepo }) : i18n.t('console.downloadingSkill'), tone: 'step', delay: 480 },
    { id: 'verify', text: i18n.t('console.verifyingHash'), tone: 'step', delay: 500 },
    ...paths.slice(0, 2).map((path, index) => ({ id: `write-${index}`, text: i18n.t('console.writingPath', { path }), tone: 'step' as const, delay: 380 }))
  ]
}

export function ChangeModal({ modal, projects, applying, onCancel, onApply }: {
  modal: ModalState
  projects: ProjectSummary[]
  applying: boolean
  onCancel: () => void
  onApply: (scope?: Scope, target?: InstallTarget, projectPath?: string, removeGlobal?: boolean) => void
}) {
  const { t } = useTranslation()
  const install = modal.kind === 'install'
  const listed = modal.kind === 'install-listed'
  const localize = modal.kind === 'localize'
  const compatibleAgents: Agent[] = install ? modal.skill.compatibility : listed ? ['codex', 'claude'] : localize ? [modal.source.agent] : []
  const [scope, setScope] = useState<Scope>(listed || projects.length ? 'project' : 'user')
  const [target, setTarget] = useState<InstallTarget>(compatibleAgents.length > 1 ? 'all' : compatibleAgents[0] ?? 'codex')
  const [projectPath, setProjectPath] = useState(listed ? modal.projectPath : projects[0]?.path ?? '')
  const [removeGlobal, setRemoveGlobal] = useState(modal.kind === 'localize' && modal.source.scope === 'user')
  useEffect(() => {
    if (modal.kind === 'localize') setRemoveGlobal(modal.source.scope === 'user')
  }, [modal.kind, modal.kind === 'localize' ? modal.source.id : ''])
  const skillId = modal.kind === 'disable' ? '' : listed ? modal.recommendation.skillId : modal.skill.id
  const effectiveScope: Scope = localize ? 'project' : scope
  const effectiveTarget: InstallTarget = localize ? modal.source.agent : target
  const installPaths = modal.kind !== 'disable' ? previewPaths(effectiveScope, effectiveTarget, skillId, projectPath) : []
  const projectRequired = modal.kind !== 'disable' && effectiveScope === 'project' && !projectPath
  const script = useMemo(() => applying ? applyScript(modal, installPaths) : null, [applying]) // eslint-disable-line react-hooks/exhaustive-deps
  const uninstallScopeLabel = modal.kind === 'disable' ? t(modal.preview.scope === 'user' ? 'change.uninstallScopeGlobal' : 'change.uninstallScopeProject') : ''
  const title = install ? t('change.install', { name: modal.skill.name }) : listed ? t('change.install', { name: modal.recommendation.skillId }) : localize ? (removeGlobal ? t('change.moveToProject', { name: modal.skill.name }) : t('change.installInProject', { name: modal.skill.name })) : t('change.uninstallTitle', { name: modal.preview.skillName, scope: uninstallScopeLabel, count: modal.preview.count })

  if (applying && script) return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{modal.kind === 'disable' ? '⊘' : '↓'}</div>
      <p className="eyebrow">{t('change.applying')}</p>
      <h2 id="change-title">{title}</h2>
      <div className="console-modal"><ProcessConsole title={t('app.processApplyTitle')} lines={script} done={false} /></div>
    </section>
  </div>

  return <div className="modal-backdrop" role="presentation">
    <section className="change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title">
      <div className="modal-icon">{modal.kind === 'disable' ? '⊘' : '↓'}</div>
      <p className="eyebrow">{t('change.review')}</p>
      <h2 id="change-title">{title}</h2>
      {listed && <>
        <p>{modal.recommendation.description || t('change.curatedDescription')}</p>
        <div className="change-list">
          <strong>{t('change.verifiedSource')}</strong>
          <span>{t('change.pinnedCommit')} <code>{modal.recommendation.sourceRepo}</code></span>
          <span>{t('change.verifiedBeforeWrite')}</span>
        </div>
        <label className="select-label">{t('common.scope')}
          <select value={scope} onChange={(event: ChangeEvent<HTMLSelectElement>) => setScope(event.target.value as Scope)}>
            {projects.length > 0 && <option value="project">{t('common.projectOrFolderRecommended')}</option>}
            <option value="user">{t('common.globalEveryProject')}</option>
          </select>
        </label>
        <label className="select-label">{t('common.availableTo')}
          <select value={target} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value as InstallTarget)}>
            <option value="all">{t('common.allCompatibleAgentsRecommended')}</option>
            {compatibleAgents.map((agent) => <option value={agent} key={agent}>{t(`agents.${agent}`)}</option>)}
          </select>
        </label>
        {scope === 'project' && <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />}
        <InstallPlan paths={installPaths} multiple={installPaths.length > 1} />
      </>}
      {install ? <>
        <p>{t('change.projectScopeDescription')}</p>
        <label className="select-label">{t('common.scope')}
          <select value={scope} onChange={(event: ChangeEvent<HTMLSelectElement>) => setScope(event.target.value as Scope)}>
            {projects.length > 0 && <option value="project">{t('common.projectOrFolderRecommended')}</option>}
            <option value="user">{t('common.globalEveryProject')}</option>
          </select>
        </label>
        <label className="select-label">{t('common.availableTo')}
          <select value={target} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value as InstallTarget)}>
            {compatibleAgents.length > 1 && <option value="all">{t('common.allCompatibleAgentsRecommended')}</option>}
            {compatibleAgents.map((agent) => <option value={agent} key={agent}>{t(`agents.${agent}`)}</option>)}
          </select>
        </label>
        {scope === 'project' && <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />}
        <InstallPlan paths={installPaths} multiple={installPaths.length > 1} />
      </> : localize ? <>
        <p>{t(removeGlobal ? 'change.moveDescription' : 'change.copyDescription')}</p>
        <div className="change-list"><strong>{t('common.source')}</strong><span><code>{modal.source.path}</code></span><span>• {t('common.runtime')}: {t(`agents.${modal.source.agent}`)}</span></div>
        <ProjectSelector projects={projects} value={projectPath} onChange={setProjectPath} />
        <InstallPlan paths={installPaths} multiple={false} />
        {modal.source.scope === 'user' && <label className="checkbox-row" htmlFor="remove-global"><input id="remove-global" type="checkbox" checked={removeGlobal} onChange={(event: ChangeEvent<HTMLInputElement>) => setRemoveGlobal(event.target.checked)} /><span>{t('change.removeGlobalAfterCopy')}</span></label>}
      </> : modal.kind === 'disable' ? <>
        <div className="change-list"><strong>{t('common.changes')}</strong>{modal.preview.paths.map((path) => <span key={path}>• {t('change.uninstallChange', { path })}</span>)}</div>
        <div className="warning-box"><strong>{t('common.headsUp')}</strong><span>{t('change.uninstallWarning', { count: modal.preview.count })}</span></div>
      </> : null}
      <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>{t('common.cancel')}</button><button className={modal.kind === 'disable' ? 'danger-button' : 'primary-button'} disabled={projectRequired} onClick={() => onApply(effectiveScope, effectiveTarget, projectPath, removeGlobal)}>{modal.kind === 'disable' ? t('common.uninstall') : localize ? t(removeGlobal ? 'change.moveToProjectAction' : 'common.copyToProject') : listed ? t('change.installVerified') : t('change.installSkill')}</button></div>
    </section>
  </div>
}

function ProjectSelector({ projects, value, onChange }: { projects: ProjectSummary[], value: string, onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="select-label">{t('common.projectOrFolder')}
    <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
      {projects.map((project) => <option value={project.path} key={project.path}>{project.name} — {project.path}</option>)}
    </select>
  </label>
}

function InstallPlan({ paths, multiple }: { paths: string[], multiple: boolean }) {
  const { t } = useTranslation()
  return <div className="change-list"><strong>{t('common.skillControlWill')}</strong>{paths.map((path) => <span key={path}>• {t('common.create')} <code>{path}</code></span>)}<span>• {t('common.neverOverwrite')}</span>{multiple && <span>• {t('common.rollback')}</span>}</div>
}

function previewPaths(scope: Scope, target: InstallTarget, skillId: string, projectPath?: string) {
  const agents: Agent[] = target === 'all' ? ['codex', 'claude'] : [target]
  const root = scope === 'project' ? projectPath : '~'
  return agents.map((agent) => `${root}/${agent === 'codex' ? '.agents/skills' : '.claude/skills'}/${skillId}`)
}

export type { ModalState }
