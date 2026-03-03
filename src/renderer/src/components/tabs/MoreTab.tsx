import { useEffect, useState } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'
import { Lightbulb, BarChart3, RotateCcw, Key, Clock } from 'lucide-react'
import HistoryTab from './HistoryTab'

type SubPage = 'menu' | 'history' | 'stats' | 'api-settings' | 'ideas' | 'routines'

const menuItems: Array<{ id: SubPage; icon: React.ReactNode; label: string; desc: string; color: string }> = [
  { id: 'history', icon: <Clock size={18} />, label: 'History', desc: '메모리 기록 뷰어', color: colors.accent.primary },
  { id: 'ideas', icon: <Lightbulb size={18} />, label: '백로그', desc: '채택 아이디어 관리', color: colors.status.warning },
  { id: 'stats', icon: <BarChart3 size={18} />, label: '통계', desc: '스킬 사용량, 활동 리포트', color: colors.status.success },
  { id: 'routines', icon: <RotateCcw size={18} />, label: '루틴', desc: '요일별 반복 작업 설정', color: colors.status.error },
  { id: 'api-settings', icon: <Key size={18} />, label: 'API 설정', desc: 'Jira, Supabase 등 연동 관리', color: colors.status.warning }
]

const backBtnStyle: React.CSSProperties = {
  ...typography.caption, color: colors.text.tertiary, background: 'none',
  border: 'none', cursor: 'pointer', padding: `10px ${spacing.lg}px`,
  textAlign: 'left', transition: transition.fast,
  borderBottom: `1px solid ${colors.border.subtle}`, width: '100%'
}

