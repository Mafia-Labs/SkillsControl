import type { CatalogSkill, ScanReport } from './types'

export const demoReport: ScanReport = {
  scannedAt: new Date().toISOString(),
  scannedPaths: ['~/.codex/skills', '~/.claude/skills', './.agents/skills'],
  agents: ['codex', 'claude', 'agents'],
  skills: [
    {
      id: 'frontend-design', name: 'frontend-design', description: 'Build polished, accessible interfaces with a coherent visual system.', version: '2.4.0', source: 'Alex Picks', contextTokens: 2430, sourceHash: 'a82f3d9', files: ['SKILL.md', 'references/accessibility.md'], executableScripts: [],
      installations: [
        { id: 'fd-codex', path: '~/.codex/skills/frontend-design', scope: 'user', agent: 'codex', enabled: true, modified: false },
        { id: 'fd-project', path: './.agents/skills/frontend-design', scope: 'project', agent: 'agents', enabled: true, modified: true }
      ]
    },
    {
      id: 'security-review', name: 'security-review', description: 'Review changes for common application security risks.', version: '1.8.1', source: 'Community', contextTokens: 1680, sourceHash: 'bcf0123', files: ['SKILL.md', 'scripts/check.sh'], executableScripts: ['scripts/check.sh'],
      installations: [{ id: 'sr-project', path: './.claude/skills/security-review', scope: 'project', agent: 'claude', enabled: true, modified: false }]
    },
    {
      id: 'release-helper', name: 'release-helper', description: 'Prepare reliable release notes and version checks.', version: '0.9.0', source: 'Community', contextTokens: 920, sourceHash: '4c3e1b8', files: ['SKILL.md'], executableScripts: [],
      installations: [{ id: 'rh-codex', path: '~/.codex/skills/release-helper', scope: 'user', agent: 'codex', enabled: true, modified: false }]
    },
    {
      id: 'copywriting', name: 'copywriting', description: 'Write concise product copy and message variants.', version: '1.3.0', source: 'Alex Picks', contextTokens: 1180, sourceHash: '91efca7', files: ['SKILL.md'], executableScripts: [],
      installations: [{ id: 'cw-agents', path: '~/.agents/skills/copywriting', scope: 'user', agent: 'agents', enabled: true, modified: false }]
    }
  ],
  findings: [
    { id: 'f1', skillId: 'frontend-design', severity: 'warning', title: 'Local changes detected', detail: 'The project copy differs from its global source.' },
    { id: 'f2', skillId: 'frontend-design', severity: 'info', title: 'Duplicate installation', detail: 'Installed globally and in this project; project scope takes precedence.' },
    { id: 'f3', skillId: 'security-review', severity: 'warning', title: 'Executable script', detail: 'Review scripts/check.sh before running it with an agent.' },
    { id: 'f4', skillId: 'release-helper', severity: 'error', title: 'Update recommended', detail: 'Version 1.0.0 is available from the tracked source.' }
  ]
}

export const catalog: CatalogSkill[] = [
  { id: 'repo-hygiene', name: 'repo-hygiene', description: 'Keep repositories small, predictable and easy for agents to navigate.', category: 'Engineering', risk: 'Reviewed', compatibility: ['agents', 'codex', 'claude'], contextTokens: 780, source: 'Alex Picks' },
  { id: 'web-performance', name: 'web-performance', description: 'Diagnose rendering, assets and loading bottlenecks before users feel them.', category: 'Engineering', risk: 'Reviewed', compatibility: ['codex', 'claude'], contextTokens: 1340, source: 'Alex Picks' },
  { id: 'api-contracts', name: 'api-contracts', description: 'Design compatible API changes and document important constraints.', category: 'Architecture', risk: 'Reviewed', compatibility: ['agents', 'codex'], contextTokens: 960, source: 'Alex Picks' }
]
