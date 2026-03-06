import { useEffect, useState } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'
import { Keyboard, Lightbulb, ClipboardList, Zap, ChevronDown, RefreshCw, FolderOpen, Archive } from 'lucide-react'

const SKILL_CATEGORIES: Array<{ id: 'dev' | 'idea' | 'work' | 'more'; label: string; icon: React.ReactNode; color: string }> = [
  { id: 'dev', label: '개발', icon: <Keyboard size={16} />, color: colors.accent.primary },
  { id: 'idea', label: '아이디어', icon: <Lightbulb size={16} />, color: colors.status.warning },
  { id: 'work', label: '업무', icon: <ClipboardList size={16} />, color: colors.status.success },
  { id: 'more', label: '더보기', icon: <Zap size={16} />, color: colors.status.info }
]

interface CmdItem { cmd: string; desc: string; usage: string }

const COMMAND_SECTIONS: Array<{
  id: string; title: string; icon: string; desc: string; color: string; commands: CmdItem[]
}> = [
  {
    id: 'slash', title: '슬래시 커맨드', icon: '/', desc: '인터랙티브 모드에서 사용', color: colors.accent.primary,
    commands: [
      { cmd: '/add-dir', desc: '작업 디렉토리 추가', usage: '현재 세션에 다른 폴더를 추가 참조. 멀티 프로젝트 동시 작업 시 유용' },
      { cmd: '/bug', desc: '버그 리포트', usage: 'Claude Code 자체의 버그를 Anthropic에 리포트' },
      { cmd: '/clear', desc: '대화 초기화', usage: '현재 대화 컨텍스트를 완전히 비우고 새로 시작' },
      { cmd: '/compact', desc: '컨텍스트 압축', usage: '긴 대화를 AI가 요약해서 토큰 절약. 대화 길어질 때 필수' },
      { cmd: '/config', desc: '설정 관리', usage: 'Claude Code 설정 확인/변경. set, get, list 서브커맨드 지원' },
      { cmd: '/cost', desc: '비용 확인', usage: '현재 세션의 토큰 사용량과 예상 비용 실시간 확인' },
      { cmd: '/diff', desc: '변경사항 보기', usage: 'Claude가 수정한 파일의 diff를 한눈에 확인' },
      { cmd: '/doctor', desc: '환경 진단', usage: '시스템 환경, 의존성, 설정 문제를 자동으로 진단/수정' },
      { cmd: '/fast', desc: '빠른 모드 토글', usage: '같은 모델이지만 더 빠른 출력. 간단한 작업에 적합' },
      { cmd: '/help', desc: '도움말', usage: '사용 가능한 모든 커맨드 목록과 설명 확인' },
      { cmd: '/init', desc: 'CLAUDE.md 생성', usage: '프로젝트 루트에 CLAUDE.md 생성. 프로젝트 규칙/컨벤션 정의' },
      { cmd: '/listen', desc: '음성 입력', usage: '마이크로 음성 인식하여 텍스트 입력으로 변환' },
      { cmd: '/login', desc: '로그인', usage: 'Anthropic 계정 로그인 또는 API 키 설정' },
      { cmd: '/logout', desc: '로그아웃', usage: '현재 세션에서 로그아웃' },
      { cmd: '/mcp', desc: 'MCP 서버 관리', usage: 'Model Context Protocol 서버 추가/제거/상태 확인' },
      { cmd: '/memory', desc: '메모리 편집', usage: 'CLAUDE.md 직접 편집. 프로젝트 규칙/패턴을 영구 저장' },
      { cmd: '/model', desc: '모델 변경', usage: 'opus / sonnet / haiku 선택. 비용-성능 트레이드오프' },
      { cmd: '/permissions', desc: '권한 설정', usage: '파일 읽기/쓰기, Bash 실행 등 도구별 권한 관리' },
      { cmd: '/pr-comments', desc: 'PR 코멘트 확인', usage: '현재 브랜치 PR의 리뷰 코멘트를 가져와서 확인' },
      { cmd: '/release-notes', desc: '릴리즈 노트', usage: 'Git 커밋 히스토리 기반 릴리즈 노트 자동 생성' },
      { cmd: '/review', desc: 'PR/코드 리뷰', usage: 'Git diff 분석하여 코드 리뷰 수행. 버그/개선점 제안' },
      { cmd: '/status', desc: '상태 확인', usage: '모델, 컨텍스트 크기, 비용, 권한 등 세션 전체 상태' },
      { cmd: '/terminal-setup', desc: '터미널 설정', usage: '터미널 키 바인딩과 테마 최적화 설정' },
      { cmd: '/vim', desc: 'Vim 모드', usage: 'Vim 키 바인딩 토글. hjkl 이동, i/a/o 입력 모드' }
    ]
  },
  {
    id: 'cli', title: 'CLI 실행 옵션', icon: '>_', desc: '터미널에서 claude 실행 시 플래그', color: colors.status.success,
    commands: [
      { cmd: 'claude "프롬프트"', desc: '초기 프롬프트', usage: '인터랙티브 모드 시작 + 첫 메시지 자동 입력' },
      { cmd: '-p, --print', desc: '비인터랙티브', usage: '결과만 출력하고 종료. 스크립트/CI에서 활용' },
      { cmd: '-c, --continue', desc: '이전 대화 이어하기', usage: '마지막 세션의 대화를 이어서 진행' },
      { cmd: '--resume <id>', desc: '특정 대화 복원', usage: '대화 ID를 지정하여 특정 세션 복원' },
      { cmd: '--model <model>', desc: '모델 지정', usage: 'opus, sonnet, haiku 중 선택' },
      { cmd: '-v, --verbose', desc: '상세 출력', usage: '디버깅용 상세 로그. API 호출, 도구 실행 확인' },
      { cmd: '--max-turns <n>', desc: '최대 턴 수', usage: '에이전트 자동 실행 최대 턴 제한 (-p와 함께)' },
      { cmd: '--allowedTools', desc: '허용 도구', usage: '특정 도구만 허용. 예: --allowedTools "Read,Grep"' },
      { cmd: '--disallowedTools', desc: '차단 도구', usage: '특정 도구 차단. 예: --disallowedTools "Bash"' },
      { cmd: '--add-dir <path>', desc: '디렉토리 추가', usage: '추가 작업 디렉토리. 여러 번 사용 가능' },
      { cmd: '--output-format', desc: '출력 형식', usage: 'json / text / stream-json. 자동화에 활용' },
      { cmd: '--system-prompt', desc: '시스템 프롬프트', usage: '-p와 함께 사용. 커스텀 시스템 프롬프트 지정' },
      { cmd: '--append-system-prompt', desc: '시스템 프롬프트 추가', usage: '기존 시스템 프롬프트에 내용 추가' },
      { cmd: '--no-auto-compact', desc: '자동 압축 끄기', usage: '컨텍스트 길어져도 자동 압축 비활성화' },
      { cmd: '--skip-permissions', desc: '권한 스킵 (CI용)', usage: 'CI/CD 전용. 모든 권한 확인 생략. 주의!' },
      { cmd: 'claude config list', desc: '설정 목록', usage: '모든 설정값과 현재 값 표시' },
      { cmd: 'claude config set <k> <v>', desc: '설정 변경', usage: '예: claude config set model opus' },
      { cmd: 'claude mcp add', desc: 'MCP 서버 추가', usage: 'MCP 서버 등록. stdio/sse 프로토콜 지원' },
      { cmd: 'claude mcp list', desc: 'MCP 목록', usage: '등록된 MCP 서버와 상태 확인' },
      { cmd: 'claude update', desc: '업데이트', usage: 'Claude Code를 최신 버전으로 업데이트' }
    ]
  },
  {
    id: 'keys', title: '키보드 단축키', icon: '⌨', desc: '인터랙티브 모드 단축키', color: colors.status.warning,
    commands: [
      { cmd: 'Ctrl+C', desc: '응답 중단', usage: 'Claude 응답 중 즉시 중단. 입력 중이면 내용 초기화' },
      { cmd: 'Ctrl+D', desc: '세션 종료', usage: 'Claude Code 세션 완전 종료' },
      { cmd: 'Escape', desc: '입력 취소', usage: '현재 입력 취소. 멀티라인 입력 취소에도 사용' },
      { cmd: 'Up / Down', desc: '히스토리 탐색', usage: '이전에 입력했던 프롬프트를 위/아래로 탐색' },
      { cmd: 'Tab', desc: '자동 완성', usage: '파일명, 경로, 커맨드명 자동 완성' },
      { cmd: 'Shift+Enter', desc: '여러줄 입력', usage: '줄바꿈하면서 계속 입력. 긴 프롬프트 작성용' },
      { cmd: 'Ctrl+L', desc: '화면 지우기', usage: '터미널 화면 초기화 (대화 컨텍스트는 유지)' },
      { cmd: 'Ctrl+J', desc: '줄바꿈 (대안)', usage: 'Shift+Enter와 동일. 터미널 호환성용' }
    ]
  }
]

