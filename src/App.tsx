import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { ChangeModal, type ModalState } from './components/ChangeModal'
import { Discover } from './components/Discover'
import { Health } from './components/Health'
import { Inspector } from './components/Inspector'
import { Sidebar, TopBar, type View } from './components/layout'
import { Overview } from './components/Overview'
import { Projects } from './components/Projects'
import { ProjectDetail } from './components/ProjectDetail'
import { Empty, Banner, Loading } from './components/shared'
import { appendConsoleLines, ProcessConsole, type ConsoleLine } from './components/ProcessConsole'
import { SkillMap } from './components/SkillMap'
import { checkOnlineReputation, chooseProjects, copySkillToProject, detectStack, getWorkspaceRoots, installCatalogSkill, installListedSkill, isDemoMode, listArchives, previewDisable, quarantineSkill, restoreSkill, saveWorkspaceRoots, scanSkills, trustSkillVersion } from './lib/desktop'
import { getSkillHealth, groupInstallationsByProject } from './lib/skill-utils'
import type { ArchiveEntry, Installation, InstallTarget, ProjectInventory, ProjectSummary, ScanReport, Scope, SecurityStatus, Skill, StackDetection } from './lib/types'

const loadWorkspaceRoots = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('skill-control-projects') ?? '[]')
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
  } catch { return [] }
}

