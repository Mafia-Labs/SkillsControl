import type { Agent, Finding, ScanReport, Skill } from './types'

export const agentLabels: Record<Agent, string> = {
  agents: 'Agent Skills',
  codex: 'Codex',
  claude: 'Claude'
}

export const getSkillHealth = (skill: Skill, findings: Finding[]) =>
  findings.filter((finding) => finding.skillId === skill.id)

export const healthLabel = (skill: Skill, findings: Finding[]) => {
  const health = getSkillHealth(skill, findings)
  if (health.some((finding) => finding.severity === 'error')) return 'Needs attention'
  if (health.some((finding) => finding.severity === 'warning')) return 'Review suggested'
  return 'Healthy'
}

export const countUniqueProjects = (report: ScanReport) => {
  const paths = report.skills.flatMap((skill) => skill.installations)
    .filter((installation) => installation.scope === 'project')
    .map((installation) => installation.path.split('/.')[0])
  return new Set(paths).size
}

export const countDuplicates = (report: ScanReport) =>
  report.skills.filter((skill) => skill.installations.length > 1).length

export const formatTokenCount = (tokens: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens)

export const severityOrder = (severity: Finding['severity']) => ({ error: 0, warning: 1, info: 2 })[severity]