const priorityDot = (color: string): React.ReactNode => (
  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
)
const PRIORITY_ICONS: Record<string, React.ReactNode> = {
  Highest: priorityDot(colors.status.error), High: priorityDot(colors.status.error),
  Medium: priorityDot(colors.status.warning),
  Low: priorityDot(colors.status.success), Lowest: priorityDot(colors.status.success)
}
const STATUS_COLORS: Record<string, string> = {
  new: colors.accent.primary, indeterminate: colors.status.warning, done: colors.status.success
}

// Shared styles
const sectionLabel: React.CSSProperties = {
  ...typography.overline,
  color: colors.text.tertiary,
  marginBottom: spacing.sm
}

const glassCard = (hover = false): React.CSSProperties => ({
  padding: `${spacing.md}px`, borderRadius: radius.md,
  background: hover ? colors.bg.cardHover : colors.bg.elevated,
  border: `1px solid ${colors.border.primary}`,
  transition: transition.fast
})

// --- Collapsible Section ---
function CollapsibleSection({ title, icon, color, defaultOpen, badge, onRefresh, children }: {
  title: string; icon: React.ReactNode; color: string; defaultOpen: boolean
  badge?: string; onRefresh?: () => void; children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      marginBottom: 14, borderRadius: radius.lg, overflow: 'hidden',
      border: `1px solid ${open ? color + '25' : colors.border.primary}`,
      transition: transition.fast
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', textAlign: 'left', padding: '11px 14px',
        background: open ? `${color}08` : colors.bg.elevated,
        borderBottom: open ? `1px solid ${color}18` : 'none',
        border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: transition.fast
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${color}12` }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? `${color}08` : colors.bg.elevated }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ display: 'flex', alignItems: 'center', color }}>{icon}</span>
          <span style={{ ...typography.subtitle, color }}>{title}</span>
          {badge && (
            <span style={{
              fontSize: 9, padding: '1px 7px', borderRadius: radius.md,
              background: `${color}20`, color, fontWeight: 600
            }}>{badge}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onRefresh && open && (
            <span onClick={(e) => { e.stopPropagation(); onRefresh() }}
              style={{
                cursor: 'pointer', color: colors.text.tertiary,
                padding: '2px 4px', transition: transition.fast, display: 'flex', alignItems: 'center'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = color }}
              onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}
              title="새로고침">
              <RefreshCw size={12} />
            </span>
          )}
          <span style={{
            color: colors.text.tertiary, transition: transition.fast,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'flex'
          }}><ChevronDown size={12} /></span>
        </div>
      </button>
      {open && <div style={{ padding: `${spacing.md}px` }}>{children}</div>}
    </div>
  )
}

// --- Jira Section ---
function JiraSection({ refreshKey }: { refreshKey: number }): JSX.Element {
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(false)
  const [jiraBaseUrl, setJiraBaseUrl] = useState('')

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const config = await window.api.getStore('apiConfig') as Record<string, Record<string, string>> | null
        const jira = config?.jira
        if (!jira?.baseUrl || !jira?.email || !jira?.apiToken) {
          setConfigured(false)
          return
        }
        setConfigured(true)
        setJiraBaseUrl(jira.baseUrl.replace(/\/+$/, ''))
        setLoading(true)
        setError(null)

        const keys = (jira.projectKeys || '').split(',').map(k => k.trim()).filter(Boolean)
        const data = await window.api.getJiraIssues(keys)
        setIssues(data)
      } catch (e) {
        setError((e as Error).message || '이슈 로딩 실패')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey])

  if (!configured) {
    return (
      <div style={{
        textAlign: 'center', padding: '20px 12px', color: colors.text.tertiary, ...typography.caption
      }}>
        Jira 연동이 설정되지 않았습니다
        <div style={{ fontSize: 10, marginTop: spacing.xs, color: colors.text.tertiary }}>
          ··· → API 설정에서 Jira 정보를 입력하세요
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: colors.text.tertiary, ...typography.caption }}>
        이슈 로딩 중...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: spacing.md, borderRadius: radius.sm,
        background: colors.status.errorMuted, border: `1px solid ${colors.status.error}25`,
        ...typography.caption, color: colors.status.error
      }}>
        {error}
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: colors.text.tertiary, ...typography.caption }}>
        할당된 이슈가 없습니다
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {issues.map((issue) => (
        <div key={issue.key}
          onClick={() => jiraBaseUrl && window.api.openUrl(`${jiraBaseUrl}/browse/${issue.key}`)}
          style={{
            padding: '8px 12px', borderRadius: radius.sm,
            background: colors.bg.elevated,
            border: `1px solid ${colors.border.primary}`,
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            cursor: jiraBaseUrl ? 'pointer' : 'default',
            transition: transition.fast
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover; e.currentTarget.style.borderColor = '#FF9F0A30' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.elevated; e.currentTarget.style.borderColor = colors.border.primary }}
        >
          <span style={{ display: 'flex', flexShrink: 0 }}>
            {PRIORITY_ICONS[issue.priority] || priorityDot(colors.text.tertiary)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#FF9F0A', fontWeight: 600, fontFamily: 'Consolas, monospace', flexShrink: 0 }}>
                {issue.key}
              </span>
              <span style={{
                ...typography.caption, color: colors.text.secondary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {issue.summary}
              </span>
            </div>
          </div>
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: radius.md, flexShrink: 0,
            background: `${STATUS_COLORS[issue.statusCategory] || colors.accent.primary}18`,
            color: STATUS_COLORS[issue.statusCategory] || colors.accent.primary,
            fontWeight: 600
          }}>
            {issue.status}
          </span>
        </div>
      ))}
      <div style={{
        textAlign: 'center', fontSize: 9, color: colors.text.tertiary, marginTop: spacing.xs
      }}>
        {issues.length}건 표시
      </div>
    </div>
  )
}

type Goal = { id: string; text: string; done: boolean; weekStart: number }

function getWeekStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

// --- Goals Strip (synced with HomeTab via Zustand) ---
function GoalsStrip(): JSX.Element | null {
  const { goals, saveGoals } = useHubStore()

  const toggleGoal = (id: string): void => {
    saveGoals(goals.map((g) => g.id === id ? { ...g, done: !g.done } : g))
  }

  if (goals.length === 0) return null

  const doneCount = goals.filter((g) => g.done).length
  const allDone = doneCount === goals.length
  const progressColor = allDone ? colors.status.success : '#FFD60A'

  return (
    <div style={{
      marginBottom: spacing.md, padding: `${spacing.md}px`,
      borderRadius: radius.lg, border: `1px solid ${progressColor}25`,
      background: `${progressColor}06`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: progressColor, letterSpacing: 0.3 }}>
          주간 목표
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: progressColor,
          background: `${progressColor}18`, padding: '2px 8px', borderRadius: radius.full
        }}>
          {doneCount}/{goals.length}
        </span>
      </div>
      <div style={{
        height: 5, borderRadius: 3, background: `${progressColor}15`,
        overflow: 'hidden', marginBottom: spacing.sm
      }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${(doneCount / goals.length) * 100}%`,
          background: progressColor,
          transition: 'width 0.3s'
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {goals.map((goal) => (
          <div key={goal.id} style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            padding: `${spacing.xs + 2}px ${spacing.sm}px`, borderRadius: radius.sm,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${colors.border.subtle}`
          }}>
            <button onClick={() => toggleGoal(goal.id)}
              style={{
                width: 15, height: 15, borderRadius: 4, border: 'none',
                background: goal.done ? progressColor : colors.bg.input,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: 'white', flexShrink: 0,
                transition: transition.fast
              }}>
              {goal.done ? '✓' : ''}
            </button>
            <span style={{
              flex: 1, fontSize: 12, fontWeight: goal.done ? 400 : 500,
              color: goal.done ? colors.text.tertiary : colors.text.primary,
              textDecoration: goal.done ? 'line-through' : 'none'
            }}>
              {goal.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Backlog Item (hover to show planning summary) ---
function BacklogItem({ block, index }: { block: string; index: number }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const lines = block.split('\n').filter(Boolean)
  const titleLine = lines.find((l) => l.startsWith('###'))?.replace(/^###\s*/, '') || `아이디어 ${index + 1}`
  const statusMatch = titleLine.match(/\[(.+?)\]/)
  const status = statusMatch ? statusMatch[1] : ''
  const title = titleLine.replace(/\s*\[.+?\]\s*$/, '')

  const getField = (key: string): string => {
    const line = lines.find((l) => l.match(new RegExp(`^-\\s*${key}:\\s*`)))
    return line ? line.replace(new RegExp(`^-\\s*${key}:\\s*`), '').trim() : ''
  }

  const desc = getField('설명')
  const difficulty = getField('난이도')
  const stack = getField('기술 스택')

  // Extract detail sections
  const details: string[] = []
  let capturing = false
  let current = ''
  for (const line of lines) {
    if (line.match(/^\*\*.+\*\*:/)) {
      if (capturing && current) details.push(current.trim())
      current = line.replace(/\*\*/g, '')
      capturing = true
    } else if (capturing && (line.startsWith('-') || line.match(/^\d+\./))) {
      current += '\n' + line
    } else if (capturing && line.trim() === '') {
      if (current) details.push(current.trim())
      current = ''
      capturing = false
    }
  }
  if (capturing && current) details.push(current.trim())

  const STATUS_COLORS: Record<string, string> = {
    '대기': colors.status.warning, '진행중': colors.accent.primary,
    '완료': colors.status.success, '보류': colors.text.tertiary
  }
  const statusColor = STATUS_COLORS[status] || colors.text.tertiary

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 12px', borderRadius: radius.sm,
        background: hovered ? colors.bg.cardHover : colors.bg.elevated,
        border: `1px solid ${hovered ? statusColor + '40' : colors.border.primary}`,
        transition: transition.fast
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.text.primary }}>{title}</span>
        {status && (
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: radius.full,
            background: `${statusColor}18`, color: statusColor, fontWeight: 600
          }}>{status}</span>
        )}
      </div>
      {desc && <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 3 }}>{desc}</div>}
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: 3 }}>
        {difficulty && <span style={{ fontSize: 9, color: colors.text.tertiary }}>{difficulty}</span>}
        {stack && <span style={{ fontSize: 9, color: colors.text.tertiary }}>{stack}</span>}
      </div>
      {hovered && details.length > 0 && (
        <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.border.primary}` }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: statusColor, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>기획 요약</div>
          {details.map((section, si) => {
            const sLines = section.split('\n')
            return (
              <div key={si} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: colors.text.secondary }}>{sLines[0]}</div>
                {sLines.slice(1).map((item, ii) => (
                  <div key={ii} style={{ fontSize: 10, color: colors.text.tertiary, lineHeight: 1.5, paddingLeft: 8 }}>{item.trim()}</div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Backlog Section ---
function BacklogSection(): JSX.Element {
  const [ideas, setIdeas] = useState<string[]>([])

  const loadIdeas = async (): Promise<void> => {
    try {
      const files = await window.api.getIdeaFiles()
      if (files.length === 0) { setIdeas([]); return }
      // 모든 월 파일에서 아이디어 로드
      const allIdeas: string[] = []
      for (const file of files) {
        const content = await window.api.getIdeaContent(file.name)
        const blocks = content.split('---').map((s: string) => s.trim()).filter(Boolean)
        allIdeas.push(...blocks)
      }
      setIdeas(allIdeas)
    } catch {
      setIdeas([])
    }
  }

  useEffect(() => { loadIdeas() }, [])

  return (
    <CollapsibleSection title="백로그" icon={<Archive size={14} />} color={colors.text.tertiary} defaultOpen={false}
      badge={ideas.length > 0 ? `${ideas.length}` : undefined}
      onRefresh={loadIdeas}>
      {ideas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: colors.text.tertiary, fontSize: 11 }}>
          채택된 아이디어가 없습니다
          <div style={{ fontSize: 10, marginTop: 4 }}>/아이디어에서 채택하면 여기에 쌓여요</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {ideas.map((block, i) => <BacklogItem key={i} block={block} index={i} />)}
        </div>
      )}
    </CollapsibleSection>
  )
}

// --- Skill Item (hover to show description) ---
function SkillItem({ skill, onLaunch }: { skill: Skill; onLaunch: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onLaunch}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: 'left', padding: '10px 14px', borderRadius: radius.md,
        background: hovered ? colors.bg.cardHover : colors.bg.elevated,
        border: `1px solid ${hovered ? '#FF648240' : colors.border.primary}`,
        cursor: 'pointer', transition: transition.fast, width: '100%'
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>/{skill.name}</span>
        <span style={{
          fontSize: 9, padding: '3px 10px', borderRadius: radius.sm,
          background: 'rgba(255,100,130,0.15)',
          color: '#FF6482', fontWeight: 600, letterSpacing: 0.5
        }}>
          실행
        </span>
      </div>
      {hovered && (
        <p style={{
          ...typography.caption, color: colors.text.secondary, marginTop: spacing.xs,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {skill.description}
        </p>
      )}
    </button>
  )
}

// --- Main WorkTab ---
export default function WorkTab(): JSX.Element {
  const { skills, recentSkills, selectedCategory, setSelectedCategory, launchSkill } = useHubStore()
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)
  const [jiraRefreshKey, setJiraRefreshKey] = useState(0)

  const copyCommand = (cmd: string): void => {
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(cmd)
    setTimeout(() => setCopiedCmd(null), 1500)
  }

  const filteredSkills = selectedCategory
    ? skills.filter((s) => s.category === selectedCategory)
    : []

  const toggleSection = (id: string): void => {
    setExpandedSection(expandedSection === id ? null : id)
  }

  // Skill drill-down view
  if (selectedCategory) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
        <button onClick={() => setSelectedCategory(null)}
          style={{
            ...typography.caption, color: colors.text.tertiary, background: 'none',
            border: 'none', cursor: 'pointer', marginBottom: 10, padding: '2px 4px',
            transition: transition.fast
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.text.secondary }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
          ← 뒤로
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredSkills.map((skill) => (
            <SkillItem key={skill.name} skill={skill} onLaunch={() => launchSkill(skill.name, skill.projectPath)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>

      {/* 주간 목표 */}
      <GoalsStrip />

      {/* Jira 이슈 섹션 */}
      <CollapsibleSection
        title="Jira 이슈"
        icon={<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF9F0A' }} />}
        color={'#FF9F0A'} defaultOpen={false}
        onRefresh={() => setJiraRefreshKey((k) => k + 1)}>
        <JiraSection refreshKey={jiraRefreshKey} />
      </CollapsibleSection>

      {/* 프로젝트 섹션 */}
      <CollapsibleSection title="프로젝트" icon={<FolderOpen size={14} />} color={'#BF5AF2'} defaultOpen={false}
        badge={`${skills.filter((s) => s.category === 'project').length}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {skills.filter((s) => s.category === 'project').map((skill) => (
            <button key={skill.name} onClick={() => launchSkill(skill.name, skill.projectPath)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: radius.sm,
                background: colors.bg.elevated,
                border: `1px solid ${colors.border.primary}`,
                cursor: 'pointer', transition: transition.fast, width: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.bg.cardHover
                e.currentTarget.style.borderColor = '#BF5AF230'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.bg.elevated
                e.currentTarget.style.borderColor = colors.border.primary
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...typography.body, fontWeight: 500 }}>/{skill.name}</span>
                <span style={{
                  fontSize: 9, padding: '3px 10px', borderRadius: radius.sm,
                  background: 'rgba(191,90,242,0.15)',
                  color: '#BF5AF2', fontWeight: 600
                }}>
                  실행
                </span>
              </div>
              <p style={{ ...typography.caption, color: colors.text.tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {skill.description}
              </p>
              {skill.techStack && (
                <p style={{ fontSize: 10, color: colors.text.tertiary, marginTop: 2 }}>{skill.techStack}</p>
              )}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* 스킬 섹션 */}
      <CollapsibleSection title="스킬" icon={<Zap size={14} />} color={'#FF6482'} defaultOpen={false}>
        {/* 최근 사용 */}
        {recentSkills.length > 0 && (
          <div style={{ marginBottom: spacing.md }}>
            <div style={sectionLabel}>최근 사용</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recentSkills.map((name) => {
                const skill = skills.find((s) => s.name === name)
                if (!skill) return null
                return (
                  <button key={name} onClick={() => launchSkill(skill.name, skill.projectPath)}
                    style={{
                      fontSize: 11, padding: '5px 14px', borderRadius: radius.full,
                      background: colors.accent.primarySubtle,
                      border: `1px solid ${colors.accent.primary}30`, color: colors.accent.primary,
                      cursor: 'pointer', fontWeight: 500, transition: transition.fast
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primarySubtle }}>
                    /{name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 카테고리 그리드 */}
        <div style={sectionLabel}>커스텀 스킬</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.lg }}>
          {SKILL_CATEGORIES.map((cat) => {
            const count = skills.filter((s) => s.category === cat.id).length
            return (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '14px 12px', borderRadius: radius.lg,
                  border: `1px solid ${cat.color}22`,
                  background: `${cat.color}08`,
                  cursor: 'pointer', textAlign: 'left', transition: transition.fast
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${cat.color}18`
                  e.currentTarget.style.borderColor = `${cat.color}40`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${cat.color}08`
                  e.currentTarget.style.borderColor = `${cat.color}22`
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                  <span style={{ display: 'flex', alignItems: 'center', color: cat.color }}>{cat.icon}</span>
                  <span style={{ ...typography.subtitle, color: cat.color }}>{cat.label}</span>
                </div>
                <span style={{ fontSize: 10, color: colors.text.tertiary }}>{count}개 스킬</span>
              </button>
            )
          })}
        </div>

        {/* Claude Code 레퍼런스 */}
        <div style={sectionLabel}>Claude Code 레퍼런스</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {COMMAND_SECTIONS.map((section) => {
            const isOpen = expandedSection === section.id
            return (
              <div key={section.id}>
                <button onClick={() => toggleSection(section.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: radius.md,
                    background: isOpen
                      ? `${section.color}0A`
                      : colors.bg.elevated,
                    border: `1px solid ${isOpen ? section.color + '30' : colors.border.subtle}`,
                    cursor: 'pointer', transition: transition.fast,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (!isOpen) e.currentTarget.style.background = colors.bg.card
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) e.currentTarget.style.background = colors.bg.elevated
                  }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                      <code style={{
                        fontSize: 12, color: section.color, fontWeight: 700,
                        fontFamily: 'Consolas, monospace',
                        background: `${section.color}15`, padding: '1px 6px', borderRadius: 4
                      }}>
                        {section.icon}
                      </code>
                      <span style={{ fontSize: 12, fontWeight: 600, color: colors.text.primary }}>
                        {section.title}
                      </span>
                      <span style={{
                        fontSize: 9, color: colors.text.tertiary,
                        background: colors.bg.card, padding: '1px 5px', borderRadius: 3
                      }}>
                        {section.commands.length}
                      </span>
                    </div>
                    <p style={{ fontSize: 10, color: colors.text.tertiary, marginTop: 2 }}>{section.desc}</p>
                  </div>
                  <span style={{
                    color: colors.text.tertiary, transition: transition.fast,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'flex'
                  }}>
                    <ChevronDown size={12} />
                  </span>
                </button>

                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs, marginBottom: spacing.sm }}>
                    {section.commands.map((c) => (
                      <button key={c.cmd} onClick={() => copyCommand(c.cmd)}
                        style={{
                          ...glassCard(copiedCmd === c.cmd),
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          position: 'relative', transition: transition.fast
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.bg.cardHover
                          e.currentTarget.style.borderColor = `${section.color}25`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = copiedCmd === c.cmd ? colors.status.successMuted : colors.bg.elevated
                          e.currentTarget.style.borderColor = copiedCmd === c.cmd ? `${colors.status.success}30` : colors.border.primary
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                          <code style={{
                            fontSize: 10.5, color: copiedCmd === c.cmd ? colors.status.success : section.color, fontWeight: 600,
                            fontFamily: 'Consolas, monospace', flexShrink: 0,
                            transition: transition.fast
                          }}>
                            {c.cmd}
                          </code>
                          <span style={{ fontSize: 10.5, color: colors.text.secondary, flex: 1 }}>{c.desc}</span>
                          {copiedCmd === c.cmd ? (
                            <span style={{ fontSize: 9, color: colors.status.success, flexShrink: 0, fontWeight: 600 }}>복사됨!</span>
                          ) : (
                            <span style={{ fontSize: 9, color: colors.text.tertiary, flexShrink: 0 }}>복사</span>
                          )}
                        </div>
                        <p style={{ fontSize: 9.5, color: colors.text.tertiary, marginTop: 2, lineHeight: 1.4 }}>
                          {c.usage}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* 백로그 섹션 (맨 아래) */}
      <BacklogSection />

    </div>
  )
}
