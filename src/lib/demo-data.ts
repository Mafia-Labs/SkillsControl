import type { CatalogEntry, ScanReport, StackDetection } from './types'

export const demoReport: ScanReport = {
  scannedAt: new Date().toISOString(),
  scannedPaths: ['~/.agents/skills', '~/.claude/skills', '/workspace/demo/.agents/skills', '/workspace/demo/.claude/skills'],
  projects: [
    { path: '/workspace/demo', name: 'demo', agents: ['codex', 'claude'], relativePath: '.', kind: 'package' },
    { path: '/workspace/demo/src-tauri', name: 'src-tauri', agents: ['codex'], parentPath: '/workspace/demo', relativePath: 'src-tauri', kind: 'package' },
    { path: '/workspace/newsletter', name: 'newsletter', agents: ['claude'] },
    { path: '/workspace/landing-web', name: 'landing-web', agents: [] }
  ],
  agents: ['codex', 'claude'],
  skills: [
    {
      id: 'frontend-design', name: 'frontend-design', description: 'Build polished, accessible interfaces with a coherent visual system.', version: '2.4.0', source: 'Alex Picks', provenance: { sourceRepository: 'Mafia-Labs/SkillsControl', contentHashSha256: 'a82f3d9', installedAt: 'demo', reviewedHash: 'a82f3d9', reviewedAt: 'demo' }, capabilities: ['Read project files'], securityStatus: 'Reviewed', contextTokens: 2430, contentHashSha256: 'a82f3d9', files: ['SKILL.md', 'references/accessibility.md'], executableScripts: [], invokedScripts: [],
      installations: [
        { id: 'fd-codex-user', path: '~/.agents/skills/frontend-design', scope: 'user', agent: 'codex', enabled: true, modified: true, contentHashSha256: 'a82f3d9' },
        { id: 'fd-claude-user', path: '~/.claude/skills/frontend-design', scope: 'user', agent: 'claude', enabled: true, modified: true, contentHashSha256: 'a82f3d9' },
        { id: 'fd-codex-project', path: '/workspace/demo/.agents/skills/frontend-design', scope: 'project', agent: 'codex', projectPath: '/workspace/demo', enabled: true, modified: true, contentHashSha256: 'project-a82f' },
        { id: 'fd-claude-project', path: '/workspace/demo/.claude/skills/frontend-design', scope: 'project', agent: 'claude', projectPath: '/workspace/demo', enabled: true, modified: true, contentHashSha256: 'project-a82f' }
      ]
    },
    {
      id: 'security-review', name: 'security-review', description: 'Review changes for common application security risks.', version: '1.8.1', source: 'Community', provenance: { sourceRepository: 'community/example', contentHashSha256: 'bcf0123', installedAt: 'demo' }, capabilities: ['Read project files', 'Execute shell commands'], securityStatus: 'Review required', contextTokens: 1680, contentHashSha256: 'bcf0123', files: ['SKILL.md', 'scripts/check.sh'], executableScripts: ['scripts/check.sh'], invokedScripts: ['scripts/check.sh'],
      installations: [{ id: 'sr-project', path: '/workspace/demo/.claude/skills/security-review', scope: 'project', agent: 'claude', projectPath: '/workspace/demo', enabled: true, modified: false, contentHashSha256: 'bcf0123' }]
    },
    {
      id: 'release-helper', name: 'release-helper', description: 'Prepare reliable release notes and version checks.', version: '0.9.0', source: 'Community', provenance: { contentHashSha256: '4c3e1b8', installedAt: 'demo' }, capabilities: ['Read project files'], securityStatus: 'Unknown', contextTokens: 920, contentHashSha256: '4c3e1b8', files: ['SKILL.md'], executableScripts: [], invokedScripts: [],
      installations: [{ id: 'rh-codex', path: '~/.agents/skills/release-helper', scope: 'user', agent: 'codex', enabled: true, modified: false, contentHashSha256: '4c3e1b8' }]
    },
    {
      id: 'copywriting', name: 'copywriting', description: 'Write concise product copy and message variants.', version: '1.3.0', source: 'Alex Picks', provenance: { contentHashSha256: '91efca7', installedAt: 'demo' }, capabilities: ['Read project files'], securityStatus: 'Unknown', contextTokens: 1180, contentHashSha256: '91efca7', files: ['SKILL.md'], executableScripts: [], invokedScripts: [],
      installations: [
        { id: 'cw-claude', path: '~/.claude/skills/copywriting', scope: 'user', agent: 'claude', enabled: true, modified: false, contentHashSha256: '91efca7' },
        { id: 'cw-news-project', path: '/workspace/newsletter/.claude/skills/copywriting', scope: 'project', agent: 'claude', projectPath: '/workspace/newsletter', enabled: true, modified: false, contentHashSha256: '91efca7' }
      ]
    },
    {
      id: 'newsletter-writer', name: 'newsletter-writer', description: 'Draft and structure recurring newsletter issues with a consistent voice.', version: '1.1.0', source: 'Alex Picks', provenance: { contentHashSha256: 'de77a10', installedAt: 'demo' }, capabilities: ['Read project files'], securityStatus: 'Reviewed', contextTokens: 1420, contentHashSha256: 'de77a10', files: ['SKILL.md'], executableScripts: [], invokedScripts: [],
      installations: [{ id: 'nw-news-project', path: '/workspace/newsletter/.claude/skills/newsletter-writer', scope: 'project', agent: 'claude', projectPath: '/workspace/newsletter', enabled: true, modified: false, contentHashSha256: 'de77a10' }]
    }
  ],
  findings: [
    { id: 'f1', skillId: 'frontend-design', severity: 'warning', title: 'Copies have diverged', detail: 'The global and project copies contain different skill contents.' },
    { id: 'f2', skillId: 'frontend-design', severity: 'info', title: 'Global and project copies', detail: 'Prefer project scope unless this skill is useful everywhere.' },
    { id: 'f3', skillId: 'security-review', severity: 'warning', title: 'Executable script', detail: 'Review scripts/check.sh before running it with an agent.' }
  ]
}

