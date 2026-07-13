import { useState } from 'react'
import { agentLabels, formatTokenCount, projectName, securityStatusClass } from '../lib/skill-utils'
import type { Finding, Installation, Skill } from '../lib/types'
import { InspectorSection } from './shared'

export function Inspector({ skill, findings, canLocalize, onLocalize, onDisable, onTrust }: {
  skill: Skill
  findings: Finding[]
  canLocalize: boolean
  onLocalize: (installation: Installation) => void
  onDisable: (installation: Installation) => void
  onTrust: (installation: Installation) => void
}) {
  const [showFiles, setShowFiles] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const preferredSource = skill.installations.find((installation) => installation.scope === 'user') ?? skill.installations[0]
  const hashes = [...new Set(skill.installations.map((installation) => installation.contentHashSha256))]
  const exactVersionReviewed = skill.provenance.reviewedHash === skill.contentHashSha256
  const canTrust = Boolean(preferredSource) && skill.securityStatus !== 'Blocked' && !exactVersionReviewed

  return <aside className="inspector">
    <div className="inspector-head"><div><p className="eyebrow">Skill inspector</p><h2>{skill.name}</h2></div><span className={`health-pill security-${securityStatusClass(skill.securityStatus)}`}>{skill.securityStatus}</span></div>
    <p className="inspector-description">{skill.description || 'No description is available.'}</p>
    {preferredSource && <div className="inspector-actions"><button className="primary-button compact" disabled={!canLocalize} title={canLocalize ? `Copy the ${agentLabels[preferredSource.agent]} installation into a project` : 'Add a project folder first and keep a global source available'} onClick={() => onLocalize(preferredSource)}>Install in project</button></div>}

    <InspectorSection title="Security">
      <div className="security-summary"><strong>Security status: {skill.securityStatus}</strong><span>Local deterministic scan · no scripts executed</span></div>
      <div className="provenance-grid">
        <span>Origin</span><code title={skill.provenance.sourceUrl}>{skill.provenance.sourceRepository ?? skill.source ?? 'Unknown origin'}</code>
        <span>Commit</span><code>{skill.provenance.sourceCommit ?? 'Not recorded'}</code>
        {skill.provenance.sourceRef && <><span>Ref</span><code>{skill.provenance.sourceRef}</code></>}
        <span>SHA-256</span><code className="hash-value">{skill.contentHashSha256}</code>
        <span>Reviewed hash</span><code>{exactVersionReviewed ? `${skill.provenance.reviewedHash} · ${skill.provenance.reviewedAt ?? 'locally'}` : 'No exact-version review'}</code>
      </div>
      <div className="capability-heading"><strong>Capabilities</strong><small>Declared from local content</small></div>
      <ul className="capability-list">{skill.capabilities.map((capability) => <li key={capability}><span className={capability === 'Access credentials' || capability === 'Write outside project' ? 'capability-warning' : 'capability-ok'}>{capability === 'Access credentials' || capability === 'Write outside project' ? '⚠' : '✓'}</span>{capability}</li>)}</ul>
      {!skill.capabilities.includes('Access credentials') && <p className="capability-note">✓ No credential access declared</p>}
      <div className="external-audit-note"><strong>External audits</strong><span>Not checked · optional online reputation is not configured.</span></div>
      <div className="security-actions">
        <button className="secondary-button compact" onClick={() => setShowFiles((current) => !current)}>{showFiles ? 'Hide files' : 'Review files'}</button>
        {hashes.length > 1 && <button className="secondary-button compact" onClick={() => setShowChanges((current) => !current)}>{showChanges ? 'Hide changes' : 'View changes'}</button>}
        {preferredSource && <button className="danger-button compact" onClick={() => onDisable(preferredSource)}>Quarantine</button>}
        {preferredSource && <button className="secondary-button compact" disabled={!canTrust} title={skill.securityStatus === 'Blocked' ? 'Blocked versions cannot be trusted' : undefined} onClick={() => onTrust(preferredSource)}>Trust this exact version</button>}
      </div>
      {showChanges && <div className="change-hash-list"><strong>Installed copies do not share one hash</strong>{skill.installations.map((installation) => <span key={installation.id}><code>{installation.contentHashSha256}</code> · {installation.path}</span>)}</div>}
    </InspectorSection>

    <InspectorSection title="Installed in">{skill.installations.map((installation) => <div className="location" key={installation.id}><span><i className={`scope-dot ${installation.scope}`} />{installation.scope === 'project' ? `${projectName(installation.projectPath)} · Project` : 'Global'} · {agentLabels[installation.agent]}{installation.modified ? ' · differs' : ''}</span><code title={installation.path}>{installation.path}</code><button className="icon-button" aria-label={`Quarantine ${skill.name} from ${installation.path}`} onClick={() => onDisable(installation)}>⊘</button></div>)}</InspectorSection>
    <InspectorSection title="Context footprint"><div className="token-number">{formatTokenCount(skill.contextTokens)} <small>estimated tokens</small></div><p className="muted-copy">The estimate is based on SKILL.md. Project scope reduces where a skill is discoverable; actual loading behavior still depends on the agent.</p></InspectorSection>
    {showFiles && <InspectorSection title="Files"><ul className="file-list">{skill.files.map((file) => <li key={file}><span>⌁</span>{file}{skill.executableScripts.includes(file) && <b>executable</b>}{skill.invokedScripts.includes(file) && <b>invoked</b>}</li>)}</ul></InspectorSection>}
    <InspectorSection title="Local findings">{findings.length ? <ul className="finding-list">{findings.map((finding) => <li key={finding.id}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div></li>)}</ul> : <p className="healthy-copy">✓ No local findings for this exact copy.</p>}</InspectorSection>
  </aside>
}
