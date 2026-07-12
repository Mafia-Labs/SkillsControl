import { agentLabels, formatTokenCount, healthClass, healthLabel } from '../lib/skill-utils'
import type { Finding, Installation, Skill } from '../lib/types'
import { InspectorSection } from './shared'

export function Inspector({ skill, findings, onDisable }: { skill: Skill, findings: Finding[], onDisable: (installation: Installation) => void }) {
  return <aside className="inspector">
    <div className="inspector-head"><div><p className="eyebrow">Skill inspector</p><h2>{skill.name}</h2></div><span className={`health-pill ${healthClass(skill, findings)}`}>{healthLabel(skill, findings)}</span></div>
    <p className="inspector-description">{skill.description || 'No description is available.'}</p>
    <InspectorSection title="Installed in">{skill.installations.map((installation) => <div className="location" key={installation.id}><span><i className={`scope-dot ${installation.scope}`} />{installation.scope === 'project' ? 'Project' : 'Global'} · {agentLabels[installation.agent]}</span><code title={installation.path}>{installation.path}</code><button className="icon-button" aria-label={`Disable ${skill.name} from ${installation.path}`} onClick={() => onDisable(installation)}>⊘</button></div>)}</InspectorSection>
    <InspectorSection title="Context footprint"><div className="token-number">{formatTokenCount(skill.contextTokens)} <small>estimated tokens</small></div><p className="muted-copy">Catalog metadata is loaded first. Full instructions load only when an agent activates this skill.</p></InspectorSection>
    <InspectorSection title="Files"><ul className="file-list">{skill.files.map((file) => <li key={file}><span>⌁</span>{file}{skill.executableScripts.includes(file) && <b>executable</b>}</li>)}</ul></InspectorSection>
    <InspectorSection title="Health">{findings.length ? <ul className="finding-list">{findings.map((finding) => <li key={finding.id}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div></li>)}</ul> : <p className="healthy-copy">✓ Structure looks valid and no risks were detected.</p>}</InspectorSection>
  </aside>
}
