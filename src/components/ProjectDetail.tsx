import { useEffect, useRef, useState } from 'react'
import { agentLabels, healthClass, healthLabel } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, Skill, SkillRecommendation, StackDetection } from '../lib/types'
import { appendConsoleLines, ProcessConsole, type ConsoleLine } from './ProcessConsole'
import { Empty } from './shared'

const analyzedLabel = (iso: string) => {
  const elapsed = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `on ${new Date(iso).toLocaleDateString('en-US')}`
}

const detectScript = (name: string): ConsoleLine[] => [
  { id: 'cmd', text: `autoskills detect ./${name}`, tone: 'cmd', delay: 120 },
  { id: 'pkg', text: 'Reading package.json and config files', tone: 'step', delay: 620 },
  { id: 'map', text: 'Matching against the curated detection map', tone: 'step', delay: 500 },
  { id: 'installed', text: 'Cross-checking skills already installed here', tone: 'step', delay: 480 }
]

const detectResultLines = (result: StackDetection): ConsoleLine[] => {
  const shown = result.detected.slice(0, 8)
  const lines: ConsoleLine[] = shown.map((technology, index) => ({ id: `tech-${technology.techId}`, text: technology.techName, tone: 'ok', delay: index === 0 ? 380 : 190, detail: technology.category }))
  if (!shown.length) lines.push({ id: 'tech-none', text: 'No known technology detected in this folder', tone: 'warn', delay: 380 })
  if (result.detected.length > shown.length) lines.push({ id: 'tech-more', text: `+${result.detected.length - shown.length} more technologies`, tone: 'dim', delay: 190 })
  const pending = result.recommendations.filter((recommendation) => !recommendation.installed).length
  const alreadyInstalled = result.recommendations.length - pending
  lines.push({ id: 'list', text: 'Matching the MafiaIA Skill List', tone: 'step', delay: 430 })
  lines.push({ id: 'recs', text: `${pending} skill recommendation${pending === 1 ? '' : 's'} ready${alreadyInstalled ? ` · ${alreadyInstalled} already installed` : ''}`, tone: pending ? 'ok' : 'dim', delay: 460 })
  return lines
}

const localRoot = (path: string, projectPath: string) => {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.indexOf('/.claude/')
  const agentsIndex = normalized.indexOf('/.agents/')
  const cut = index >= 0 ? index : agentsIndex
  return cut >= 0 ? normalized.slice(cut + 1) : normalized.replace(`${projectPath.replace(/\\/g, '/')}/`, '')
}

