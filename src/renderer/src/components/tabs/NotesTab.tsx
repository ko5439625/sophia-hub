import { useEffect, useState, useRef, useCallback } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'

// ─── Constants ───────────────────────────────────────────────
const CATEGORIES = [
  { key: '일반', icon: '📝', label: '📝 일반' },
  { key: '업무', icon: '💼', label: '💼 업무' },
  { key: '아이디어', icon: '💡', label: '💡 아이디어' },
  { key: '개인', icon: '🔒', label: '🔒 개인' }
] as const

type CategoryKey = (typeof CATEGORIES)[number]['key']

function getCategoryIcon(cat: string): string {
  return CATEGORIES.find((c) => c.key === cat)?.icon ?? '📝'
}

// ─── Styles ──────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: radius.sm,
  border: `1px solid ${colors.border.primary}`,
  background: colors.bg.input,
  color: 'white',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'Segoe UI, sans-serif',
  transition: transition.fast,
  boxSizing: 'border-box'
}

// ─── Helpers ─────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60000) return '방금 전'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  return `${Math.floor(diff / 86400000)}일 전`
}

function HighlightText({ text, query }: { text: string; query: string }): JSX.Element {
  if (!query.trim()) return <>{text}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: 'rgba(255, 214, 10, 0.3)',
              color: colors.text.primary,
              borderRadius: 2,
              padding: '0 1px'
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// ─── Inline Edit Form ────────────────────────────────────────
function NoteEditForm({
  initial,
  onSave,
  onCancel
}: {
  initial: { content: string; tags: string; category: CategoryKey }
  onSave: (content: string, tags: string, category: CategoryKey) => void
  onCancel: () => void
}): JSX.Element {
  const [content, setContent] = useState(initial.content)
  const [tagInput, setTagInput] = useState(initial.tags)
  const [category, setCategory] = useState<CategoryKey>(initial.category)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const ta = taRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.max(100, ta.scrollHeight) + 'px'
    }
  }, [])

  useEffect(() => {
    autoResize()
  }, [content, autoResize])

  useEffect(() => {
    taRef.current?.focus()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Category pills */}
      <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: radius.full,
              background: category === c.key ? colors.accent.primaryMuted : 'transparent',
              border: `1px solid ${category === c.key ? colors.border.accent : colors.border.primary}`,
              color: category === c.key ? colors.accent.primary : colors.text.tertiary,
              cursor: 'pointer',
              transition: transition.fast
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        ref={taRef}
        placeholder="메모 내용..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{
          ...inputStyle,
          resize: 'none',
          minHeight: 100,
          lineHeight: 1.6
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
        onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
      />

      {/* Tag input */}
      <input
        placeholder="태그 (쉼표로 구분)"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(content, tagInput, category) }
          if (e.key === 'Escape') onCancel()
        }}
        style={inputStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
        onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <button
          onClick={() => onSave(content, tagInput, category)}
          style={{
            flex: 1,
            padding: '6px',
            borderRadius: radius.sm,
            border: 'none',
            background: colors.accent.primaryMuted,
            color: colors.accent.primary,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            transition: transition.fast
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 255, 0.25)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}
        >
          {initial.content ? '수정' : '저장'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            borderRadius: radius.sm,
            border: `1px solid ${colors.border.primary}`,
            background: 'transparent',
            color: colors.text.tertiary,
            cursor: 'pointer',
            fontSize: 11,
            transition: transition.fast
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.text.tertiary }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────
export default function NotesTab(): JSX.Element {
  const { notes, setNotes } = useHubStore()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null)

  useEffect(() => {
    window.api.getNotes().then(setNotes)
  }, [setNotes])

  // ─── Derived ─────────────────────────────────────────────
  const categoryCounts = CATEGORIES.reduce(
    (acc, c) => {
      acc[c.key] = notes.filter((n) => (n.category || '일반') === c.key).length
      return acc
    },
    {} as Record<string, number>
  )

  const filteredNotes = notes.filter((n) => {
    const cat = n.category || '일반'
    if (activeCategory && cat !== activeCategory) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!n.content.toLowerCase().includes(q) && !n.tags.some((t) => t.toLowerCase().includes(q)))
        return false
    }
    return true
  })

  // ─── Handlers ────────────────────────────────────────────
  const persist = (updated: Note[]): void => {
    setNotes(updated)
    window.api.saveNotes(updated)
  }

  const parseTags = (raw: string): string[] =>
    raw.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)

  const handleCreate = (content: string, tagInput: string, category: CategoryKey): void => {
    if (!content.trim()) return
    const note: Note = {
      id: generateId(),
      content: content.trim(),
      tags: parseTags(tagInput),
      category,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    persist([note, ...notes])
    setAddingNew(false)
    setExpandedId(note.id)
  }

  const handleEdit = (id: string, content: string, tagInput: string, category: CategoryKey): void => {
    if (!content.trim()) return
    const updated = notes.map((n) =>
      n.id === id
        ? { ...n, content: content.trim(), tags: parseTags(tagInput), category, updatedAt: Date.now() }
        : n
    )
    persist(updated)
    setEditingId(null)
  }

  const handleDelete = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    if (expandedId === id) setExpandedId(null)
    if (editingId === id) setEditingId(null)
    persist(notes.filter((n) => n.id !== id))
  }

  const toggleExpand = (id: string): void => {
    if (editingId === id) return
    setExpandedId(expandedId === id ? null : id)
    setEditingId(null)
    setAddingNew(false)
  }

  const startEdit = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    setEditingId(id)
    setExpandedId(id)
    setAddingNew(false)
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar + Add */}
      <div
        style={{
          padding: `${spacing.md}px ${spacing.lg}px`,
          paddingBottom: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 12, color: colors.text.tertiary, pointerEvents: 'none'
              }}
            >
              🔍
            </span>
            <input
              placeholder="메모 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
              onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
            />
          </div>
          <button
            onClick={() => { setAddingNew(!addingNew); setExpandedId(null); setEditingId(null) }}
            style={{
              fontSize: 16,
              color: addingNew ? colors.status.error : colors.text.tertiary,
              background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1,
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.sm, flexShrink: 0, transition: transition.fast
            }}
            onMouseEnter={(e) => { if (!addingNew) e.currentTarget.style.color = colors.text.secondary }}
            onMouseLeave={(e) => { e.currentTarget.style.color = addingNew ? colors.status.error : colors.text.tertiary }}
          >
            {addingNew ? '✕' : '+'}
          </button>
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: radius.full,
              background: !activeCategory ? colors.accent.primaryMuted : colors.bg.card,
              border: `1px solid ${!activeCategory ? colors.border.accent : colors.border.primary}`,
              color: !activeCategory ? colors.accent.primary : colors.text.tertiary,
              cursor: 'pointer', transition: transition.fast
            }}
          >
            전체
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(activeCategory === c.key ? null : c.key)}
              style={{
                fontSize: 10, padding: '3px 10px', borderRadius: radius.full,
                background: activeCategory === c.key ? colors.accent.primaryMuted : colors.bg.card,
                border: `1px solid ${activeCategory === c.key ? colors.border.accent : colors.border.primary}`,
                color: activeCategory === c.key ? colors.accent.primary : colors.text.tertiary,
                cursor: 'pointer', transition: transition.fast
              }}
            >
              {c.label} {categoryCounts[c.key]}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: colors.border.primary, margin: `${spacing.sm}px ${spacing.lg}px` }} />

      {/* Notes list */}
      <div
        style={{
          flex: 1, overflowY: 'auto',
          padding: `0 ${spacing.lg}px ${spacing.md}px`,
          display: 'flex', flexDirection: 'column', gap: 6
        }}
      >
        {/* New note form */}
        {addingNew && (
          <div
            style={{
              padding: '10px 12px', borderRadius: radius.md,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.accent}`
            }}
          >
            <NoteEditForm
              initial={{ content: '', tags: '', category: '일반' }}
              onSave={handleCreate}
              onCancel={() => setAddingNew(false)}
            />
          </div>
        )}

        {filteredNotes.map((note) => {
          const cat = (note.category || '일반') as CategoryKey
          const isExpanded = expandedId === note.id
          const isEditing = editingId === note.id

          return (
            <div
              key={note.id}
              onClick={() => toggleExpand(note.id)}
              style={{
                padding: '10px 12px',
                borderRadius: radius.md,
                background: isExpanded ? colors.bg.cardHover : colors.bg.elevated,
                border: `1px solid ${isExpanded ? colors.border.accent : colors.border.primary}`,
                cursor: isEditing ? 'default' : 'pointer',
                transition: transition.fast
              }}
              onMouseEnter={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.background = colors.bg.cardHover
                }
              }}
              onMouseLeave={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.background = colors.bg.elevated
                }
              }}
            >
              {/* Collapsed header — always visible */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <p
                  style={{
                    ...typography.body, color: colors.text.primary,
                    flex: 1, margin: 0,
                    ...(isExpanded
                      ? { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }
                      : { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' })
                  }}
                >
                  <span style={{ marginRight: 6 }}>{getCategoryIcon(cat)}</span>
                  {isExpanded && !isEditing ? (
                    <HighlightText text={note.content} query={searchQuery} />
                  ) : !isExpanded ? (
                    <HighlightText
                      text={note.content.length > 80 ? note.content.slice(0, 80) + '...' : note.content}
                      query={searchQuery}
                    />
                  ) : null}
                </p>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: spacing.sm }}>
                  {isExpanded && !isEditing && (
                    <button
                      onClick={(e) => startEdit(e, note.id)}
                      style={{
                        fontSize: 10, color: colors.text.tertiary, background: 'none',
                        border: 'none', cursor: 'pointer', padding: '2px 6px', transition: transition.fast
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = colors.accent.primary }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}
                    >
                      ✎
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(e, note.id)}
                    style={{
                      fontSize: 10, color: colors.border.primary, background: 'none',
                      border: 'none', cursor: 'pointer', padding: '2px 6px', transition: transition.fast
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colors.status.error }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = colors.border.primary }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div style={{ marginTop: spacing.sm }} onClick={(e) => e.stopPropagation()}>
                  <NoteEditForm
                    initial={{ content: note.content, tags: note.tags.join(', '), category: cat }}
                    onSave={(c, t, cat) => handleEdit(note.id, c, t, cat)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}

              {/* Tags + time — always visible */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 9, padding: '1px 8px', borderRadius: radius.sm,
                        background: colors.accent.primarySubtle,
                        color: colors.accent.primary, fontWeight: 500
                      }}
                    >
                      #<HighlightText text={tag} query={searchQuery} />
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 9, color: colors.text.tertiary, flexShrink: 0 }}>
                  {formatTimeAgo(note.updatedAt || note.createdAt)}
                </span>
              </div>
            </div>
          )
        })}

        {filteredNotes.length === 0 && !addingNew && (
          <div style={{ textAlign: 'center', padding: 40, color: colors.text.tertiary, fontSize: 12 }}>
            {searchQuery
              ? `"${searchQuery}" 검색 결과가 없습니다`
              : activeCategory
                ? `${getCategoryIcon(activeCategory)} ${activeCategory} 카테고리의 메모가 없습니다`
                : '메모가 없습니다'}
          </div>
        )}
      </div>
    </div>
  )
}
