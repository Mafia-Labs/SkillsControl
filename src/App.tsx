import { useEffect, useMemo, useState } from 'react'
import { ChangeModal, type ModalState } from './components/ChangeModal'
import { Discover } from './components/Discover'
import { Health } from './components/Health'
import { Inspector } from './components/Inspector'
import { Sidebar, TopBar, type View } from './components/layout'
import { Overview } from './components/Overview'
import { Empty, Banner, Loading } from './components/shared'
import { SkillMap } from './components/SkillMap'
import { checkOnlineReputation, chooseProjects, copySkillToProject, installCatalogSkill, listArchives, previewDisable, quarantineSkill, restoreSkill, scanSkills, trustSkillVersion } from './lib/desktop'
import { getSkillHealth } from './lib/skill-utils'
import type { ArchiveEntry, Installation, InstallTarget, ProjectSummary, ScanReport, Scope, SecurityStatus } from './lib/types'

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

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceRoots, setWorkspaceRoots] = useState(loadWorkspaceRoots)
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [recentArchive, setRecentArchive] = useState<ArchiveEntry | null>(null)

  const applyReport = (next: ScanReport) => {
    setReport(next)
    setSelectedId((current) => current && next.skills.some((skill) => skill.id === current) ? current : next.skills[0]?.id ?? null)
  }

  const refresh = async (roots = workspaceRoots) => {
    setIsScanning(true)
    setError(null)
    try {
      const [nextReport, nextArchives] = await Promise.all([scanSkills(roots), listArchives()])
      applyReport(nextReport)
      setArchives(nextArchives)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scan could not complete.')
    } finally {
      setIsScanning(false)
    }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => { localStorage.setItem('skill-control-projects', JSON.stringify(workspaceRoots)) }, [workspaceRoots])

  const filteredSkills = useMemo(() => (report?.skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const selected = report?.skills.find((skill) => skill.id === selectedId) ?? null
  const projects = report?.projects.length ? report.projects : workspaceRoots.map(fallbackProject)

  const requestDisable = async (installation: Installation) => {
    try {
      setModal({ kind: 'disable', installation, preview: await previewDisable(installation) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare this change.')
    }
  }

  const requestLocalize = (installation: Installation) => {
    if (!selected) return
    if (!projects.length) {
      setError('Add a project or workspace folder before creating a local copy.')
      return
    }
    setModal({ kind: 'localize', skill: selected, source: installation })
  }

  const applyModal = async (scope: Scope = 'user', target: InstallTarget = 'all', projectPath?: string) => {
    if (!modal) return
    try {
      if (modal.kind === 'disable') {
        const archive = await quarantineSkill(modal.installation)
        setRecentArchive(archive)
        setNotice('Skill quarantined and retained in the local archive.')
      } else if (modal.kind === 'localize') {
        const destination = await copySkillToProject(modal.source, projectPath ?? '')
        setNotice(`${modal.skill.name} copied to ${destination}. Verify it, then quarantine the global copy if it is no longer needed.`)
      } else {
        const installedPaths = await installCatalogSkill(modal.skill.id, scope, target, projectPath)
        const location = scope === 'project' ? projects.find((project) => project.path === projectPath)?.name ?? 'project' : 'global scope'
        const coverage = target === 'all' ? 'all compatible agents' : target
        setNotice(`${modal.skill.name} installed for ${coverage} in ${location}${installedPaths.length > 1 ? ` (${installedPaths.length} copies)` : ''}.`)
      }
      setModal(null)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be applied.')
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
      const nextRoots = [...workspaceRoots, ...additions]
      setWorkspaceRoots(nextRoots)
      await refresh(nextRoots)
      setNotice(`Added ${additions.length} project folder${additions.length === 1 ? '' : 's'} and scanned nested scopes.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the selected folder.')
    }
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
      <TopBar view={view} search={search} onSearch={setSearch} onScan={() => void refresh()} onAddProject={() => void addWorkspaceRoots()} projectCount={report?.projects.length ?? workspaceRoots.length} isScanning={isScanning} />
      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} action={recentArchive ? { label: 'Undo', onClick: () => void restoreArchive(recentArchive) } : undefined} onDismiss={() => setNotice(null)} />}
      {isScanning && !report ? <Loading /> : <div className="page-content">
        {view === 'overview' && report && <Overview report={report} onViewHealth={() => setView('health')} onViewMap={() => setView('map')} />}
        {view === 'map' && report && <SkillMap skills={filteredSkills} report={report} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === 'discover' && <Discover query={search} onInstall={(skill) => setModal({ kind: 'install', skill })} />}
        {view === 'health' && report && <Health query={search} report={report} archives={archives} onRestore={(archive) => void restoreArchive(archive)} onSelect={(id) => { setSelectedId(id); setView('map') }} />}
        {!report && <Empty icon="!" title="No report available" detail="Run another scan to inspect your local skills." />}
      </div>}
    </section>
    {view === 'map' && selected && report && <Inspector skill={selected} findings={getSkillHealth(selected, report.findings)} canLocalize={projects.length > 0} onLocalize={requestLocalize} onDisable={requestDisable} onTrust={(installation) => void trustExactVersion(installation)} onCheckReputation={() => void checkReputation()} />}
    {modal && <ChangeModal modal={modal} projects={projects} onCancel={() => setModal(null)} onApply={applyModal} />}
  </main>
}
