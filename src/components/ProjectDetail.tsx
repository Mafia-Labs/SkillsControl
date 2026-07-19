import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { healthClass, healthLabelKey } from '../lib/skill-utils'
import type { Finding, Installation, ProjectInventory, Skill, SkillRecommendation, StackDetection } from '../lib/types'
import { appendConsoleLines, ProcessConsole, type ConsoleLine } from './ProcessConsole'
import { Empty } from './shared'

const analyzedLabel = (iso: string) => {
  const elapsed = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return i18n.t('projectDetail.justNow')
  if (minutes < 60) return i18n.t('projectDetail.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t('projectDetail.hoursAgo', { count: hours })
  return i18n.t('projectDetail.onDate', { date: new Date(iso).toLocaleDateString(i18n.language) })
}

const detectScript = (name: string): ConsoleLine[] => [
  { id: 'cmd', text: i18n.t('projectDetail.detectCommand', { name }), tone: 'cmd', delay: 120 },
  { id: 'pkg', text: i18n.t('projectDetail.readingConfig'), tone: 'step', delay: 620 },
  { id: 'map', text: i18n.t('projectDetail.matchingDetection'), tone: 'step', delay: 500 },
  { id: 'installed', text: i18n.t('projectDetail.crossChecking'), tone: 'step', delay: 480 }
]

const detectResultLines = (result: StackDetection): ConsoleLine[] => {
  const shown = result.detected.slice(0, 8)
  const lines: ConsoleLine[] = shown.map((technology, index) => ({ id: `tech-${technology.techId}`, text: technology.techName, tone: 'ok', delay: index === 0 ? 380 : 190, detail: technology.category }))
  if (!shown.length) lines.push({ id: 'tech-none', text: i18n.t('projectDetail.noTechnology'), tone: 'warn', delay: 380 })
  if (result.detected.length > shown.length) lines.push({ id: 'tech-more', text: i18n.t('projectDetail.moreTechnologies', { count: result.detected.length - shown.length }), tone: 'dim', delay: 190 })
  const pending = result.recommendations.filter((recommendation) => !recommendation.installed).length
  const alreadyInstalled = result.recommendations.length - pending
  lines.push({ id: 'list', text: i18n.t('projectDetail.matchingSkillList'), tone: 'step', delay: 430 })
  lines.push({ id: 'recs', text: i18n.t('projectDetail.recommendationsReady', { count: pending, installedSuffix: alreadyInstalled ? i18n.t('projectDetail.alreadyInstalledSuffix', { count: alreadyInstalled }) : '' }), tone: pending ? 'ok' : 'dim', delay: 460 })
  return lines
}

const localRoot = (path: string, projectPath: string) => {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.indexOf('/.claude/')
  const agentsIndex = normalized.indexOf('/.agents/')
  const cut = index >= 0 ? index : agentsIndex
  return cut >= 0 ? normalized.slice(cut + 1) : normalized.replace(`${projectPath.replace(/\\/g, '/')}/`, '')
}

export function ProjectDetail({ inventory, childScopes, findings, analysis, analyzing, onAnalyze, onBack, onOpenScope, onInspect, onUninstall, onLocalize, onInstallRecommendation }: {
  inventory: ProjectInventory
  childScopes: ProjectInventory[]
  findings: Finding[]
  analysis: { result: StackDetection, at: string } | null
  analyzing: boolean
  onAnalyze: () => void
  onBack: () => void
  onOpenScope: (path: string) => void
  onInspect: (skillId: string, projectPath?: string) => void
  onUninstall: (installations: Installation[]) => void
  onLocalize: (skill: Skill, installation: Installation, alternateSources?: Installation[]) => void
  onInstallRecommendation: (recommendation: SkillRecommendation) => void
}) {
  const { t } = useTranslation()
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
      const results = analysis ? detectResultLines(analysis.result) : [{ id: 'err', text: t('projectDetail.analysisCouldNotComplete'), tone: 'err' as const, delay: 320 }]
      return { lines: appendConsoleLines(current.lines, results), done: true }
    })
    wasAnalyzing.current = analyzing
  }, [analyzing, analysis, inventory.name])

  return <section className="project-detail">
    <button className="text-button back-button" onClick={onBack}>← {t('projectDetail.backProjects')}</button>
    <div className="project-detail-head">
      <div>
        <p className="eyebrow">{t('projectDetail.projectEyebrow')}</p>
        <h2>{inventory.name}</h2>
        <code className="project-path" title={inventory.path}>{inventory.path}</code>
      </div>
      <div className="detail-head-actions">
        <div className="agent-badges">{inventory.agents.length ? inventory.agents.map((agent) => <span className="agent-badge" key={agent}>{t(`agents.${agent}`)}</span>) : <span className="agent-badge muted">{t('projects.noActiveAgent')}</span>}</div>
        <button className="primary-button compact" disabled={analyzing} onClick={onAnalyze}>{analyzing ? t('projectDetail.analyzing') : analysis ? t('projectDetail.reanalyze') : t('projectDetail.analyzeProject')}</button>
      </div>
    </div>

    {childScopes.length > 0 && <div className="panel scope-panel">
      <div className="panel-heading"><h3>{t('projects.nestedScopes')}</h3><span className="count-chip">{childScopes.length}</span></div>
      <p className="muted-copy">{t('projectDetail.nestedScopesDescription')}</p>
      <div className="scope-list">{childScopes.map((child) => <button className="scope-chip" key={child.path} onClick={() => onOpenScope(child.path)} aria-label={t('projects.openScope', { name: child.name })}>
        <strong>{child.name}</strong><code>{child.relativePath ?? child.path}</code>
      </button>)}</div>
    </div>}

    {detectConsole
      ? <div className="console-inline"><ProcessConsole title={t('projectDetail.consoleTitle', { name: inventory.name })} lines={detectConsole.lines} done={detectConsole.done} onSettled={() => setTimeout(() => setDetectConsole(null), 1000)} /></div>
      : analysis && !analyzing && <AnalysisPanel result={analysis.result} at={analysis.at} projectPath={inventory.path} onInspect={onInspect} onInstall={onInstallRecommendation} />}

    <div className="panel">
      <div className="panel-heading"><h3>{t('projectDetail.skillsInstalledHere')}</h3><span className="count-chip">{inventory.skills.length}</span></div>
      {inventory.skills.length ? <div className="skill-table" role="grid" aria-label={t('projectDetail.skillsInstalledAria')}>
        <div className="skill-table-row table-head" role="row"><span>{t('common.skill')}</span><span>{t('common.agent')}</span><span>{t('common.localPath')}</span><span>{t('common.health')}</span><span>{t('common.actions')}</span></div>
        {inventory.skills.map((entry) => {
          const divergent = new Set(entry.skill.installations.map((installation) => installation.contentHashSha256)).size > 1
          return <div className="skill-table-row" role="row" key={entry.skill.id}>
            <span className="skill-cell"><button className="skill-name-button" onClick={() => onInspect(entry.skill.id, inventory.path)}><strong>{entry.skill.name}</strong></button>{divergent && <small className="divergent-flag">{t('projectDetail.divergentHash')}</small>}</span>
            <span className="agent-cell">{[...new Set(entry.installations.map((installation) => installation.agent))].map((agent) => <span className="agent-badge sm" key={agent}>{t(`agents.${agent}`)}</span>)}</span>
            <span className="path-cell">{entry.installations.map((installation) => <code key={installation.id} title={installation.path}>{localRoot(installation.path, inventory.path)}</code>)}</span>
            <span className={`health-pill ${healthClass(entry.skill, findings)}`}>{t(healthLabelKey(entry.skill, findings))}</span>
            <span className="row-actions">
              <button className="secondary-button compact" onClick={() => onInspect(entry.skill.id, inventory.path)}>{t('common.inspect')}</button>
              {entry.installations.length > 0 && <button className="danger-button compact" aria-label={t('common.uninstallProject', { count: entry.installations.length })} title={t('common.uninstallProject', { count: entry.installations.length })} onClick={() => onUninstall(entry.installations)}>{t('common.uninstallProject', { count: entry.installations.length })}</button>}
            </span>
          </div>
        })}
      </div> : <Empty icon="◇" title={t('projectDetail.noSkillsTitle')} detail={t('projectDetail.noSkillsDetail')} />}
    </div>

    {applicableGlobals.length > 0 && <div className="panel">
      <div className="panel-heading"><h3>{t('projectDetail.globalCopies')}</h3><span className="count-chip">{applicableGlobals.length}</span></div>
      <p className="muted-copy">{t('projectDetail.globalCopiesDescription')}</p>
      <div className="global-list">{applicableGlobals.map((skill) => {
        const userInstallations = skill.installations.filter((installation) => installation.scope === 'user')
        const source = userInstallations[0] ?? skill.installations[0]
        return <div className="global-row" key={skill.id}>
          <span><button className="skill-name-button" onClick={() => onInspect(skill.id, inventory.path)}><strong>{skill.name}</strong></button><small>{skill.description || t('common.noDescription')}</small></span>
          <div className="row-actions">
            <button className="secondary-button compact" onClick={() => onInspect(skill.id, inventory.path)}>{t('common.inspect')}</button>
            {source && <button className="primary-button compact" title={t('projects.moveToProjectTitle', { agent: t(`agents.${source.agent}`) })} onClick={() => onLocalize(skill, source, userInstallations.filter((installation) => installation.id !== source.id))}>{t('common.convertToLocal')}</button>}
          </div>
        </div>
      })}</div>
    </div>}
  </section>
}

