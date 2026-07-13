import type { ChangeEvent } from 'react'

export type View = 'overview' | 'map' | 'discover' | 'health'

const navigation: Array<{ id: View, label: string, icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'map', label: 'Skill Map', icon: '⊞' },
  { id: 'discover', label: 'Discover', icon: '⌕' },
  { id: 'health', label: 'Health', icon: '✦' }
]

export function Sidebar({ view, onChange }: { view: View, onChange: (view: View) => void }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">S</span><span>SkillsDock</span></div>
    <nav aria-label="Primary navigation">
      {navigation.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}>
        <span aria-hidden>{item.icon}</span>{item.label}
      </button>)}
    </nav>
    <div className="sidebar-footer"><span className="status-dot" /> Local-first<br /><small>No account connected</small></div>
  </aside>
}

export function TopBar({ view, search, onSearch, onScan, onAddProject, projectCount, isScanning }: {
  view: View
  search: string
  onSearch: (value: string) => void
  onScan: () => void
  onAddProject: () => void
  projectCount: number
  isScanning: boolean
}) {
  const title = navigation.find((item) => item.id === view)?.label ?? 'SkillsDock'
  const workspace = projectCount ? `Local workspace · ${projectCount} scope${projectCount === 1 ? '' : 's'} detected` : 'Local workspace'
  return <header className="topbar">
    <div><p className="eyebrow">{workspace}</p><h1>{title}</h1></div>
    <div className="top-actions">
      <label className="search"><span>⌕</span><input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => onSearch(event.target.value)} placeholder="Search skills" aria-label="Search skills" /></label>
      <button className="secondary-button project-button" onClick={onAddProject}>Add folder</button>
      <button className="secondary-button" onClick={onScan} disabled={isScanning}>{isScanning ? 'Scanning…' : 'Scan again'}</button>
    </div>
  </header>
}