const fallbackProject = (path: string): ProjectSummary => ({
  path,
  name: path.replace(/\\/g, '/').replace(/\/$/, '').split('/').slice(-1)[0] || path,
  agents: []
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const scanScript = (rootCount: number): ConsoleLine[] => [
  { id: 'cmd', text: i18n.t('app.scan.command'), tone: 'cmd', delay: 120 },
  { id: 'roots', text: i18n.t('app.scan.locatingRoots'), tone: 'step', delay: 620 },
  { id: 'walk', text: i18n.t(rootCount ? 'app.scan.walkingFolders' : 'app.scan.walkingGlobal', { count: rootCount }), tone: 'step', delay: 430 },
  { id: 'hash', text: i18n.t('app.scan.hashing'), tone: 'step', delay: 460 },
  { id: 'checks', text: i18n.t('app.scan.checks'), tone: 'step', delay: 470 }
]

const scanResultLines = (report: ScanReport): ConsoleLine[] => {
  const locations = report.skills.reduce((total, skill) => total + skill.installations.length, 0)
  return [
    { id: 'r-skills', text: i18n.t('app.scan.skillsFound', { count: report.skills.length, locations }), tone: 'ok', delay: 340 },
    { id: 'r-projects', text: i18n.t('app.scan.projectsMapped', { count: report.projects.length }), tone: 'ok', delay: 300 },
    report.findings.length
      ? { id: 'r-findings', text: i18n.t('app.scan.findingsFlagged', { count: report.findings.length }), tone: 'warn', delay: 320 }
      : { id: 'r-findings', text: i18n.t('app.scan.noFindings'), tone: 'ok', delay: 320 },
    { id: 'r-done', text: i18n.t('app.scan.reportReady'), tone: 'ok', delay: 380 }
  ]
}

export default function App() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('projects')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceRoots, setWorkspaceRoots] = useState(loadWorkspaceRoots)
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [recentArchive, setRecentArchive] = useState<ArchiveEntry | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, { result: StackDetection, at: string }>>({})
  const [analyzingPath, setAnalyzingPath] = useState<string | null>(null)
  const [scanConsole, setScanConsole] = useState<{ lines: ConsoleLine[], done: boolean } | null>(null)
  const [applying, setApplying] = useState(false)

  const applyReport = (next: ScanReport) => {
    setReport(next)
    setSelectedId((current) => current && next.skills.some((skill) => skill.id === current) ? current : next.skills[0]?.id ?? null)
  }

  // showConsole plays the animated scan sequence; silent refreshes (after an
  // install or quarantine) skip it so the app stays snappy.
  const refresh = async (roots = workspaceRoots, { showConsole = false } = {}) => {
    setIsScanning(true)
    setError(null)
    if (showConsole) setScanConsole({ lines: scanScript(roots.length), done: false })
    try {
      // Keep the console sequence on screen long enough to read even when the scan is instant.
      const [[nextReport, nextArchives]] = await Promise.all([Promise.all([scanSkills(roots), listArchives()]), wait(showConsole ? 2100 : 0)])
      applyReport(nextReport)
      setArchives(nextArchives)
      setScanConsole((current) => current ? { lines: appendConsoleLines(current.lines, scanResultLines(nextReport)), done: true } : current)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t('app.errors.scanCouldNotComplete')
      setError(message)
      setScanConsole((current) => current ? { lines: appendConsoleLines(current.lines, [{ id: 'r-error', text: message, tone: 'err', delay: 300 }]), done: true } : current)
    } finally {
      setIsScanning(false)
    }
  }

  // Reconcile the frontend's legacy localStorage roots with the backend store.
  // The backend (app data dir) is the source of truth; localStorage is migrated
  // once and then kept only as the demo-mode fallback.
  useEffect(() => {
    void (async () => {
      const stored = await getWorkspaceRoots()
      if (stored === null) { void refresh(undefined, { showConsole: true }); return }
      if (stored.length === 0 && workspaceRoots.length > 0) {
        await saveWorkspaceRoots(workspaceRoots)
        void refresh(workspaceRoots, { showConsole: true })
      } else {
        setWorkspaceRoots(stored)
        void refresh(stored, { showConsole: true })
      }
    })()
  }, [])
  useEffect(() => { localStorage.setItem('skill-control-projects', JSON.stringify(workspaceRoots)) }, [workspaceRoots])

  const persistRoots = async (nextRoots: string[]) => {
    setWorkspaceRoots(nextRoots)
    await saveWorkspaceRoots(nextRoots)
    await refresh(nextRoots, { showConsole: true })
  }

  const filteredSkills = useMemo(() => (report?.skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const inventories = useMemo(() => (report ? groupInstallationsByProject(report) : []), [report])
  const filteredInventories = useMemo(() => inventories.filter((inventory) => `${inventory.name} ${inventory.path}`.toLowerCase().includes(search.toLowerCase())), [inventories, search])
  const globalSkills = useMemo(() => (report?.skills ?? [])
    .filter((skill) => skill.installations.some((installation) => installation.scope === 'user'))
    .sort((a, b) => a.name.localeCompare(b.name)), [report])
  const filteredGlobalSkills = useMemo(() => globalSkills.filter((skill) => `${skill.name} ${skill.description} ${skill.installations.map((installation) => installation.path).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [globalSkills, search])
  const selected = report?.skills.find((skill) => skill.id === selectedId) ?? null
  const selectedInventory = selectedProjectPath ? inventories.find((inventory) => inventory.path === selectedProjectPath) ?? null : null
  const projects = report?.projects.length ? report.projects : workspaceRoots.map(fallbackProject)
  const isDemo = isDemoMode()

  const requestDisable = async (installation: Installation) => {
    try {
      setModal({ kind: 'disable', installation, preview: await previewDisable(installation) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.couldNotPrepareChange'))
    }
  }

  const requestLocalize = (skill: Skill, installation: Installation) => {
    if (!projects.length) {
      setError(t('app.errors.addProjectFirst'))
      return
    }
    setModal({ kind: 'localize', skill, source: installation })
  }

  const inspectSkill = (id: string) => {
    setSelectedId(id)
    setView('map')
  }

  const analyzeProject = async (inventory: ProjectInventory) => {
    setAnalyzingPath(inventory.path)
    setError(null)
    try {
      const installedIds = [...new Set([...inventory.skills.map((entry) => entry.skill.id), ...inventory.globalSkills.map((skill) => skill.id)])]
      // Give the detection console time to play its sequence even on instant scans.
      const [result] = await Promise.all([detectStack(inventory.path, installedIds), wait(1900)])
      setAnalyses((current) => ({ ...current, [inventory.path]: { result, at: new Date().toISOString() } }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.projectCouldNotBeAnalyzed'))
    } finally {
      setAnalyzingPath(null)
    }
  }

  const applyModal = async (scope: Scope = 'user', target: InstallTarget = 'all', projectPath?: string) => {
    if (!modal) return
    setApplying(true)
    // Let the in-modal console play its verification sequence before closing.
    const minWait = wait(3000)
    try {
      if (modal.kind === 'disable') {
        const archive = await quarantineSkill(modal.installation)
        await minWait
        setRecentArchive(archive)
        setNotice(t('app.notices.quarantined'))
      } else if (modal.kind === 'localize') {
        const destination = await copySkillToProject(modal.source, projectPath ?? '')
        await minWait
        setNotice(t('app.notices.localizeCopied', { name: modal.skill.name, destination }))
      } else if (modal.kind === 'install-listed') {
        const installedPaths = await installListedSkill(modal.recommendation.skillId, scope, target, projectPath)
        await minWait
        setNotice(t('app.notices.installVerified', { skillId: modal.recommendation.skillId, copiesSuffix: installedPaths.length > 1 ? t('common.copies', { count: installedPaths.length }) : '' }))
        setModal(null)
        await refresh()
        // Re-mark this recommendation as installed without forcing a re-scan of the stack.
        setAnalyses((current) => {
          const analysis = current[modal.projectPath]
          if (!analysis) return current
          return {
            ...current,
            [modal.projectPath]: {
              ...analysis,
              result: {
                ...analysis.result,
                recommendations: analysis.result.recommendations.map((recommendation) =>
                  recommendation.skillId === modal.recommendation.skillId ? { ...recommendation, installed: true } : recommendation)
              }
            }
          }
        })
        return
      } else {
        const installedPaths = await installCatalogSkill(modal.skill.id, scope, target, projectPath)
        await minWait
        const location = scope === 'project' ? projects.find((project) => project.path === projectPath)?.name ?? t('common.project') : t('common.global')
        const coverage = target === 'all' ? t('common.allCompatibleAgents') : target
        setNotice(t('app.notices.installed', { name: modal.skill.name, coverage, location, copiesSuffix: installedPaths.length > 1 ? t('common.copies', { count: installedPaths.length }) : '' }))
      }
      setModal(null)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.changeCouldNotBeApplied'))
    } finally {
      setApplying(false)
    }
  }

  const trustExactVersion = async (installation: Installation) => {
    try {
      await trustSkillVersion(installation)
      setNotice(t('app.notices.trusted'))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.versionCouldNotBeTrusted'))
    }
  }

  const checkReputation = async () => {
    if (!selected) return
    try {
      const reputation = await checkOnlineReputation(selected)
      const externalStatus: SecurityStatus = reputation.verdict === 'High risk'
        ? 'Blocked'
        : reputation.auditedHash && !reputation.hashMatches
          ? 'Stale'
          : selected.securityStatus
      setReport((current) => current ? {
        ...current,
        skills: current.skills.map((skill) => skill.id === selected.id ? { ...skill, externalReputation: reputation, securityStatus: externalStatus } : skill)
      } : current)
      setNotice(t('app.notices.reputationChecked', { name: selected.name }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.reputationCouldNotBeChecked'))
    }
  }

  const addWorkspaceRoots = async () => {
    try {
      const selectedProjects = await chooseProjects()
      if (!selectedProjects.length) return
      const additions = selectedProjects.filter((project, index) => selectedProjects.indexOf(project) === index && !workspaceRoots.includes(project))
      if (!additions.length) {
        setNotice(t('app.notices.foldersAlreadyAdded'))
        return
      }
      await persistRoots([...workspaceRoots, ...additions])
      setNotice(t('app.notices.foldersAdded', { count: additions.length }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.couldNotAddFolder'))
    }
  }

  const removeWorkspaceRoot = async (root: string) => {
    if (selectedProjectPath && selectedProjectPath.replace(/\\/g, '/').startsWith(root.replace(/\\/g, '/'))) setSelectedProjectPath(null)
    await persistRoots(workspaceRoots.filter((existing) => existing !== root))
    setNotice(t('app.notices.folderRemoved'))
  }

  const restoreArchive = async (archive: ArchiveEntry) => {
    try {
      await restoreSkill(archive)
      setRecentArchive(null)
      setNotice(t('app.notices.skillRestored'))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.errors.skillCouldNotBeRestored'))
    }
  }

  return <main className="app-shell">
    <Sidebar view={view} onChange={(nextView) => { setView(nextView); setSelectedProjectPath(null) }} />
    <section className="workspace">
      <TopBar view={view} search={search} onSearch={setSearch} onScan={() => void refresh(undefined, { showConsole: true })} onAddProject={() => void addWorkspaceRoots()} projectCount={report?.projects.length ?? workspaceRoots.length} isScanning={isScanning} />
      {isDemo && <div className="demo-banner" role="status"><span>◒</span>{t('app.demoBanner')}</div>}
      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} action={recentArchive ? { label: t('common.undo'), onClick: () => void restoreArchive(recentArchive) } : undefined} onDismiss={() => setNotice(null)} />}
      {isScanning && !report ? <Loading /> : <div className="page-content">
        {view === 'projects' && (selectedInventory
          ? <ProjectDetail inventory={selectedInventory} findings={report?.findings ?? []} analysis={analyses[selectedInventory.path] ?? null} analyzing={analyzingPath === selectedInventory.path} onAnalyze={() => void analyzeProject(selectedInventory)} onBack={() => setSelectedProjectPath(null)} onInspect={inspectSkill} onQuarantine={(installation) => void requestDisable(installation)} onLocalize={requestLocalize} onInstallRecommendation={(recommendation) => setModal({ kind: 'install-listed', recommendation, projectPath: selectedInventory.path })} />
          : <Projects inventories={filteredInventories} findings={report?.findings ?? []} globalSkills={filteredGlobalSkills} workspaceRoots={workspaceRoots} isDemo={isDemo} onAddFolder={() => void addWorkspaceRoots()} onRemoveFolder={(root) => void removeWorkspaceRoot(root)} onOpen={setSelectedProjectPath} onInspect={inspectSkill} onLocalize={requestLocalize} onQuarantine={(installation) => void requestDisable(installation)} />)}
        {view === 'overview' && report && <Overview report={report} onViewHealth={() => setView('health')} onViewMap={() => setView('map')} />}
        {view === 'map' && report && <SkillMap skills={filteredSkills} report={report} projects={projects} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === 'discover' && <Discover query={search} onInstall={(skill) => setModal({ kind: 'install', skill })} />}
        {view === 'health' && report && <Health query={search} report={report} archives={archives} onRestore={(archive) => void restoreArchive(archive)} onSelect={(id) => { setSelectedId(id); setView('map') }} />}
        {!report && <Empty icon="!" title={t('app.errors.noReport')} detail={t('app.errors.runScan')} />}
      </div>}
    </section>
    {view === 'map' && selected && report && <Inspector skill={selected} findings={getSkillHealth(selected, report.findings)} canLocalize={projects.length > 0} onLocalize={(installation) => selected && requestLocalize(selected, installation)} onDisable={requestDisable} onTrust={(installation) => void trustExactVersion(installation)} onCheckReputation={() => void checkReputation()} />}
    {modal && <ChangeModal modal={modal} projects={projects} applying={applying} onCancel={() => setModal(null)} onApply={applyModal} />}
    {scanConsole && <div className="console-overlay" role="presentation">
      <ProcessConsole title={t('app.scan.title')} lines={scanConsole.lines} done={scanConsole.done} onSettled={() => setTimeout(() => setScanConsole(null), 900)} />
    </div>}
  </main>
}
