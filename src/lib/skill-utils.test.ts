import { describe, expect, it } from 'vitest'
import { countDuplicates, countUniqueProjects, healthLabel, projectName, severityOrder } from './skill-utils'
import type { ScanReport, Skill } from './types'

const sampleSkill: Skill = {
  id: 'a', name: 'alpha', description: 'Alpha skill', installations: [], files: [],
  executableScripts: [], contextTokens: 100, sourceHash: 'hash'
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
          { id: '1', path: '/home/.agents/skills/alpha', scope: 'user', agent: 'codex', enabled: true, modified: false, sourceHash: 'hash' },
          { id: '2', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: false, sourceHash: 'hash' }
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
          { id: '1', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: false, sourceHash: 'hash' },
          { id: '2', path: '/work/app/.claude/skills/alpha', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: false, sourceHash: 'hash' }
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
          { id: '1', path: '/work/app/.agents/skills/alpha', scope: 'project', agent: 'codex', projectPath: '/work/app', enabled: true, modified: true, sourceHash: 'hash-a' },
          { id: '2', path: '/work/app/.claude/skills/alpha', scope: 'project', agent: 'claude', projectPath: '/work/app', enabled: true, modified: true, sourceHash: 'hash-b' }
        ]
      }
    ])
    expect(countDuplicates(report)).toBe(1)
  })

  it('derives the highest-priority health label for a skill', () => {
    expect(healthLabel(sampleSkill, [])).toBe('Healthy')
    expect(healthLabel(sampleSkill, [{ id: '1', skillId: 'a', severity: 'warning', title: '', detail: '' }])).toBe('Review suggested')
    expect(healthLabel(sampleSkill, [{ id: '2', skillId: 'a', severity: 'error', title: '', detail: '' }])).toBe('Needs attention')
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
