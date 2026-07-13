import { demoReport } from './demo-data'
import type { ArchiveEntry, ChangePreview, Installation, InstallTarget, ScanReport, Scope } from './types'

const isTauri = () => '__TAURI_INTERNALS__' in window

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
    changes: [`Move ${installation.path} to SkillsDock's disabled archive`],
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

export const chooseProject = async (): Promise<string | null> => {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({ directory: true, multiple: false, title: 'Add a project or workspace folder to scan' })
  return typeof selection === 'string' ? selection : null
}