// Canned Auto Skills result so the browser demo can exercise the analysis UI.
export const demoStackDetection = (): StackDetection => ({
  detected: [
    { techId: 'nextjs', techName: 'Next.js', category: 'framework-frontend', evidence: [{ kind: 'packageDependency', name: 'next' }], hasSkills: true },
    { techId: 'react', techName: 'React', category: 'library-frontend', evidence: [{ kind: 'packageDependency', name: 'react' }], hasSkills: true },
    { techId: 'typescript', techName: 'TypeScript', category: 'language', evidence: [{ kind: 'configFilePresent', path: 'tsconfig.json' }], hasSkills: true },
    { techId: 'supabase', techName: 'Supabase', category: 'backend-data', evidence: [{ kind: 'packageDependency', name: '@supabase/supabase-js' }], hasSkills: true }
  ],
  recommendations: [
    { skillId: 'next-best-practices', sourceRepo: 'vercel-labs/next-skills', description: 'Best practices for building and maintaining Next.js applications.', reasons: [{ techName: 'Next.js', evidenceText: 'Found in the project dependencies: next.' }], installed: false },
    { skillId: 'react-best-practices', sourceRepo: 'vercel-labs/skills', description: 'Patterns for designing maintainable, efficient React components.', reasons: [{ techName: 'React', evidenceText: 'Found in the project dependencies: react.' }], installed: false },
    { skillId: 'nextjs-supabase-patterns', sourceRepo: 'vercel-labs/skills', description: 'Patterns for integrating a Next.js application with Supabase.', reasons: [{ techName: 'Next.js + Supabase', evidenceText: 'Detected the combination of Next.js + Supabase.' }], installed: false },
    { skillId: 'frontend-design', sourceRepo: 'anthropics/skills', description: 'Cross-cutting criteria for building clear, consistent frontend interfaces.', reasons: [{ techName: 'Frontend', evidenceText: 'The project uses a technology in the framework-frontend category.' }], installed: true }
  ],
  groups: [
    { label: 'Next.js', kind: 'technology', skillIds: ['next-best-practices'] },
    { label: 'Next.js + Supabase', kind: 'combo', skillIds: ['nextjs-supabase-patterns'] }
  ],
  warnings: []
})

// A handful of real entries from the bundled MafiaIA Skill List (src-tauri/skill-list.json),
// so the browser-only demo shows the same catalog shape and provenance as the desktop build
// instead of fabricated skills. `listCatalogSkills` fetches the full live list in the real app.
export const demoCatalog: CatalogEntry[] = [
  { id: 'next-best-practices', name: 'next-best-practices', description: 'Best practices for building and maintaining Next.js applications.', techs: ['nextjs'], sourceRepo: 'vercel-labs/next-skills' },
  { id: 'react-best-practices', name: 'react-best-practices', description: 'Patterns for designing maintainable, efficient React components.', techs: ['react'], sourceRepo: 'vercel-labs/skills' },
  { id: 'mafia-frontend-design', name: 'mafia-frontend-design', description: 'Build polished, accessible interfaces with a coherent visual system.', techs: ['frontend'], sourceRepo: 'anthropics/skills' },
  { id: 'mafia-prompt-master', name: 'mafia-prompt-master', description: 'Structure and refine prompts for reliable agent behavior.', techs: ['prompting'], sourceRepo: 'midudev/autoskills' }
]