function AnalysisPanel({ result, at, projectPath, onInspect, onInstall }: {
  result: StackDetection
  at: string
  projectPath: string
  onInspect: (skillId: string, projectPath?: string) => void
  onInstall: (recommendation: SkillRecommendation) => void
}) {
  const { t } = useTranslation()
  const pending = result.recommendations.filter((recommendation) => !recommendation.installed)
  const installed = result.recommendations.filter((recommendation) => recommendation.installed)
  return <div className="panel analysis-panel">
    <div className="panel-heading"><h3>{t('projectDetail.autoSkills')}</h3><span className="analysis-timestamp">{t('projectDetail.analyzed', { when: analyzedLabel(at) })}</span></div>

    {result.detected.length ? <div className="stack-chips">{result.detected.map((technology) => <span className="stack-chip" key={technology.techId} title={technology.category}>{technology.techName}</span>)}</div> : <p className="muted-copy">{t('projectDetail.noKnownTechnology')}</p>}

    {pending.length > 0 && <>
      <h4 className="recommend-heading">{t('projectDetail.recommendedForProject')}</h4>
      <div className="recommend-list">{pending.map((recommendation) => <div className="recommend-row" key={recommendation.skillId}>
        <div className="recommend-main">
          <strong>{recommendation.skillId}</strong>
          <small>{recommendation.description}</small>
          <div className="recommend-reasons">{recommendation.reasons.map((reason) => <span className="recommend-reason" key={reason.techName}>{reason.evidenceText}</span>)}</div>
          <code className="recommend-source">{recommendation.sourceRepo}</code>
        </div>
        <button className="primary-button compact" title={t('projectDetail.installVerifiedTitle')} onClick={() => onInstall(recommendation)}>{t('common.install')}</button>
      </div>)}</div>
    </>}

    {installed.length > 0 && <div className="recommend-installed">{installed.map((recommendation) => <button className="installed-chip" key={recommendation.skillId} onClick={() => onInspect(recommendation.skillId, projectPath)} title={t('projectDetail.alreadyInstalledInspect')}>✓ {recommendation.skillId}</button>)}</div>}

    {result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}</div>}
  </div>
}
