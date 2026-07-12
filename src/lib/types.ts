export type Scope = 'user' | 'project'
export type Agent = 'codex' | 'claude'
export type InstallTarget = Agent | 'all'
export type Severity = 'info' | 'warning' | 'error'

export type Installation = {
  id: string
  path: string
  scope: Scope
  agent: Agent
  projectPath?: string
  enabled: boolean
  modified: boolean
  sourceHash: string
}

export type Finding = {
  id: string
  skillId: string
  severity: Severity
  title: string
  detail: string
}

export type Skill = {
  id: string
  name: string
  description: string
  version?: string
  source?: string
  installations: Installation[]
  files: string[]
  executableScripts: string[]
  contextTokens: number
  sourceHash: string
}

export type ProjectSummary = {
  path: string
  name: string
  agents: Agent[]
}

export type ScanReport = {
  skills: Skill[]
  findings: Finding[]
  scannedPaths: string[]
  projects: ProjectSummary[]
  agents: Agent[]
  scannedAt: string
}

export type ChangePreview = {
  title: string
  changes: string[]
  warnings: string[]
}

export type ArchiveEntry = {
  id: string
  skillName: string
  sourcePath: string
  archivePath: string
  createdAt: string
}

export type CatalogSkill = {
  id: string
  name: string
  description: string
  category: string
  risk: 'Reviewed' | 'Contains scripts' | 'External dependencies'
  compatibility: Agent[]
  contextTokens: number
  source: string
}
