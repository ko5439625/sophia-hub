import { useEffect, useState } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'

export default function LinksTab(): JSX.Element {
  const { bookmarks, setBookmarks } = useHubStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')

  useEffect(() => {
    window.api.getBookmarks().then(setBookmarks)
  }, [setBookmarks])

  const handleAdd = (): void => {
    if (!newName || !newUrl) return
    const url = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`
    const updated = [...bookmarks, { name: newName, url }]
    setBookmarks(updated)
    window.api.saveBookmarks(updated)
    setNewName('')
    setNewUrl('')
    setAdding(false)
  }

  const handleDelete = (idx: number): void => {
    const updated = bookmarks.filter((_, i) => i !== idx)
    setBookmarks(updated)
    window.api.saveBookmarks(updated)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: radius.sm,
    border: `1px solid ${colors.border.primary}`, background: colors.bg.input,
    color: 'white', fontSize: 12, outline: 'none', fontFamily: 'Segoe UI, sans-serif',
    transition: transition.fast
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <span style={{
          ...typography.overline, color: colors.text.tertiary
        }}>
          즐겨찾기
        </span>
        <button onClick={() => setAdding(!adding)}
          style={{
            fontSize: 16, color: adding ? colors.status.error : colors.text.tertiary,
            background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1,
            transition: transition.fast, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: radius.sm
          }}
          onMouseEnter={(e) => { if (!adding) e.currentTarget.style.color = colors.text.secondary }}
          onMouseLeave={(e) => { if (!adding) e.currentTarget.style.color = colors.text.tertiary }}>
          {adding ? '✕' : '+'}
        </button>
      </div>

      {adding && (
        <div style={{
          padding: spacing.md, borderRadius: radius.md,
          background: colors.bg.elevated,
          border: `1px solid ${colors.border.accent}`,
          marginBottom: spacing.md
        }}>
          <input placeholder="이름 (예: GitHub)" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onFocus={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
            onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
            style={{ ...inputStyle, marginBottom: 6 }} />
          <input placeholder="URL (예: github.com)" value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            onFocus={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
            onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
            style={inputStyle} />
          <button onClick={handleAdd}
            style={{
              marginTop: spacing.sm, width: '100%', padding: '8px', borderRadius: radius.sm, border: 'none',
              background: colors.accent.primaryMuted,
              color: colors.accent.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600,
              transition: transition.fast, letterSpacing: 0.3
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 255, 0.25)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}>
            추가
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {bookmarks.map((bm, i) => (
          <div key={i}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: radius.md,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.subtle}`,
              cursor: 'pointer', transition: transition.fast
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bg.cardHover
              e.currentTarget.style.borderColor = `${colors.accent.primary}25`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.bg.elevated
              e.currentTarget.style.borderColor = colors.border.subtle
            }}
            onClick={() => window.api.openUrl(bm.url)}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ ...typography.body, fontWeight: 500 }}>{bm.name}</div>
              <div style={{
                fontSize: 10, color: colors.text.tertiary,
                fontFamily: 'Consolas, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {bm.url}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(i) }}
              style={{
                fontSize: 11, color: colors.text.tertiary, background: 'none',
                border: 'none', cursor: 'pointer', padding: '4px 8px',
                transition: transition.fast, flexShrink: 0
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = colors.status.error }}
              onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
              ✕
            </button>
          </div>
        ))}
        {bookmarks.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: colors.text.tertiary, fontSize: 12 }}>
            즐겨찾기가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
