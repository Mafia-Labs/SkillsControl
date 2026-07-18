import { useEffect, useMemo, useState } from 'react'
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
  { id: 'cmd', text: 'skillctl scan --workspace', tone: 'cmd', delay: 120 },
  { id: 'roots', text: 'Locating agent roots · ~/.claude · ~/.agents', tone: 'step', delay: 620 },
  { id: 'walk', text: rootCount ? `Walking ${rootCount} workspace folder${rootCount === 1 ? '' : 's'}` : 'Walking global scopes', tone: 'step', delay: 430 },
  { id: 'hash', text: 'Hashing skill contents · SHA-256', tone: 'step', delay: 460 },
  { id: 'checks', text: 'Running local security checks', tone: 'step', delay: 470 }
]

const scanResultLines = (report: ScanReport): ConsoleLine[] => {
  const locations = report.skills.reduce((total, skill) => total + skill.installations.length, 0)
  return [
    { id: 'r-skills', text: `${report.skills.length} skill${report.skills.length === 1 ? '' : 's'} found across ${locations} location${locations === 1 ? '' : 's'}`, tone: 'ok', delay: 340 },
    { id: 'r-projects', text: `${report.projects.length} project folder${report.projects.length === 1 ? '' : 's'} mapped`, tone: 'ok', delay: 300 },
    report.findings.length
      ? { id: 'r-findings', text: `${report.findings.length} finding${report.findings.length === 1 ? '' : 's'} flagged for review`, tone: 'warn', delay: 320 }
      : { id: 'r-findings', text: 'No security findings', tone: 'ok', delay: 320 },
    { id: 'r-done', text: 'Report ready', tone: 'ok', delay: 380 }
  ]
}

