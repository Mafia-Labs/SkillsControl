import type { Agent, Finding, ScanReport, Skill } from './types'

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

export const securityStatusClass = (status: Skill['securityStatus']) =>
  status.replace(/\s+/g, '-').toLowerCase()

export const healthClass = (skill: Skill, findings: Finding[]) =>
  healthLabel(skill, findings).replace(/\s+/g, '-').toLowerCase()

export const countUniqueProjects = (report: ScanReport) => report.projects.length

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

export const formatTokenCount = (tokens: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens)

const severityPriority: Record<Finding['severity'], number> = { critical: 0, error: 1, warning: 2, info: 3 }

export const severityOrder = (severity: Finding['severity']) => severityPriority[severity]
