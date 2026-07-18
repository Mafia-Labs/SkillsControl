import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type ConsoleTone = 'cmd' | 'step' | 'ok' | 'warn' | 'err' | 'out' | 'dim'

export type ConsoleLine = {
  id: string
  text: string
  tone?: ConsoleTone
  /** ms before this line appears once the previous one is visible */
  delay?: number
  /** right-aligned annotation, e.g. the technology that motivated a skill */
  detail?: string
}

const prefixes: Record<ConsoleTone, string> = { cmd: '$', step: '▸', ok: '✓', warn: '⚠', err: '✗', out: '', dim: '' }

// Append lines skipping ids already present, so overlapping runs
// (e.g. StrictMode double-invoking a mount effect) stay idempotent.
export const appendConsoleLines = (lines: ConsoleLine[], additions: ConsoleLine[]): ConsoleLine[] => {
  const existing = new Set(lines.map((line) => line.id))
  return [...lines, ...additions.filter((line) => !existing.has(line.id))]
}

/**
 * Terminal-style panel that reveals `lines` one by one on a timed schedule.
 * The parent appends result lines as real data arrives and flips `done`;
 * `onSettled` fires once everything is revealed and `done` is true.
 */
export function ProcessConsole({ title, lines, done, onSettled }: {
  title: string
  lines: ConsoleLine[]
  done: boolean
  onSettled?: () => void
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible >= lines.length) return
    const timer = setTimeout(() => setVisible((current) => Math.min(current + 1, lines.length)), lines[visible]?.delay ?? 300)
    return () => clearTimeout(timer)
  }, [visible, lines])

  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [visible])

  const settled = done && visible >= lines.length
  useEffect(() => {
    if (!settled) return
    const timer = setTimeout(() => onSettled?.(), 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])

  return <div className="process-console" role="log" aria-live="polite" aria-label={title}>
    <div className="console-chrome">
      <span className="console-dots"><i /><i /><i /></span>
      <span className="console-title">{title}</span>
    </div>
    <div className="console-body" ref={bodyRef}>
      {lines.slice(0, visible).map((line) => {
        const tone = line.tone ?? 'out'
        return <div className={`console-line tone-${tone}`} key={line.id}>
          {prefixes[tone] && <span className="console-prefix">{prefixes[tone]}</span>}
          <span className="console-text" style={tone === 'cmd' ? { ['--ch' as string]: line.text.length } : undefined}>{line.text}</span>
          {line.detail && <span className="console-detail">← {line.detail}</span>}
        </div>
      })}
      {!done && visible >= lines.length && <div className="console-line tone-dim console-working"><span className="console-spinner" /><span className="console-text">{t('common.working')}</span></div>}
      {!settled && done && <div className="console-line"><span className="console-cursor" /></div>}
      {settled && <div className="console-line"><span className="console-prefix tone-cmd">$</span><span className="console-cursor" /></div>}
    </div>
  </div>
}
