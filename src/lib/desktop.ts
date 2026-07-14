import { demoReport, demoStackDetection } from './demo-data'
import type { ArchiveEntry, ChangePreview, ExternalReputation, Installation, InstallTarget, ScanReport, Scope, Skill, StackDetection } from './types'

const isTauri = () => '__TAURI_INTERNALS__' in window

export const isDemoMode = () => !isTauri()

const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(command, args)
}

export const scanSkills = async (projects: string[]): Promise<ScanReport> => {
  if (!isTauri()) return demoReport
  return invoke<ScanReport>('scan_skills', { projects })
}

export const previewDisable = async (installation: Installation): Promise<ChangePreview> => {
  if (!isTauri()) return {
    title: `Disable ${installation.path.replace(/\\/g, '/').split('/').slice(-1)[0] ?? 'skill'}`,
    changes: [`Move ${installation.path} to Skill Control's disabled archive`],
    warnings: ['Only this exact installation is removed. A reversible backup is retained.']
  }
  return invoke<ChangePreview>('preview_disable', { installation })
}

export const disableSkill = async (installation: Installation): Promise<ArchiveEntry> => {
  if (!isTauri()) return { id: 'demo-archive', skillName: installation.path.replace(/\\/g, '/').split('/').slice(-1)[0] ?? 'skill', sourcePath: installation.path, archivePath: '~/.skill-control/disabled/demo', createdAt: new Date().toISOString() }
  return invoke<ArchiveEntry>('disable_skill', { installation })
}

export const quarantineSkill = async (installation: Installation): Promise<ArchiveEntry> => {
  if (!isTauri()) return disableSkill(installation)
  return invoke<ArchiveEntry>('quarantine_skill', { installation })
}

export const trustSkillVersion = async (installation: Installation): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('trust_skill_version', { installation })
}

export const restoreSkill = async (archive: ArchiveEntry): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('restore_skill', { archiveId: archive.id })
}

export const listArchives = async (): Promise<ArchiveEntry[]> => {
  if (!isTauri()) return []
  return invoke<ArchiveEntry[]>('list_archives')
}

export const copySkillToProject = async (installation: Installation, projectPath: string): Promise<string> => {
  if (!isTauri()) return `${projectPath}/${installation.agent === 'codex' ? '.agents/skills' : '.claude/skills'}/${installation.path.replace(/\\/g, '/').split('/').slice(-1)[0]}`
  return invoke<string>('copy_skill_to_project', { installation, projectPath })
}

export const installCatalogSkill = async (skillId: string, scope: Scope, target: InstallTarget, projectPath?: string): Promise<string[]> => {
  if (!isTauri()) return []
  return invoke<string[]>('install_catalog_skill', { skillId, scope, target, projectPath })
}

export const checkOnlineReputation = async (skill: Skill): Promise<ExternalReputation> => {
  if (!isTauri()) throw new Error('Online reputation checks are available in the desktop build.')
  const sourceRepository = skill.provenance.sourceRepository
  if (!sourceRepository) throw new Error('This skill has no repository provenance to check online.')
  return invoke<ExternalReputation>('check_online_reputation', {
    sourceRepository,
    skillName: skill.name,
    localHash: skill.contentHashSha256,
  })
}

export const detectStack = async (projectPath: string, installedSkills: string[]): Promise<StackDetection> => {
  if (!isTauri()) return demoStackDetection()
  return invoke<StackDetection>('detect_stack', { projectPath, installedSkills })
}

// Returns null in demo (non-Tauri) mode so the caller keeps using localStorage.
export const getWorkspaceRoots = async (): Promise<string[] | null> => {
  if (!isTauri()) return null
  return invoke<string[]>('get_workspace_roots')
}

export const saveWorkspaceRoots = async (roots: string[]): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('set_workspace_roots', { roots })
}

export const chooseProjects = async (): Promise<string[]> => {
  if (!isTauri()) return []
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({ directory: true, multiple: true, title: 'Add project or workspace folders to scan' })
  if (typeof selection === 'string') return [selection]
  return selection ?? []
}