export default function App() {
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
      const message = reason instanceof Error ? reason.message : 'The scan could not complete.'
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
  const selected = report?.skills.find((skill) => skill.id === selectedId) ?? null
  const selectedInventory = selectedProjectPath ? inventories.find((inventory) => inventory.path === selectedProjectPath) ?? null : null
  const projects = report?.projects.length ? report.projects : workspaceRoots.map(fallbackProject)
  const isDemo = isDemoMode()

  const requestDisable = async (installation: Installation) => {
    try {
      setModal({ kind: 'disable', installation, preview: await previewDisable(installation) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare this change.')
    }
  }

  const requestLocalize = (skill: Skill, installation: Installation) => {
    if (!projects.length) {
      setError('Add a project or workspace folder before creating a local copy.')
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
      setError(reason instanceof Error ? reason.message : 'The project could not be analyzed.')
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
        setNotice('Skill quarantined and retained in the local archive.')
      } else if (modal.kind === 'localize') {
        const destination = await copySkillToProject(modal.source, projectPath ?? '')
        await minWait
        setNotice(`${modal.skill.name} copied to ${destination}. Verify it, then quarantine the global copy if it is no longer needed.`)
      } else if (modal.kind === 'install-listed') {
        const installedPaths = await installListedSkill(modal.recommendation.skillId, scope, target, projectPath)
        await minWait
        setNotice(`${modal.recommendation.skillId} installed and verified against the curated list${installedPaths.length > 1 ? ` (${installedPaths.length} copies)` : ''}.`)
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
        const location = scope === 'project' ? projects.find((project) => project.path === projectPath)?.name ?? 'project' : 'global scope'
        const coverage = target === 'all' ? 'all compatible agents' : target
        setNotice(`${modal.skill.name} installed for ${coverage} in ${location}${installedPaths.length > 1 ? ` (${installedPaths.length} copies)` : ''}.`)
      }
      setModal(null)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be applied.')
    } finally {
      setApplying(false)
    }
  }

  const trustExactVersion = async (installation: Installation) => {
    try {
      await trustSkillVersion(installation)
      setNotice('This exact content hash is now trusted locally. A changed copy will no longer inherit that trust.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This version could not be trusted.')
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
      setNotice(`Online reputation checked for ${selected.name}. The result only covers the matching local SHA-256.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not check online reputation.')
    }
  }

  const addWorkspaceRoots = async () => {
    try {
      const selectedProjects = await chooseProjects()
      if (!selectedProjects.length) return
      const additions = selectedProjects.filter((project, index) => selectedProjects.indexOf(project) === index && !workspaceRoots.includes(project))
      if (!additions.length) {
        setNotice('Those folders are already part of this workspace.')
        return
      }
      await persistRoots([...workspaceRoots, ...additions])
      setNotice(`Added ${additions.length} project folder${additions.length === 1 ? '' : 's'} and scanned nested scopes.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the selected folder.')
    }
  }

  const removeWorkspaceRoot = async (root: string) => {
    if (selectedProjectPath && selectedProjectPath.replace(/\\/g, '/').startsWith(root.replace(/\\/g, '/'))) setSelectedProjectPath(null)
    await persistRoots(workspaceRoots.filter((existing) => existing !== root))
    setNotice('Folder removed from the workspace.')
  }

  const restoreArchive = async (archive: ArchiveEntry) => {
    try {
      await restoreSkill(archive)
      setRecentArchive(null)
      setNotice('Skill restored to its original location.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The skill could not be restored.')
    }
  }

  return <main className="app-shell">
    <Sidebar view={view} onChange={setView} />
    <section className="workspace">
      <TopBar view={view} search={search} onSearch={setSearch} onScan={() => void refresh(undefined, { showConsole: true })} onAddProject={() => void addWorkspaceRoots()} projectCount={report?.projects.length ?? workspaceRoots.length} isScanning={isScanning} />
      {isDemo && <div className="demo-banner" role="status"><span>◒</span>Demo mode — you're seeing example data, not your real skills.</div>}
      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} action={recentArchive ? { label: 'Undo', onClick: () => void restoreArchive(recentArchive) } : undefined} onDismiss={() => setNotice(null)} />}
      {isScanning && !report ? <Loading /> : <div className="page-content">
        {view === 'projects' && (selectedInventory
          ? <ProjectDetail inventory={selectedInventory} findings={report?.findings ?? []} analysis={analyses[selectedInventory.path] ?? null} analyzing={analyzingPath === selectedInventory.path} onAnalyze={() => void analyzeProject(selectedInventory)} onBack={() => setSelectedProjectPath(null)} onInspect={inspectSkill} onQuarantine={(installation) => void requestDisable(installation)} onLocalize={requestLocalize} onInstallRecommendation={(recommendation) => setModal({ kind: 'install-listed', recommendation, projectPath: selectedInventory.path })} />
          : <Projects inventories={filteredInventories} findings={report?.findings ?? []} workspaceRoots={workspaceRoots} isDemo={isDemo} onAddFolder={() => void addWorkspaceRoots()} onRemoveFolder={(root) => void removeWorkspaceRoot(root)} onOpen={setSelectedProjectPath} />)}
        {view === 'overview' && report && <Overview report={report} onViewHealth={() => setView('health')} onViewMap={() => setView('map')} />}
        {view === 'map' && report && <SkillMap skills={filteredSkills} report={report} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === 'discover' && <Discover query={search} onInstall={(skill) => setModal({ kind: 'install', skill })} />}
        {view === 'health' && report && <Health query={search} report={report} archives={archives} onRestore={(archive) => void restoreArchive(archive)} onSelect={(id) => { setSelectedId(id); setView('map') }} />}
        {!report && <Empty icon="!" title="No report available" detail="Run another scan to inspect your local skills." />}
      </div>}
    </section>
    {view === 'map' && selected && report && <Inspector skill={selected} findings={getSkillHealth(selected, report.findings)} canLocalize={projects.length > 0} onLocalize={(installation) => selected && requestLocalize(selected, installation)} onDisable={requestDisable} onTrust={(installation) => void trustExactVersion(installation)} onCheckReputation={() => void checkReputation()} />}
    {modal && <ChangeModal modal={modal} projects={projects} applying={applying} onCancel={() => setModal(null)} onApply={applyModal} />}
    {scanConsole && <div className="console-overlay" role="presentation">
      <ProcessConsole title="skill-control — scan" lines={scanConsole.lines} done={scanConsole.done} onSettled={() => setTimeout(() => setScanConsole(null), 900)} />
    </div>}
  </main>
}
