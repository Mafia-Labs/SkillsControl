import { describe, expect, it } from 'vitest'
import { countDuplicates, countUniqueProjects, groupInstallationsByProject, healthLabel, projectName, severityOrder } from './skill-utils'
import type { ScanReport, Skill } from './types'

const sampleSkill: Skill = {
  id: 'a', name: 'alpha', description: 'Alpha skill', installations: [], files: [],
  executableScripts: [], invokedScripts: [], capabilities: [], securityStatus: 'Unknown',
  provenance: { contentHashSha256: 'hash', installedAt: 'unknown' }, contextTokens: 100, contentHashSha256: 'hash'
}

const emptyReport = (skills: Skill[]): ScanReport => ({
  skills,
  findings: [],
  scannedPaths: [],
  projects: [],
  agents: [],
  scannedAt: ''
})

describe('skill inventory utilities', () => {
  it('counts global and project overlap for the same agent', () => {
    const report = emptyReport([
      {
        ...sampleSkill,
        installations: [
          { id: '1', path: '/home/.agents/skills/alpha', scope: 'user', agent: 'codex', enabled: true, modified: false, contentHashSha256: 'hash' },
          { id: '2', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'hash' }
        ]
      }
    ])
    expect(countDuplicates(report)).toBe(1)
  })

  it('does not treat identical cross-agent project copies as an overlap', () => {
    const report = emptyReport([
      {
        ...sampleSkill,
        installations: [
          { id: '1', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'hash' },
          { id: '2', path: '/work/app/.claude/skills/alpha', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'hash' }
        ]
      }
    ])
    expect(countDuplicates(report)).toBe(0)
  })

  it('counts divergent copies as an overlap', () => {
    const report = emptyReport([
      {
        ...sampleSkill,
        installations: [
          { id: '1', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: true, contentHashSha256: 'hash-a' },
          { id: '2', path: '/work/app/.claude/skills/alpha', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: true, contentHashSha256: 'hash-b' }
        ]
      }
    ])
    expect(countDuplicates(report)).toBe(1)
  })

  it('derives the highest-priority health label for a skill', () => {
    expect(healthLabel(sampleSkill, [])).toBe('Healthy')
    const finding = (id: string, severity: 'warning' | 'error') => ({ id, skillId: 'a', severity, title: { key: 'health.findings.test.title', params: {} }, detail: { key: 'health.findings.test.detail', params: {} } })
    expect(healthLabel(sampleSkill, [finding('1', 'warning')])).toBe('Review suggested')
    expect(healthLabel(sampleSkill, [finding('2', 'error')])).toBe('Needs attention')
  })

  it('orders health findings from the most urgent to the least urgent', () => {
    expect(['info', 'warning', 'error'].sort((a, b) => severityOrder(a as 'info') - severityOrder(b as 'info'))).toEqual(['error', 'warning', 'info'])
  })

  it('uses the projects reported by the scanner', () => {
    const report = { ...emptyReport([]), projects: [{ path: '/work/one', name: 'one', agents: ['codex'] }, { path: '/work/two', name: 'two', agents: ['claude'] }] } satisfies ScanReport
    expect(countUniqueProjects(report)).toBe(2)
  })

  it('formats project names from Windows-style paths', () => {
    expect(projectName('C:\\work\\one')).toBe('one')
  })
})

describe('groupInstallationsByProject', () => {
  const projectSkill = (id: string, installations: Skill['installations']): Skill => ({ ...sampleSkill, id, name: id, installations })

  it('groups project-scoped installations under their owning project', () => {
    const report = {
      ...emptyReport([
        projectSkill('alpha', [
          { id: '1', path: '/work/app/.claude/skills/alpha', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'h' },
          { id: '2', path: '/work/other/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/other', enabled: true, modified: false, contentHashSha256: 'h' }
        ]),
        projectSkill('beta', [
          { id: '3', path: '/work/app/.agents/skills/beta', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'h' }
        ])
      ]),
      projects: [
        { path: '/work/app', name: 'app', agents: ['claude', 'codex'] as const },
        { path: '/work/other', name: 'other', agents: ['codex'] as const }
      ]
    } satisfies ScanReport

    const inventories = groupInstallationsByProject(report)
    expect(inventories.map((inventory) => inventory.name)).toEqual(['app', 'other'])
    const app = inventories.find((inventory) => inventory.name === 'app')!
    expect(app.skills.map((entry) => entry.skill.id)).toEqual(['alpha', 'beta'])
    expect(app.skills[0].installations).toHaveLength(1)
  })

  it('attaches global (user-scope) skills to every project', () => {
    const report = {
      ...emptyReport([
        projectSkill('global-one', [{ id: 'g', path: '/home/.claude/skills/global-one', scope: 'user', agent: 'claude', enabled: true, modified: false, contentHashSha256: 'h' }]),
        projectSkill('local', [{ id: 'l', path: '/work/app/.claude/skills/local', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: false, contentHashSha256: 'h' }])
      ]),
      projects: [{ path: '/work/app', name: 'app', agents: ['claude'] as const }]
    } satisfies ScanReport

    const [app] = groupInstallationsByProject(report)
    expect(app.skills.map((entry) => entry.skill.id)).toEqual(['local'])
    expect(app.globalSkills.map((skill) => skill.id)).toEqual(['global-one'])
  })

  it('surfaces a project discovered only through an installation path', () => {
    const report = emptyReport([
      projectSkill('orphan', [{ id: 'o', path: '/work/ghost/.claude/skills/orphan', scope: 'project', agent: 'claude', projectPath: '/work/ghost', enabled: true, modified: false, contentHashSha256: 'h' }])
    ])
    const inventories = groupInstallationsByProject(report)
    expect(inventories.map((inventory) => inventory.name)).toEqual(['ghost'])
    expect(inventories[0].agents).toEqual(['claude'])
  })

  it('preserves nested project metadata for the hierarchy view', () => {
    const report = { ...emptyReport([]), projects: [
      { path: '/work/app', name: 'app', agents: ['codex'] as const, relativePath: '.', kind: 'package' as const },
      { path: '/work/app/src-tauri', name: 'src-tauri', agents: ['codex'] as const, parentPath: '/work/app', relativePath: 'src-tauri', kind: 'package' as const }
    ] } satisfies ScanReport
    const inventories = groupInstallationsByProject(report)
    expect(inventories.find((inventory) => inventory.name === 'src-tauri')).toMatchObject({ parentPath: '/work/app', relativePath: 'src-tauri', kind: 'package' })
  })
})
