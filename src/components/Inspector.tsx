import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTokenCount, projectName, securityStatusClass } from '../lib/skill-utils'
import type { Agent, ExternalReputation, Finding, Installation, Skill } from '../lib/types'
import { InspectorSection } from './shared'

export function Inspector({ skill, findings, canLocalize, onLocalize, onDisable, onEdit, onReveal, onCopyHandoff, onTrust, onCheckReputation }: {
  skill: Skill
  findings: Finding[]
  canLocalize: boolean
  onLocalize: (installation: Installation) => void
  onDisable: (installation: Installation) => void
  onEdit: (installation: Installation) => void
  onReveal: (installation: Installation) => void
  onCopyHandoff: (skill: Skill, installation: Installation, agent: Agent) => void
  onTrust: (installation: Installation) => void
  onCheckReputation: () => void
}) {
  const { t } = useTranslation()
  const [showFiles, setShowFiles] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const preferredSource = skill.installations.find((installation) => installation.scope === 'user') ?? skill.installations[0]
  const hashes = [...new Set(skill.installations.map((installation) => installation.contentHashSha256))]
  const exactVersionReviewed = skill.provenance.reviewedHash === skill.contentHashSha256
  const canTrust = Boolean(preferredSource) && skill.securityStatus !== 'Blocked' && !exactVersionReviewed

  return <aside className="inspector">
    <div className="inspector-head"><div><p className="eyebrow">{t('inspector.eyebrow')}</p><h2>{skill.name}</h2></div><span className={`health-pill security-${securityStatusClass(skill.securityStatus)}`}>{t(`securityStatuses.${securityStatusClass(skill.securityStatus)}`, { defaultValue: skill.securityStatus })}</span></div>
    <p className="inspector-description">{skill.description || t('inspector.noDescription')}</p>
    {preferredSource && <div className="inspector-actions"><button className="primary-button compact" disabled={!canLocalize} title={canLocalize ? t('inspector.copyInstallation', { agent: t(`agents.${preferredSource.agent}`) }) : t('inspector.addProjectSource')} onClick={() => onLocalize(preferredSource)}>{t('inspector.installInProject')}</button></div>}

    <InspectorSection title={t('inspector.security')}>
      <div className="security-summary"><strong>{t('health.securityStatus', { status: t(`securityStatuses.${securityStatusClass(skill.securityStatus)}`, { defaultValue: skill.securityStatus }) })}</strong><span>{t('inspector.localScan')}</span></div>
      <div className="provenance-grid">
        <span>{t('inspector.origin')}</span><code title={skill.provenance.sourceUrl}>{skill.provenance.sourceRepository ?? skill.source ?? t('inspector.unknownOrigin')}</code>
        <span>{t('inspector.commit')}</span><code>{skill.provenance.sourceCommit ?? t('inspector.notRecorded')}</code>
        {skill.provenance.sourceRef && <><span>{t('inspector.ref')}</span><code>{skill.provenance.sourceRef}</code></>}
        <span>{t('inspector.sha256')}</span><code className="hash-value">{skill.contentHashSha256}</code>
        <span>{t('inspector.reviewedHash')}</span><code>{exactVersionReviewed ? `${skill.provenance.reviewedHash} · ${skill.provenance.reviewedAt ?? t('inspector.locally')}` : t('inspector.noExactReview')}</code>
      </div>
      <div className="capability-heading"><strong>{t('inspector.capabilities')}</strong><small>{t('inspector.declaredLocal')}</small></div>
      <ul className="capability-list">{skill.capabilities.map((capability) => <li key={capability}><span className={capability === 'Access credentials' || capability === 'Write outside project' ? 'capability-warning' : 'capability-ok'}>{capability === 'Access credentials' || capability === 'Write outside project' ? '⚠' : '✓'}</span>{t(`capabilities.${capability.replace(/\s+/g, '-')}`, { defaultValue: capability })}</li>)}</ul>
      {!skill.capabilities.includes('Access credentials') && <p className="capability-note">{t('inspector.noCredentialAccess')}</p>}
      <ExternalReputationPanel reputation={skill.externalReputation} canCheck={Boolean(skill.provenance.sourceRepository)} onCheck={onCheckReputation} />
      <div className="security-actions">
        <button className="secondary-button compact" onClick={() => setShowFiles((current) => !current)}>{showFiles ? t('inspector.hideFiles') : t('inspector.reviewFiles')}</button>
        {hashes.length > 1 && <button className="secondary-button compact" onClick={() => setShowChanges((current) => !current)}>{showChanges ? t('inspector.hideChanges') : t('inspector.viewChanges')}</button>}
        {preferredSource && <button className="danger-button compact" onClick={() => onDisable(preferredSource)}>{t('common.uninstall')}</button>}
        {preferredSource && <button className="secondary-button compact" disabled={!canTrust} title={skill.securityStatus === 'Blocked' ? t('inspector.blockedCannotTrust') : undefined} onClick={() => onTrust(preferredSource)}>{t('inspector.trustVersion')}</button>}
      </div>
      {showChanges && <div className="change-hash-list"><strong>{t('inspector.hashDivergence')}</strong>{skill.installations.map((installation) => <span key={installation.id}><code>{installation.contentHashSha256}</code> · {installation.path}</span>)}</div>}
    </InspectorSection>

    <InspectorSection title={t('inspector.installedIn')}>{skill.installations.map((installation) => <div className="location" key={installation.id}><span><i className={`scope-dot ${installation.scope}`} />{installation.scope === 'project' ? `${projectName(installation.projectPath)} · ${t('inspector.projectScope')}` : t('common.global')} · {t(`agents.${installation.agent}`)}{installation.modified ? ` · ${t('inspector.differs')}` : ''}</span><code title={installation.path}>{installation.path}</code><div className="location-actions"><button className="secondary-button compact" onClick={() => onEdit(installation)}>{t('inspector.editSkill')}</button><button className="secondary-button compact" onClick={() => onReveal(installation)}>{t('inspector.revealFolder')}</button><button className="secondary-button compact" onClick={() => onCopyHandoff(skill, installation, installation.agent)}>{t('inspector.copyHandoff', { agent: t(`agents.${installation.agent}`) })}</button><button className="danger-button compact" aria-label={t('inspector.quarantineFrom', { name: skill.name, path: installation.path })} onClick={() => onDisable(installation)}>{t('common.uninstall')}</button></div></div>)}</InspectorSection>
    <InspectorSection title={t('inspector.contextFootprint')}><div className="token-number">{formatTokenCount(skill.contextTokens)} <small>{t('inspector.estimatedTokens')}</small></div><p className="muted-copy">{t('inspector.contextDescription')}</p></InspectorSection>
    {showFiles && <InspectorSection title={t('inspector.files')}><ul className="file-list">{skill.files.map((file) => <li key={file}><span>⌁</span>{file}{skill.executableScripts.includes(file) && <b>{t('inspector.executable')}</b>}{skill.invokedScripts.includes(file) && <b>{t('inspector.invoked')}</b>}</li>)}</ul></InspectorSection>}
    <InspectorSection title={t('inspector.localFindings')}>{findings.length ? <ul className="finding-list">{findings.map((finding) => <li key={finding.id}><span className={`severity ${finding.severity}`} /><div><strong>{finding.title}</strong><small>{finding.detail}</small></div></li>)}</ul> : <p className="healthy-copy">{t('health.noFindingsExactCopy')}</p>}</InspectorSection>
  </aside>
}