export function ProjectDetail({ inventory, findings, analysis, analyzing, onAnalyze, onBack, onInspect, onQuarantine, onLocalize, onInstallRecommendation }: {
  inventory: ProjectInventory
  findings: Finding[]
  analysis: { result: StackDetection, at: string } | null
  analyzing: boolean
  onAnalyze: () => void
  onBack: () => void
  onInspect: (skillId: string) => void
  onQuarantine: (installation: Installation) => void
  onLocalize: (skill: Skill, installation: Installation) => void
  onInstallRecommendation: (recommendation: SkillRecommendation) => void
}) {
  const installedIds = new Set(inventory.skills.map((entry) => entry.skill.id))
  const applicableGlobals = inventory.globalSkills.filter((skill) => !installedIds.has(skill.id))

  // Detection console: plays while the backend analyzes, prints the real
  // findings when they land, then hands over to the analysis panel.
  const [detectConsole, setDetectConsole] = useState<{ lines: ConsoleLine[], done: boolean } | null>(null)
  const wasAnalyzing = useRef(analyzing)
  useEffect(() => {
    if (analyzing && !wasAnalyzing.current) setDetectConsole({ lines: detectScript(inventory.name), done: false })
    if (!analyzing && wasAnalyzing.current) setDetectConsole((current) => {
      if (!current) return current
      const results = analysis ? detectResultLines(analysis.result) : [{ id: 'err', text: 'The analysis could not complete', tone: 'err' as const, delay: 320 }]
      return { lines: appendConsoleLines(current.lines, results), done: true }
    })
    wasAnalyzing.current = analyzing
  }, [analyzing, analysis, inventory.name])

  return <section className="project-detail">
    <button className="text-button back-button" onClick={onBack}>← Projects</button>
    <div className="project-detail-head">
      <div>
        <p className="eyebrow">Project</p>
        <h2>{inventory.name}</h2>
        <code className="project-path" title={inventory.path}>{inventory.path}</code>
      </div>
      <div className="detail-head-actions">
        <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{agentLabels[agent]}</span>) : <span className="agent-badge muted">No active agent</span>}</div>
        <button className="primary-button compact" disabled={analyzing} onClick={onAnalyze}>{analyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze project'}</button>
      </div>
    </div>

    {detectConsole
      ? <div className="console-inline"><ProcessConsole title={`autoskills — ${inventory.name}`} lines={detectConsole.lines} done={detectConsole.done} onSettled={() => setTimeout(() => setDetectConsole(null), 1000)} /></div>
      : analysis && !analyzing && <AnalysisPanel result={analysis.result} at={analysis.at} onInspect={onInspect} onInstall={onInstallRecommendation} />}

    <div className="panel">
      <div className="panel-heading"><h3>Skills installed here</h3><span className="count-chip">{inventory.skills.length}</span></div>
      {inventory.skills.length ? <div className="skill-table" role="grid" aria-label="Skills installed in this project">
        <div className="skill-table-row table-head" role="row"><span>Skill</span><span>Agent</span><span>Local path</span><span>Health</span><span>Actions</span></div>
        {inventory.skills.map((entry) => {
          const divergent = new Set(entry.skill.installations.map((installation) => installation.contentHashSha256)).size > 1
          return <div className="skill-table-row" role="row" key={entry.skill.id}>
            <span className="skill-cell"><strong>{entry.skill.name}</strong>{divergent && <small className="divergent-flag">divergent hash across copies</small>}</span>
            <span className="agent-cell">{[...new Set(entry.installations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{agentLabels[agent]}</span>)}</span>
            <span className="path-cell">{entry.installations.map((installation) => <code key={installation.id} title={installation.path}>{localRoot(installation.path, inventory.path)}</code>)}</span>
            <span className={`health-pill ${healthClass(entry.skill, findings)}`}>{healthLabel(entry.skill, findings)}</span>
            <span className="row-actions">
              <button className="secondary-button compact" onClick={() => onInspect(entry.skill.id)}>Inspect</button>
              {entry.installations.map((installation) => <button className="icon-button" key={installation.id} aria-label={`Quarantine ${entry.skill.name} (${agentLabels[installation.agent]})`} title="Quarantine this copy" onClick={() => onQuarantine(installation)}>⊘</button>)}
            </span>
          </div>
        })}
      </div> : <Empty icon="◇" title="This project has no skills yet" detail="Install a local skill, or convert a global copy into a local one from the section below." />}
    </div>

    {applicableGlobals.length > 0 && <div className="panel">
      <div className="panel-heading"><h3>Global copies that also apply here</h3><span className="count-chip">{applicableGlobals.length}</span></div>
      <p className="muted-copy">These skills are installed globally (<code>~/.claude/skills</code> or <code>~/.agents/skills</code>), so agents also see them while working in this project. Convert them to local to scope them to this folder.</p>
      <div className="global-list">{applicableGlobals.map((skill) => {
        const source = skill.installations.find((installation) => installation.scope === 'user') ?? skill.installations[0]
        return <div className="global-row" key={skill.id}>
          <span><strong>{skill.name}</strong><small>{skill.description || 'No description.'}</small></span>
          <div className="row-actions">
            <button className="secondary-button compact" onClick={() => onInspect(skill.id)}>Inspect</button>
            {source && <button className="primary-button compact" onClick={() => onLocalize(skill, source)}>Convert to local</button>}
          </div>
        </div>
      })}</div>
    </div>}
  </section>
}

function AnalysisPanel({ result, at, onInspect, onInstall }: {
  result: StackDetection
  at: string
  onInspect: (skillId: string) => void
  onInstall: (recommendation: SkillRecommendation) => void
}) {
  const pending = result.recommendations.filter((recommendation) => !recommendation.installed)
  const installed = result.recommendations.filter((recommendation) => recommendation.installed)
  return <div className="panel analysis-panel">
    <div className="panel-heading"><h3>Auto Skills</h3><span className="analysis-timestamp">Analyzed {analyzedLabel(at)}</span></div>

    {result.detected.length ? <div className="stack-chips">{result.detected.map((technology) => <span className="stack-chip" key={technology.techId} title={technology.category}>{technology.techName}</span>)}</div> : <p className="muted-copy">No known technology was detected in this project.</p>}

    {pending.length > 0 && <>
      <h4 className="recommend-heading">Recommended for this project</h4>
      <div className="recommend-list">{pending.map((recommendation) => <div className="recommend-row" key={recommendation.skillId}>
        <div className="recommend-main">
          <strong>{recommendation.skillId}</strong>
          <small>{recommendation.description}</small>
          <div className="recommend-reasons">{recommendation.reasons.map((reason) => <span className="recommend-reason" key={reason.techName}>{reason.evidenceText}</span>)}</div>
          <code className="recommend-source">{recommendation.sourceRepo}</code>
        </div>
        <button className="primary-button compact" title="Install from the curated list with hash verification" onClick={() => onInstall(recommendation)}>Install</button>
      </div>)}</div>
    </>}

    {installed.length > 0 && <div className="recommend-installed">{installed.map((recommendation) => <button className="installed-chip" key={recommendation.skillId} onClick={() => onInspect(recommendation.skillId)} title="Already installed · inspect">✓ {recommendation.skillId}</button>)}</div>}

    {result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}</div>}
  </div>
}
