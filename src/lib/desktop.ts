import { demoReport } from './demo-data'
import type { ChangePreview, Installation, ScanReport } from './types'

const isTauri = () => '__TAURI_INTERNALS__' in window

const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(command, args)
}

export const scanSkills = async (): Promise<ScanReport> => {
  if (!isTauri()) return demoReport
  return invoke<ScanReport>('scan_skills', { projects: [] })
}

export const previewDisable = async (installation: Installation): Promise<ChangePreview> => {
  if (!isTauri()) return {
    title: `Disable ${installation.path.split('/').slice(-1)[0] ?? 'skill'}`,
    changes: [`Move ${installation.path} to Skill Control's disabled archive`],
    warnings: ['The skill will no longer be discovered by this agent. A backup is retained.']
  }
  return invoke<ChangePreview>('preview_disable', { installation })
}

export const disableSkill = async (installation: Installation): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('disable_skill', { installation })
}

export const installCatalogSkill = async (skillId: string, target: string): Promise<void> => {
  if (!isTauri()) return
  return invoke<void>('install_catalog_skill', { skillId, target })
}