function SubPageWrapper({ onBack, children }: { onBack: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <button onClick={onBack} style={backBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text.secondary }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
        ← 더보기
      </button>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

// --- Stats Sub-page ---
function StatsPage(): JSX.Element {
  const [logs, setLogs] = useState<Array<{ skill: string; time: number }>>([])

  useEffect(() => {
    window.api.getSkillLogs().then(setLogs)
  }, [])

  // Calculate weekly stats
  const weekAgo = Date.now() - 7 * 86400000
  const weekLogs = logs.filter((l) => l.time >= weekAgo)

  const skillCounts: Record<string, number> = {}
  for (const log of weekLogs) {
    skillCounts[log.skill] = (skillCounts[log.skill] || 0) + 1
  }

  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1])
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1

  // Daily activity (last 7 days)
  const dailyCounts: number[] = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i)
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    dailyCounts.push(logs.filter((l) => l.time >= dayStart.getTime() && l.time < dayEnd.getTime()).length)
  }
  const maxDaily = Math.max(...dailyCounts, 1)
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토']
  const todayIdx = new Date().getDay()

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md }}>
        이번 주 스킬 사용량
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.text.tertiary, fontSize: 12 }}>
          아직 사용 기록이 없습니다
          <div style={{ fontSize: 10, marginTop: spacing.xs, color: colors.text.tertiary }}>
            스킬을 실행하면 자동으로 기록됩니다
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: 20 }}>
          {sorted.map(([skill, count]) => (
            <div key={skill}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ ...typography.caption, color: colors.text.secondary }}>/{skill}</span>
                <span style={{ fontSize: 10, color: colors.text.tertiary }}>{count}회</span>
              </div>
              <div style={{
                height: 6, borderRadius: 3,
                background: colors.bg.card,
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${(count / maxCount) * 100}%`,
                  background: colors.accent.primary,
                  transition: transition.normal
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily activity chart */}
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md }}>
        일별 활동
      </div>
      <div style={{
        display: 'flex', gap: 6, alignItems: 'flex-end', height: 80,
        padding: '0 4px'
      }}>
        {dailyCounts.map((count, i) => {
          const dayIdx = (todayIdx - 6 + i + 7) % 7
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.xs }}>
              <span style={{ fontSize: 8, color: colors.text.tertiary }}>{count || ''}</span>
              <div style={{
                width: '100%', borderRadius: 3,
                height: `${Math.max((count / maxDaily) * 50, count > 0 ? 4 : 0)}px`,
                background: count > 0
                  ? colors.accent.primary
                  : colors.bg.card,
                transition: transition.normal
              }} />
              <span style={{
                fontSize: 9,
                color: i === 6 ? colors.accent.primary : colors.text.tertiary
              }}>
                {dayLabels[dayIdx]}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{
        marginTop: spacing.lg, padding: '10px 12px', borderRadius: radius.sm,
        background: colors.bg.elevated,
        border: `1px solid ${colors.border.subtle}`,
        fontSize: 10, color: colors.text.tertiary, textAlign: 'center'
      }}>
        총 {logs.length}건 기록 · 이번 주 {weekLogs.length}건
      </div>
    </div>
  )
}

// --- API Settings Sub-page ---
function ApiSettingsPage(): JSX.Element {
  const [config, setConfig] = useState<Record<string, Record<string, string>>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getStore('apiConfig').then((data) => {
      if (data && typeof data === 'object') setConfig(data as Record<string, Record<string, string>>)
    })
  }, [])

  const updateField = (service: string, field: string, value: string): void => {
    setConfig((prev) => ({
      ...prev,
      [service]: { ...(prev[service] || {}), [field]: value }
    }))
  }

  const handleSave = (): void => {
    window.api.setStore('apiConfig', config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: radius.sm,
    border: `1px solid ${colors.border.primary}`, background: colors.bg.input,
    color: 'white', fontSize: 11, outline: 'none', fontFamily: 'Segoe UI, sans-serif',
    transition: transition.fast
  }

  const services = [
    {
      id: 'jira', label: 'Jira', color: colors.accent.primary,
      fields: [
        { key: 'baseUrl', label: 'URL', placeholder: 'https://your-team.atlassian.net' },
        { key: 'email', label: 'Email', placeholder: 'your-email@company.com' },
        { key: 'apiToken', label: 'API Token', placeholder: 'ATATT3x...', secret: true },
        { key: 'projectKeys', label: '프로젝트 키', placeholder: 'PLT, SOPHIA (쉼표 구분, 비워두면 전체)' }
      ]
    },
    {
      id: 'supabase', label: 'Supabase', color: colors.status.success,
      fields: [
        { key: 'url', label: 'URL', placeholder: 'https://xxx.supabase.co' },
        { key: 'anonKey', label: 'Anon Key', placeholder: 'eyJ...', secret: true }
      ]
    }
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md }}>
        API 연동 설정
      </div>

      {services.map((svc) => (
        <div key={svc.id} style={{
          padding: 14, borderRadius: radius.lg, marginBottom: 10,
          background: colors.bg.elevated,
          border: `1px solid ${colors.border.primary}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: svc.color, flexShrink: 0 }} />
            <span style={{ ...typography.subtitle, color: svc.color }}>{svc.label}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {svc.fields.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 3 }}>{f.label}</div>
                <input
                  type={f.secret ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={config[svc.id]?.[f.key] || ''}
                  onChange={(e) => updateField(svc.id, f.key, e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = `${svc.color}50` }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={handleSave}
        style={{
          width: '100%', padding: '10px', borderRadius: radius.sm, border: 'none',
          background: saved
            ? colors.status.successMuted
            : colors.accent.primaryMuted,
          color: saved ? colors.status.success : colors.accent.primary,
          cursor: 'pointer', fontSize: 11, fontWeight: 600,
          transition: transition.fast, letterSpacing: 0.3
        }}
        onMouseEnter={(e) => { if (!saved) e.currentTarget.style.background = 'rgba(0, 122, 255, 0.25)' }}
        onMouseLeave={(e) => { if (!saved) e.currentTarget.style.background = saved ? colors.status.successMuted : colors.accent.primaryMuted }}>
        {saved ? '✓ 저장됨!' : '저장'}
      </button>

      <div style={{
        marginTop: 10, fontSize: 9, color: colors.text.tertiary, textAlign: 'center', lineHeight: 1.5
      }}>
        설정은 로컬에 안전하게 저장됩니다 (Git 미포함)
      </div>
    </div>
  )
}

