import { describe, expect, it } from 'vitest'
import { countDuplicates, countUniqueProjects, healthLabel, projectRoot, severityOrder } from './skill-utils'
import type { ScanReport, Skill } from './types'

const sampleSkill: Skill = {
  id: 'a', name: 'alpha', description: 'Alpha skill', installations: [], files: [],
  executableScripts: [], contextTokens: 100, sourceHash: 'hash'
}

describe('skill inventory utilities', () => {
  it('counts only skills installed in more than one location as duplicates', () => {
    const report = { skills: [{ ...sampleSkill, installations: [{ id: '1', path: '/a', scope: 'user', agent: 'codex', enabled: true, modified: false }] }, { ...sampleSkill, id: 'b', installations: [{ id: '2', path: '/b', scope: 'user', agent: 'claude', enabled: true, modified: false }, { id: '3', path: '/c', scope: 'project', agent: 'claude', enabled: true, modified: false }] }], findings: [], scannedPaths: [], agents: [], scannedAt: '' } satisfies ScanReport
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

  it('counts project roots without inflating paths from the same project', () => {
    const report = { skills: [{ ...sampleSkill, installations: [{ id: '1', path: '/work/one/.agents/skills/alpha', scope: 'project', agent: 'agents', enabled: true, modified: false }, { id: '2', path: '/work/one/.codex/skills/alpha', scope: 'project', agent: 'codex', enabled: true, modified: false }, { id: '3', path: '/work/two/.claude/skills/alpha', scope: 'project', agent: 'claude', enabled: true, modified: false }] }], findings: [], scannedPaths: [], agents: [], scannedAt: '' } satisfies ScanReport
    expect(countUniqueProjects(report)).toBe(2)
  })

  it('finds project roots from Windows-style installation paths', () => {
    expect(projectRoot('C:\\work\\one\\.codex\\skills\\alpha')).toBe('C:/work/one')
  })
})