function ExternalReputationPanel({ reputation, canCheck, onCheck }: { reputation?: ExternalReputation, canCheck: boolean, onCheck: () => void }) {
  const { t } = useTranslation()
  return <div className="external-audit-note">
    <strong>{t('inspector.externalReputation')}</strong>
    {!reputation ? <span>{t('inspector.notChecked')}</span> : <>
      <span className={`reputation-verdict reputation-${reputation.verdict.toLowerCase().replace(/\s+/g, '-')}`}>{reputation.verdict === 'High risk' ? t('reputation.verdictHighRisk') : reputation.verdict}</span>
      <span>{reputation.hashMatches ? t('inspector.hashMatches') : reputation.auditedHash ? t('inspector.hashNotCovered') : t('inspector.noAuditedHash')}</span>
      {reputation.audits.length > 0 && <div className="external-audit-list">{reputation.audits.map((audit) => <div className="external-audit-row" key={audit.provider}><span>{audit.provider}</span><b className={`audit-${audit.status.toLowerCase()}`}>{audit.status}{audit.riskLevel ? ` · ${audit.riskLevel}` : ''}</b></div>)}</div>}
      <code className="reputation-url">{reputation.skillUrl} · {t('inspector.checked', { date: reputation.checkedAt })}</code>
    </>}
    <button className="secondary-button compact" disabled={!canCheck} title={canCheck ? t('inspector.compareAudit') : t('inspector.addProvenance')} onClick={onCheck}>{t('inspector.checkOnline')}</button>
  </div>
}