// --- Parse idea block (supports both old **key** and new "- key:" formats) ---
function parseIdea(block: string, index: number): {
  title: string; status: string; desc: string; date: string; difficulty: string; stack: string; details: string[]
} {
  const lines = block.split('\n').filter(Boolean)
  const titleLine = lines.find((l) => l.startsWith('###'))?.replace(/^###\s*/, '') || `아이디어 ${index + 1}`

  // Extract status from title: "제목 [대기]" → status = "대기"
  const statusMatch = titleLine.match(/\[(.+?)\]/)
  const status = statusMatch ? statusMatch[1] : ''
  const title = titleLine.replace(/\s*\[.+?\]\s*$/, '')

  // Parse fields (both "- key: value" and "**key**: value" formats)
  const getField = (key: string): string => {
    const line = lines.find((l) =>
      l.match(new RegExp(`^-\\s*${key}:\\s*`)) ||
      l.includes(`**${key}**`)
    )
    if (!line) return ''
    return line.replace(new RegExp(`^-\\s*${key}:\\s*`), '').replace(new RegExp(`.*\\*\\*${key}\\*\\*:\\s*`), '').trim()
  }

  const desc = getField('설명')
  const date = getField('등록일') || getField('날짜')
  const difficulty = getField('난이도')
  const stack = getField('기술 스택')

  // Extract detail sections (bold headers like **핵심 기능**, **시너지**, etc.)
  const details: string[] = []
  let capturing = false
  let current = ''
  for (const line of lines) {
    if (line.startsWith('**') && line.endsWith('**:') || line.match(/^\*\*.+\*\*:/)) {
      if (capturing && current) details.push(current.trim())
      current = line.replace(/\*\*/g, '')
      capturing = true
    } else if (capturing && (line.startsWith('-') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.'))) {
      current += '\n' + line
    } else if (capturing && line.trim() === '') {
      if (current) details.push(current.trim())
      current = ''
      capturing = false
    }
  }
  if (capturing && current) details.push(current.trim())

  return { title, status, desc, date, difficulty, stack, details }
}

// --- Single Idea Card (hover to show planning summary) ---
function IdeaCard({ block, index }: { block: string; index: number }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const idea = parseIdea(block, index)

  const STATUS_COLORS: Record<string, string> = {
    '대기': colors.status.warning,
    '진행중': colors.accent.primary,
    '완료': colors.status.success,
    '보류': colors.text.tertiary
  }
  const statusColor = STATUS_COLORS[idea.status] || colors.text.tertiary

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: spacing.md, borderRadius: radius.md,
        background: hovered ? colors.bg.cardHover : colors.bg.elevated,
        border: `1px solid ${hovered ? statusColor + '40' : colors.border.primary}`,
        transition: transition.fast, cursor: 'default'
      }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.text.primary }}>
          {idea.title}
        </div>
        {idea.status && (
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: radius.full,
            background: `${statusColor}18`, color: statusColor, fontWeight: 600
          }}>
            {idea.status}
          </span>
        )}
      </div>

      {/* Basic info */}
      {idea.desc && (
        <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: 6, lineHeight: 1.5 }}>
          {idea.desc}
        </div>
      )}
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        {idea.date && <span style={{ fontSize: 9, color: colors.text.tertiary }}>{idea.date}</span>}
        {idea.difficulty && <span style={{ fontSize: 9, color: colors.text.tertiary }}>{idea.difficulty}</span>}
        {idea.stack && <span style={{ fontSize: 9, color: colors.text.tertiary }}>{idea.stack}</span>}
      </div>

      {/* Planning summary on hover */}
      {hovered && idea.details.length > 0 && (
        <div style={{
          marginTop: spacing.sm, paddingTop: spacing.sm,
          borderTop: `1px solid ${colors.border.primary}`
        }}>
          <div style={{ ...typography.overline, color: statusColor, marginBottom: spacing.xs }}>
            기획 요약
          </div>
          {idea.details.map((section, si) => {
            const sectionLines = section.split('\n')
            const sectionTitle = sectionLines[0]
            const sectionItems = sectionLines.slice(1)
            return (
              <div key={si} style={{ marginBottom: spacing.xs }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: colors.text.secondary, marginBottom: 2 }}>
                  {sectionTitle}
                </div>
                {sectionItems.map((item, ii) => (
                  <div key={ii} style={{ fontSize: 10, color: colors.text.tertiary, lineHeight: 1.5, paddingLeft: 8 }}>
                    {item.trim()}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Ideas Backup Sub-page ---
function IdeasPage(): JSX.Element {
  const [files, setFiles] = useState<Array<{ name: string; month: string }>>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    window.api.getIdeaFiles().then((f) => {
      setFiles(f)
      if (f.length > 0) {
        setSelectedFile(f[0].name)
        window.api.getIdeaContent(f[0].name).then(setContent)
      }
    })
  }, [])

  const selectFile = (name: string): void => {
    setSelectedFile(name)
    window.api.getIdeaContent(name).then(setContent)
  }

  const ideas = content.split('---').map((s) => s.trim()).filter(Boolean)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md }}>
        백로그
      </div>

      {files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.text.tertiary, fontSize: 12 }}>
          아직 저장된 아이디어가 없습니다
          <div style={{ fontSize: 10, marginTop: spacing.xs, color: colors.text.tertiary }}>
            /아이디어 스킬에서 채택 시 자동 저장됩니다
          </div>
        </div>
      ) : (
        <>
          {/* Month tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {files.map((f) => (
              <button key={f.name} onClick={() => selectFile(f.name)}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: radius.full,
                  background: selectedFile === f.name
                    ? colors.accent.primaryMuted
                    : colors.bg.card,
                  border: `1px solid ${selectedFile === f.name ? colors.border.accent : colors.border.primary}`,
                  color: selectedFile === f.name ? colors.accent.primary : colors.text.tertiary,
                  cursor: 'pointer', fontWeight: 500, transition: transition.fast
                }}>
                {f.month}
              </button>
            ))}
          </div>

          {/* Ideas list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {ideas.map((block, i) => (
              <IdeaCard key={i} block={block} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// --- Routines Sub-page ---
type Routine = {
  id: string
  name: string
  days: number[] // 0=일 ~ 6=토
  skill: string
  startHour: number // 시작 시간 (0~23)
  endHour: number   // 종료 시간 (0~23)
  enabled: boolean
}

function RoutinesPage(): JSX.Element {
  const { skills } = useHubStore()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [newStartHour, setNewStartHour] = useState(8)
  const [newEndHour, setNewEndHour] = useState(10)
  const [saved, setSaved] = useState(false)

  // 카테고리별 스킬 그룹핑
  const categoryLabels: Record<string, string> = { dev: '개발', idea: '아이디어', work: '업무', more: '더보기' }
  const skillsByCategory = skills.reduce<Record<string, typeof skills>>((acc, s) => {
    const cat = s.category || 'more'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  useEffect(() => {
    window.api.getStore('routines').then((data) => {
      if (Array.isArray(data)) setRoutines(data as Routine[])
    })
  }, [])

  const saveRoutines = (updated: Routine[]): void => {
    setRoutines(updated)
    window.api.setStore('routines', updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const addRoutine = (): void => {
    if (!newName.trim() || !newSkill.trim()) return
    const routine: Routine = {
      id: Date.now().toString(),
      name: newName.trim(),
      days: newDays,
      skill: newSkill.trim().replace(/^\//, ''),
      startHour: newStartHour,
      endHour: newEndHour,
      enabled: true
    }
    saveRoutines([...routines, routine])
    setNewName('')
    setNewSkill('')
    setNewDays([1, 2, 3, 4, 5])
    setNewStartHour(8)
    setNewEndHour(10)
    setAdding(false)
  }

  const toggleRoutine = (id: string): void => {
    saveRoutines(routines.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  const deleteRoutine = (id: string): void => {
    saveRoutines(routines.filter((r) => r.id !== id))
  }

  const toggleDay = (day: number): void => {
    setNewDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort())
  }

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토']
  const hourOptions = Array.from({ length: 24 }, (_, i) => i)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: radius.sm,
    border: `1px solid ${colors.border.primary}`, background: colors.bg.input,
    color: 'white', fontSize: 11, outline: 'none', fontFamily: 'Segoe UI, sans-serif'
  }

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', borderRadius: radius.sm,
    border: `1px solid ${colors.border.primary}`, background: colors.bg.input,
    color: 'white', fontSize: 11, outline: 'none', fontFamily: 'Segoe UI, sans-serif',
    cursor: 'pointer'
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md
      }}>
        <div style={{ ...typography.overline, color: colors.text.tertiary }}>
          루틴 설정
        </div>
        {saved && <span style={{ fontSize: 10, color: colors.status.success }}>저장됨!</span>}
      </div>

      {/* Existing routines */}
      {routines.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: 30, color: colors.text.tertiary, fontSize: 12 }}>
          설정된 루틴이 없습니다
          <div style={{ fontSize: 10, marginTop: spacing.xs, color: colors.text.tertiary }}>
            요일+시간별 반복 작업을 등록하면 홈 추천에 표시됩니다
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: spacing.md }}>
        {routines.map((r) => (
          <div key={r.id} style={{
            padding: spacing.md, borderRadius: radius.md,
            background: r.enabled ? colors.bg.elevated : 'rgba(255,255,255,0.01)',
            border: `1px solid ${r.enabled ? colors.border.primary : colors.border.subtle}`,
            opacity: r.enabled ? 1 : 0.5
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{r.name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => toggleRoutine(r.id)}
                  style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: radius.md, border: 'none',
                    background: r.enabled ? colors.status.successMuted : colors.bg.card,
                    color: r.enabled ? colors.status.success : colors.text.tertiary,
                    cursor: 'pointer'
                  }}>
                  {r.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => deleteRoutine(r.id)}
                  style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: radius.md, border: 'none',
                    background: colors.status.errorMuted, color: colors.status.error, cursor: 'pointer'
                  }}>
                  삭제
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.xs }}>
              {dayLabels.map((label, idx) => (
                <span key={idx} style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 4,
                  background: r.days.includes(idx) ? colors.accent.primarySubtle : 'transparent',
                  color: r.days.includes(idx) ? colors.accent.primary : colors.text.tertiary
                }}>
                  {label}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: colors.text.tertiary }}>/{r.skill}</span>
              <span style={{ fontSize: 9, color: colors.text.tertiary }}>
                {String(r.startHour ?? 0).padStart(2, '0')}:00 ~ {String(r.endHour ?? 23).padStart(2, '0')}:00
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add new routine */}
      {adding ? (
        <div style={{
          padding: 14, borderRadius: radius.lg,
          background: colors.accent.primarySubtle,
          border: `1px solid ${colors.border.accent}`
        }}>
          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 6 }}>루틴 이름</div>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 출근 루틴" style={{ ...inputStyle, marginBottom: spacing.sm }} />

          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 6 }}>실행 스킬</div>
          <select value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
            style={{ ...selectStyle, width: '100%', marginBottom: spacing.sm }}>
            <option value="" style={{ background: '#1e1e2e', color: colors.text.tertiary }}>스킬 선택...</option>
            {Object.entries(skillsByCategory).map(([cat, catSkills]) => (
              <optgroup key={cat} label={`── ${categoryLabels[cat] || cat} ──`} style={{ background: '#1e1e2e', color: colors.text.secondary }}>
                {catSkills.map((s) => (
                  <option key={s.name} value={s.name} style={{ background: '#1e1e2e', color: 'white' }}>
                    /{s.name} - {s.description}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 6 }}>반복 요일</div>
          <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.sm }}>
            {dayLabels.map((label, idx) => (
              <button key={idx} onClick={() => toggleDay(idx)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: radius.sm, border: 'none',
                  background: newDays.includes(idx) ? colors.accent.primaryMuted : colors.bg.card,
                  color: newDays.includes(idx) ? colors.accent.primary : colors.text.tertiary,
                  cursor: 'pointer', fontSize: 10, fontWeight: 600
                }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 6 }}>표시 시간대</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <select value={newStartHour} onChange={(e) => setNewStartHour(Number(e.target.value))} style={selectStyle}>
              {hourOptions.map((h) => (
                <option key={h} value={h} style={{ background: '#1e1e2e', color: 'white' }}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <span style={{ ...typography.caption, color: colors.text.tertiary }}>~</span>
            <select value={newEndHour} onChange={(e) => setNewEndHour(Number(e.target.value))} style={selectStyle}>
              {hourOptions.map((h) => (
                <option key={h} value={h} style={{ background: '#1e1e2e', color: 'white' }}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button onClick={addRoutine}
              style={{
                flex: 1, padding: '8px', borderRadius: radius.sm, border: 'none',
                background: colors.accent.primaryMuted,
                color: colors.accent.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600
              }}>
              추가
            </button>
            <button onClick={() => setAdding(false)}
              style={{
                flex: 1, padding: '8px', borderRadius: radius.sm, border: 'none',
                background: colors.bg.card, color: colors.text.tertiary,
                cursor: 'pointer', fontSize: 11
              }}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{
            width: '100%', padding: '10px', borderRadius: radius.sm, border: `1px dashed ${colors.border.primary}`,
            background: 'transparent', color: colors.text.tertiary,
            cursor: 'pointer', fontSize: 11, transition: transition.fast
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border.accent; e.currentTarget.style.color = colors.accent.primary }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary; e.currentTarget.style.color = colors.text.tertiary }}>
          + 루틴 추가
        </button>
      )}

      <div style={{
        marginTop: spacing.md, fontSize: 9, color: colors.text.tertiary, textAlign: 'center', lineHeight: 1.5
      }}>
        등록된 루틴은 해당 요일+시간대에만 홈 추천에 표시됩니다
      </div>
    </div>
  )
}

// --- Main MoreTab ---
export default function MoreTab(): JSX.Element {
  const [subPage, setSubPage] = useState<SubPage>('menu')

  if (subPage !== 'menu') {
    const pageMap: Record<Exclude<SubPage, 'menu'>, JSX.Element> = {
      history: <HistoryTab />,
      stats: <StatsPage />,
      'api-settings': <ApiSettingsPage />,
      ideas: <IdeasPage />,
      routines: <RoutinesPage />
    }
    return (
      <SubPageWrapper onBack={() => setSubPage('menu')}>
        {pageMap[subPage]}
      </SubPageWrapper>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: 10 }}>
        더보기
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {menuItems.map((item) => (
          <button key={item.id} onClick={() => setSubPage(item.id)}
            style={{
              textAlign: 'left', padding: '14px 14px', borderRadius: radius.lg,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.primary}`,
              cursor: 'pointer', transition: transition.fast,
              display: 'flex', alignItems: 'center', gap: spacing.md, width: '100%'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bg.cardHover
              e.currentTarget.style.borderColor = `${item.color}25`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.bg.elevated
              e.currentTarget.style.borderColor = colors.border.primary
            }}>
            <span style={{ display: 'flex', alignItems: 'center', color: item.color }}>{item.icon}</span>
            <div>
              <div style={{ ...typography.body, fontWeight: 500, color: colors.text.primary }}>{item.label}</div>
              <div style={{ fontSize: 10, color: colors.text.tertiary, marginTop: 2 }}>{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
