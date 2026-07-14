export type Scope = 'user' | 'project'
export type Agent = 'codex' | 'claude'
export type InstallTarget = Agent | 'all'
export type Severity = 'info' | 'warning' | 'error' | 'critical'
export type SecurityStatus = 'Reviewed' | 'Low risk' | 'Review required' | 'Blocked' | 'Unknown' | 'Stale'
export type Capability = 'Read project files' | 'Execute shell commands' | 'Access network' | 'Access credentials' | 'Write outside project' | 'Hooks or MCP' | 'Binary content' | 'External content'

export type SkillProvenance = {
  sourceUrl?: string
  sourceOwner?: string
  sourceRepository?: string
  sourceCommit?: string
  sourceRef?: string
  sourceSkillPath?: string
  contentHashSha256: string
  installedAt: string
  reviewedHash?: string
  reviewedAt?: string
  license?: string
}

export type Installation = {
  id: string
  path: string
  scope: Scope
  agent: Agent
  projectPath?: string
  enabled: boolean
  modified: boolean
  contentHashSha256: string
}

export type Finding = {
  id: string
  skillId: string
  severity: Severity
  title: string
  detail: string
}

export type ExternalAudit = {
  provider: string
  status: string
  summary?: string
  auditedAt?: string
  riskLevel?: string
}

export type ExternalReputation = {
  source: string
  skillName: string
  skillUrl: string
  localHash: string
  auditedHash?: string
  hashMatches: boolean
  installs?: number
  stars?: number
  audits: ExternalAudit[]
  verdict: string
  checkedAt: string
}

export type Skill = {
  id: string
  name: string
  description: string
  version?: string
  source?: string
  provenance: SkillProvenance
  externalReputation?: ExternalReputation
  installations: Installation[]
  files: string[]
  executableScripts: string[]
  invokedScripts: string[]
  capabilities: Capability[]
  securityStatus: SecurityStatus
  contextTokens: number
  contentHashSha256: string
}

export type ProjectSummary = {
  path: string
  name: string
  agents: Agent[]
}

export type ProjectSkillEntry = {
  skill: Skill
  installations: Installation[]
}

export type ProjectInventory = {
  path: string
  name: string
  agents: Agent[]
  skills: ProjectSkillEntry[]
  globalSkills: Skill[]
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
