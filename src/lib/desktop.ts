import { demoReport } from './demo-data'
import type { ArchiveEntry, ChangePreview, Installation, ScanReport } from './types'

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
    title: `Disable ${installation.path.split('/').slice(-1)[0] ?? 'skill'}`,
    changes: [`Move ${installation.path} to Skill Control's disabled archive`],
    warnings: ['The skill will no longer be discovered by this agent. A backup is retained.']
  }
  return invoke<ChangePreview>('preview_disable', { installation })
}

export const disableSkill = async (installation: Installation): Promise<ArchiveEntry> => {
  if (!isTauri()) return { id: 'demo-archive', skillName: installation.path.split('/').slice(-1)[0] ?? 'skill', sourcePath: installation.path, archivePath: '~/.skill-control/disabled/demo', createdAt: new Date().toISOString() }
  return invoke<ArchiveEntry>('disable_skill', { installation })
}

export const restoreSkill = async (archive: ArchiveEntry): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('restore_skill', { archive })
}

export const listArchives = async (): Promise<ArchiveEntry[]> => {
  if (!isTauri()) return []
  return invoke<ArchiveEntry[]>('list_archives')
}

export const installCatalogSkill = async (skillId: string, target: string, projectPath?: string): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('install_catalog_skill', { skillId, target, projectPath })
}

export const chooseProject = async (): Promise<string | null> => {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({ directory: true, multiple: false, title: 'Add a project to scan' })
  return typeof selection === 'string' ? selection : null
}
