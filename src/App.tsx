import { useEffect, useMemo, useState } from 'react'
import { ChangeModal, type ModalState } from './components/ChangeModal'
import { Discover } from './components/Discover'
import { Health } from './components/Health'
import { Inspector } from './components/Inspector'
import { Sidebar, TopBar, type View } from './components/layout'
import { Overview } from './components/Overview'
import { Empty, Banner, Loading } from './components/shared'
import { SkillMap } from './components/SkillMap'
import { chooseProject, disableSkill, installCatalogSkill, listArchives, previewDisable, restoreSkill, scanSkills } from './lib/desktop'
import { getSkillHealth } from './lib/skill-utils'
import type { ArchiveEntry, Installation, ScanReport } from './lib/types'

const loadProjects = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('skill-control-projects') ?? '[]')
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
  } catch { return [] }
}

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isScanning, setIsScanning] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState(loadProjects)
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [recentArchive, setRecentArchive] = useState<ArchiveEntry | null>(null)

  const applyReport = (next: ScanReport) => {
    setReport(next)
    setSelectedId((current) => current && next.skills.some((skill) => skill.id === current) ? current : next.skills[0]?.id ?? null)
  }

  const refresh = async (projectPaths = projects) => {
    setIsScanning(true)
    setError(null)
    try {
      const [nextReport, nextArchives] = await Promise.all([scanSkills(projectPaths), listArchives()])
      applyReport(nextReport)
      setArchives(nextArchives)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scan could not complete.')
    } finally {
      setIsScanning(false)
    }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => { localStorage.setItem('skill-control-projects', JSON.stringify(projects)) }, [projects])

  const filteredSkills = useMemo(() => (report?.skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const selected = report?.skills.find((skill) => skill.id === selectedId) ?? null

  const requestDisable = async (installation: Installation) => {
    try {
      setModal({ kind: 'disable', installation, preview: await previewDisable(installation) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare this change.')
    }
  }

  const applyModal = async (target?: string, projectPath?: string) => {
    if (!modal) return
    try {
      if (modal.kind === 'disable') {
        const archive = await disableSkill(modal.installation)
        setRecentArchive(archive)
        setNotice('Skill disabled and retained in the local archive.')
      } else {
        await installCatalogSkill(modal.skill.id, target ?? 'agents', projectPath)
        setNotice(`${modal.skill.name} installed and validated.`)
      }
      setModal(null)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be applied.')
    }
  }

  const addProject = async () => {
    try {
      const project = await chooseProject()
      if (!project) return
      if (projects.includes(project)) {
        setNotice('That project is already part of this workspace.')
        return
      }
      const nextProjects = [...projects, project]
      setProjects(nextProjects)
      await refresh(nextProjects)
      setNotice(`Added ${project.split('/').slice(-1)[0]} to this workspace.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the selected project.')
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
      <TopBar view={view} search={search} onSearch={setSearch} onScan={() => void refresh()} onAddProject={() => void addProject()} projectCount={projects.length} isScanning={isScanning} />
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
    {view === 'map' && selected && report && <Inspector skill={selected} findings={getSkillHealth(selected, report.findings)} onDisable={requestDisable} />}
    {modal && <ChangeModal modal={modal} projects={projects} onCancel={() => setModal(null)} onApply={applyModal} />}
  </main>
}
