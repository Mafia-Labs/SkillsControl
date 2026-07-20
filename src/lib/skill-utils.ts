import type { Agent, Finding, Installation, ProjectInventory, ProjectSummary, ScanReport, Skill } from './types'

export const agentLabels: Record<Agent, string> = {
  codex: 'Codex / Agent Skills',
  claude: 'Claude Code'
}

export const getSkillHealth = (skill: Skill, findings: Finding[]) =>
  findings.filter((finding) => finding.skillId === skill.id)

export const healthLabel = (skill: Skill, findings: Finding[]) => {
  const health = getSkillHealth(skill, findings)
  if (health.some((finding) => finding.severity === 'error')) return 'Needs attention'
  if (health.some((finding) => finding.severity === 'warning')) return 'Review suggested'
  return 'Healthy'
}

export const healthLabelKey = (skill: Skill, findings: Finding[]) => {
  const health = getSkillHealth(skill, findings)
  if (health.some((finding) => finding.severity === 'error')) return 'health.needsAttention'
  if (health.some((finding) => finding.severity === 'warning')) return 'health.reviewSuggested'
  return 'health.healthy'
}

export const securityStatusClass = (status: Skill['securityStatus']) =>
  status.replace(/\s+/g, '-').toLowerCase()

export const healthClass = (skill: Skill, findings: Finding[]) =>
  healthLabel(skill, findings).replace(/\s+/g, '-').toLowerCase()

export const countUniqueProjects = (report: ScanReport) => report.projects.length

export const abbreviatePath = (path: string) => path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')

export const projectName = (path?: string) => {
  if (!path) return 'Project'
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '')
  return normalized.split('/').slice(-1)[0] || normalized
}

export const countDuplicates = (report: ScanReport) =>
  report.skills.filter((skill) => {
    const divergent = new Set(skill.installations.map((installation) => installation.contentHashSha256)).size > 1
    const override = (['codex', 'claude'] as Agent[]).some((agent) => {
      const installs = skill.installations.filter((installation) => installation.agent === agent)
      return installs.some((installation) => installation.scope === 'user') && installs.some((installation) => installation.scope === 'project')
    })
    return divergent || override
  }).length

const normalizeProjectPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')

const agentsFromInstallations = (installations: Installation[]): Agent[] =>
  [...new Set(installations.map((installation) => installation.agent))].sort()

// The scanner is skill-centric; this regroups the same physical installations by
// the project that owns them so the UI can answer "what does this project have?".
// Global (user-scope) copies are attached to every project because an agent
// working inside a project can also resolve them.
export const groupInstallationsByProject = (report: ScanReport): ProjectInventory[] => {
  const byPath = new Map<string, ProjectInventory>()
  const summaries = new Map(report.projects.map((project) => [normalizeProjectPath(project.path), project]))
  const ensure = (path: string, name: string, agents: Agent[], summary?: ProjectSummary): ProjectInventory => {
    const key = normalizeProjectPath(path)
    const existing = byPath.get(key)
    if (existing) {
      existing.agents = [...new Set([...existing.agents, ...agents])].sort()
      if (summary) {
        existing.parentPath = summary.parentPath
        existing.relativePath = summary.relativePath
        existing.kind = summary.kind
      }
      return existing
    }
    const inventory: ProjectInventory = {
      path,
      name,
      agents: [...agents].sort(),
      parentPath: summary?.parentPath,
      relativePath: summary?.relativePath,
      kind: summary?.kind,
      skills: [],
      globalSkills: []
    }
    byPath.set(key, inventory)
    return inventory
  }

  for (const project of report.projects) ensure(project.path, project.name, project.agents, project)

  const globalSkills: Skill[] = []
  for (const skill of report.skills) {
    if (skill.installations.some((installation) => installation.scope === 'user')) globalSkills.push(skill)
    const projectInstallations = skill.installations.filter((installation) => installation.scope === 'project')
    const grouped = new Map<string, Installation[]>()
    for (const installation of projectInstallations) {
      const path = installation.projectPath ?? installation.path
      const key = normalizeProjectPath(path)
      grouped.set(key, [...(grouped.get(key) ?? []), installation])
    }
    for (const [, installations] of grouped) {
      const path = installations[0].projectPath ?? installations[0].path
      const inventory = ensure(path, projectName(path), agentsFromInstallations(installations), summaries.get(normalizeProjectPath(path)))
      inventory.skills.push({ skill, installations })
    }
  }

  const inventories = [...byPath.values()]
  for (const inventory of inventories) {
    inventory.skills.sort((a, b) => a.skill.name.localeCompare(b.skill.name))
    inventory.globalSkills = [...globalSkills].sort((a, b) => a.name.localeCompare(b.name))
  }
  return inventories.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
}

export const formatTokenCount = (tokens: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens)

const severityPriority: Record<Finding['severity'], number> = { critical: 0, error: 1, warning: 2, info: 3 }

export const severityOrder = (severity: Finding['severity']) => severityPriority[severity]
