import { useEffect, useState } from 'react'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'

// ─── Parse markdown into date sections ───────────────────────
type DateSection = {
  title: string // e.g. "2026-02-27 세션"
  content: string
}

function parseDateSections(text: string): DateSection[] {
  const lines = text.split('\n')
  const sections: DateSection[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    // Match ## date heading (e.g. ## 2026-02-27 세션)
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2}.*)$/)
    if (dateMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join('\n') })
      }
      currentTitle = dateMatch[1]
      currentLines = []
    } else if (currentTitle) {
      currentLines.push(line)
    } else {
      // Lines before the first date section (title etc.) — skip or include
      if (line.startsWith('# ')) continue // skip top-level heading
      if (line.trim()) currentLines.push(line)
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') })
  }

  // If no date sections found, return entire content as one section
  if (sections.length === 0 && text.trim()) {
    sections.push({ title: '전체', content: text })
  }

  return sections
}

// ─── Render markdown content ─────────────────────────────────
function renderContent(text: string): JSX.Element[] {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let tableRows: string[][] = []
  let tableHeaders: string[] = []
  let inTable = false

  const flushTable = (): void => {
    if (tableHeaders.length === 0) return
    elements.push(
      <div key={`tbl-${elements.length}`} style={{
        overflowX: 'auto', marginBottom: spacing.md, borderRadius: radius.sm,
        border: `1px solid ${colors.border.primary}`
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              {tableHeaders.map((h, i) => (
                <th key={i} style={{
                  padding: '6px 8px', textAlign: 'left',
                  background: colors.bg.card, color: colors.text.secondary,
                  borderBottom: `1px solid ${colors.border.primary}`, fontWeight: 600, whiteSpace: 'nowrap'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '5px 8px', color: colors.text.secondary,
                    borderBottom: `1px solid ${colors.border.subtle}`
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableHeaders = []
    tableRows = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells.every((c) => /^[-:]+$/.test(c))) { inTable = true; continue }
      if (!inTable) {
        tableHeaders = cells
        inTable = true
      } else {
        tableRows.push(cells)
      }
      continue
    }

    if (inTable) { flushTable(); inTable = false }

    if (line.startsWith('### ')) {
      elements.push(
        <div key={i} style={{ fontSize: 12, fontWeight: 600, color: colors.status.info, marginTop: 14, marginBottom: 6 }}>
          {line.replace('### ', '')}
        </div>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <div key={i} style={{ ...typography.subtitle, color: colors.text.primary, marginTop: spacing.lg, marginBottom: spacing.sm }}>
          {line.replace('## ', '')}
        </div>
      )
    } else if (line.startsWith('# ')) {
      elements.push(
        <div key={i} style={{
          ...typography.title, marginBottom: 10,
          color: colors.accent.primary
        }}>
          {line.replace('# ', '')}
        </div>
      )
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={i} style={{ ...typography.caption, color: colors.text.secondary, paddingLeft: 10, lineHeight: 1.7 }}>
          {'• ' + line.slice(2)}
        </div>
      )
    } else if (line.trim()) {
      elements.push(
        <div key={i} style={{ ...typography.caption, color: colors.text.tertiary, lineHeight: 1.6 }}>
          {line}
        </div>
      )
    }
  }
  if (inTable) flushTable()
  return elements
}

// ─── Collapsible Date Section ────────────────────────────────
function DateSectionCard({
  section,
  defaultOpen
}: {
  section: DateSection
  defaultOpen: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{
      marginBottom: spacing.sm,
      borderRadius: radius.md,
      border: `1px solid ${open ? colors.border.accent : colors.border.primary}`,
      overflow: 'hidden',
      transition: transition.fast
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left',
          padding: '10px 14px',
          background: open ? colors.bg.cardHover : colors.bg.elevated,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: transition.fast
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? colors.bg.cardHover : colors.bg.elevated }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: 12, transition: transition.fast }}>
            {open ? '▾' : '▸'}
          </span>
          <span style={{ ...typography.subtitle, fontSize: 12, color: colors.text.primary }}>
            {section.title}
          </span>
        </div>
      </button>
      {open && (
        <div style={{ padding: `${spacing.sm}px ${spacing.md}px ${spacing.md}px` }}>
          {renderContent(section.content)}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────
export default function HistoryTab(): JSX.Element {
  const [files, setFiles] = useState<Array<{ name: string; label: string }>>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    window.api.getMemoryFiles().then((f) => {
      setFiles(f)
      if (f.length > 0) {
        const first = f.find((x) => x.name === 'brainstorming.md') || f[0]
        setSelectedFile(first.name)
        window.api.getMemoryContent(first.name).then(setContent)
      }
    })
  }, [])

  const selectFile = (name: string): void => {
    setSelectedFile(name)
    window.api.getMemoryContent(name).then(setContent)
  }

  // Check if the content has date sections (## YYYY-MM-DD)
  const hasDateSections = /^## \d{4}-\d{2}-\d{2}/m.test(content)
  const dateSections = hasDateSections ? parseDateSections(content) : []

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{
        ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md
      }}>
        히스토리
      </div>

      {files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.text.tertiary, fontSize: 12 }}>
          메모리 기록이 없습니다
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {files.map((f) => (
              <button key={f.name} onClick={() => selectFile(f.name)}
                style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: radius.full,
                  background: selectedFile === f.name
                    ? colors.accent.primaryMuted
                    : colors.bg.card,
                  border: `1px solid ${selectedFile === f.name ? colors.border.accent : colors.border.primary}`,
                  color: selectedFile === f.name ? colors.accent.primary : colors.text.tertiary,
                  cursor: 'pointer', fontWeight: 500, transition: transition.fast
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {hasDateSections ? (
            // Date-grouped collapsible view
            <div>
              {dateSections.map((section, i) => (
                <DateSectionCard
                  key={section.title}
                  section={section}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          ) : (
            // Flat render for non-date content
            <div>{renderContent(content)}</div>
          )}
        </>
      )}
    </div>
  )
}
