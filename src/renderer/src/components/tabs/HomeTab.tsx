import { useEffect, useState } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'

type CommitsByProject = { project: string; commits: Array<{ hash: string; message: string; time: string }> }

const glassCard: React.CSSProperties = {
  padding: `${spacing.md}px ${spacing.md + 2}px`, borderRadius: radius.lg,
  background: colors.bg.card,
  border: `1px solid ${colors.border.primary}`
}

const sectionLabel: React.CSSProperties = {
  ...typography.overline,
  color: colors.text.tertiary, marginBottom: spacing.sm
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getDateStr(): string {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
}

function getDaysAgo(unixSeconds: number): number {
  return Math.floor((Date.now() / 1000 - unixSeconds) / 86400)
}

function formatTimeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds)
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  const days = Math.floor(diff / 86400)
  return `${days}일 전`
}

type Recommendation = {
  icon: string
  text: string
  color: string
  priority: number
  action?: () => void
}

type Goal = {
  id: string
  text: string
  done: boolean
  weekStart: number
}

type Routine = {
  id: string
  name: string
  days: number[]
  skill: string
  startHour: number
  endHour: number
  enabled: boolean
}

function getWeekStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

export default function HomeTab(): JSX.Element {
  const { skills, gitStatuses, recentSkills, launchSkill, activeProject, setActiveProject } = useHubStore()
  const projects = skills.filter((s) => s.projectPath)

  const { goals, saveGoals } = useHubStore()
  const [standupData, setStandupData] = useState<CommitsByProject[]>([])
  const [standupCopied, setStandupCopied] = useState(false)
  const [newGoalText, setNewGoalText] = useState('')
  const [addingGoal, setAddingGoal] = useState(false)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [dismissedRecs, setDismissedRecs] = useState<Set<string>>(new Set())

  // Load persisted activeProject (clear if older than 12 hours)
  useEffect(() => {
    window.api.getStore('activeProject').then((data) => {
      const stored = data as { name: string; time: number } | null
      if (stored?.name && Date.now() - stored.time < 12 * 3600 * 1000) {
        setActiveProject(stored.name)
      }
    })
  }, [])

  // Load dismissed recs from store (persists across tab switches, resets daily)
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    window.api.getStore('dismissedRecs').then((data) => {
      const stored = data as { date: string; items: string[] } | null
      if (stored?.date === todayKey && Array.isArray(stored.items)) {
        setDismissedRecs(new Set(stored.items))
      }
    })
  }, [])

  useEffect(() => {
    const fetchCommits = async (): Promise<void> => {
      const results: CommitsByProject[] = []
      for (const p of projects) {
        if (!p.projectPath) continue
        const commits = await window.api.getRecentCommits(p.projectPath, 'yesterday')
        if (commits.length > 0) {
          results.push({ project: p.name, commits })
        }
      }
      setStandupData(results)
    }
    if (projects.length > 0) fetchCommits()
  }, [skills.length])

  useEffect(() => {
    window.api.getStore('goals').then((data) => {
      if (Array.isArray(data)) {
        const weekStart = getWeekStart()
        const currentGoals = (data as Goal[]).filter((g) => g.weekStart >= weekStart)
        saveGoals(currentGoals)
      }
    })
  }, [])

  useEffect(() => {
    window.api.getStore('routines').then((data) => {
      if (Array.isArray(data)) setRoutines(data as Routine[])
    })
  }, [])

  const addGoal = (): void => {
    if (!newGoalText.trim()) return
    const goal: Goal = { id: Date.now().toString(), text: newGoalText.trim(), done: false, weekStart: getWeekStart() }
    saveGoals([...goals, goal])
    setNewGoalText('')
    setAddingGoal(false)
  }

  const toggleGoal = (id: string): void => {
    saveGoals(goals.map((g) => g.id === id ? { ...g, done: !g.done } : g))
  }

  const deleteGoal = (id: string): void => {
    saveGoals(goals.filter((g) => g.id !== id))
  }

  const standupText = standupData.length > 0
    ? '어제 한 일:\n' + standupData.map((p) =>
        `• ${p.project}: ${p.commits.map((c) => c.message).join(', ')}`
      ).join('\n')
    : ''

  const copyStandup = (): void => {
    if (!standupText) return
    navigator.clipboard.writeText(standupText)
    setStandupCopied(true)
    setTimeout(() => setStandupCopied(false), 2000)
  }

  // Build smart recommendations
  const recommendations: Recommendation[] = []

  for (const project of projects) {
    if (!project.projectPath) continue
    const git = gitStatuses[project.projectPath]
    if (!git?.lastCommitTime) continue
    const days = getDaysAgo(git.lastCommitTime)
    if (days >= 7) {
      recommendations.push({
        icon: '🔴', text: `${project.name} ${days}일째 방치`,
        color: colors.status.error, priority: days >= 14 ? 0 : 1,
        action: () => launchSkill(project.name, project.projectPath)
      })
    } else if (days >= 3) {
      recommendations.push({
        icon: '🟡', text: `${project.name} ${days}일째 미작업`,
        color: colors.status.warning, priority: 2,
        action: () => launchSkill(project.name, project.projectPath)
      })
    }
  }

  for (const project of projects) {
    if (!project.projectPath) continue
    const git = gitStatuses[project.projectPath]
    if (!git) continue
    if (git.ahead > 0) {
      recommendations.push({
        icon: '⬆️', text: `${project.name}에 push 안 된 커밋 ${git.ahead}개`,
        color: colors.accent.primary, priority: 3,
        action: () => launchSkill(project.name, project.projectPath)
      })
    }
  }

  const todayDayIdx = new Date().getDay()
  const currentHour = new Date().getHours()
  for (const routine of routines) {
    if (!routine.enabled || !routine.days.includes(todayDayIdx)) continue
    const start = routine.startHour ?? 0
    const end = routine.endHour ?? 23
    if (currentHour < start || currentHour >= end) continue
    const skill = skills.find((s) => s.name === routine.skill)
    recommendations.push({
      icon: '🔄', text: `${routine.name} (/${routine.skill})`,
      color: '#fb923c', priority: 3,
      action: skill ? () => launchSkill(skill.name, skill.projectPath) : undefined
    })
  }

  const doneCount = goals.filter((g) => g.done).length
  const totalGoals = goals.length
  if (totalGoals > 0) {
    const dayOfWeek = new Date().getDay()
    const progressPct = doneCount / totalGoals
    if (dayOfWeek >= 4 && progressPct < 0.5) {
      recommendations.push({
        icon: '🎯', text: `주간 목표 ${Math.round(progressPct * 100)}% - 마감이 다가옵니다`,
        color: colors.status.warning, priority: 2
      })
    }
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const today = dayNames[new Date().getDay()]
  if (recentSkills.length > 0 && today !== '토' && today !== '일') {
    recommendations.push({
      icon: '🔵', text: `최근 자주 사용: /${recentSkills[0]}`,
      color: colors.accent.primary, priority: 5,
      action: () => {
        const skill = skills.find((s) => s.name === recentSkills[0])
        if (skill) launchSkill(skill.name, skill.projectPath)
      }
    })
  }

  recommendations.sort((a, b) => a.priority - b.priority)

  const projectsWithGit = projects.filter((p) => {
    const git = p.projectPath ? gitStatuses[p.projectPath] : null
    return git?.lastCommitTime
  })
  const isProjectActive = (name: string): boolean => name === activeProject
  const activeCount = projects.filter((p) => {
    if (isProjectActive(p.name)) return true
    const git = p.projectPath ? gitStatuses[p.projectPath] : null
    return git?.lastCommitTime && getDaysAgo(git.lastCommitTime) <= 3
  }).length
  const cautionCount = projectsWithGit.filter((p) => {
    if (isProjectActive(p.name)) return false
    const days = getDaysAgo(gitStatuses[p.projectPath!].lastCommitTime!)
    return days > 3 && days <= 7
  }).length
  const staleCount = projectsWithGit.filter((p) => {
    if (isProjectActive(p.name)) return false
    return getDaysAgo(gitStatuses[p.projectPath!].lastCommitTime!) > 7
  }).length

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.xl }}>
        <div style={{
          ...typography.title,
          fontSize: 16,
          color: colors.text.primary
        }}>
          {getGreeting()}, sophia
        </div>
        <div style={{ ...typography.caption, color: colors.text.tertiary, marginTop: spacing.xs }}>
          {getDateStr()}
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.sm, marginBottom: spacing.lg }}>
        <div style={{
          ...glassCard, padding: `${spacing.sm + 2}px ${spacing.md}px`, textAlign: 'center',
          background: activeCount > 0 ? colors.status.successMuted : colors.bg.card,
          border: `1px solid ${activeCount > 0 ? 'rgba(48,209,88,0.15)' : colors.border.primary}`
        }} title="3일 이내 커밋이 있는 프로젝트">
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.status.success }}>{activeCount}</div>
          <div style={{ ...typography.caption, fontSize: 9, color: colors.text.tertiary, marginTop: spacing.xs }}>활발</div>
        </div>
        <div style={{
          ...glassCard, padding: `${spacing.sm + 2}px ${spacing.md}px`, textAlign: 'center',
          background: cautionCount > 0 ? colors.status.warningMuted : colors.bg.card,
          border: `1px solid ${cautionCount > 0 ? 'rgba(255,214,10,0.15)' : colors.border.primary}`
        }} title="3~7일 미작업 프로젝트">
          <div style={{ fontSize: 18, fontWeight: 700, color: cautionCount > 0 ? colors.status.warning : colors.text.tertiary }}>
            {cautionCount}
          </div>
          <div style={{ ...typography.caption, fontSize: 9, color: colors.text.tertiary, marginTop: spacing.xs }}>주의</div>
        </div>
        <div style={{
          ...glassCard, padding: `${spacing.sm + 2}px ${spacing.md}px`, textAlign: 'center',
          background: staleCount > 0 ? colors.status.errorMuted : colors.bg.card,
          border: `1px solid ${staleCount > 0 ? 'rgba(255,69,58,0.15)' : colors.border.primary}`
        }} title="7일 이상 방치된 프로젝트">
          <div style={{ fontSize: 18, fontWeight: 700, color: staleCount > 0 ? colors.status.error : colors.text.tertiary }}>
            {staleCount}
          </div>
          <div style={{ ...typography.caption, fontSize: 9, color: colors.text.tertiary, marginTop: spacing.xs }}>방치</div>
        </div>
      </div>

      {/* Smart Recommendations */}
      {recommendations.filter((r) => !dismissedRecs.has(r.text)).length > 0 && (
        <div style={{ marginBottom: spacing.lg }}>
          <div style={sectionLabel}>오늘의 추천</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm - 2 }}>
            {recommendations.filter((r) => !dismissedRecs.has(r.text)).slice(0, 4).map((rec, i) => (
              <div key={i} style={{
                ...glassCard, display: 'flex', alignItems: 'center', gap: spacing.sm + 2,
                transition: transition.fast, position: 'relative'
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card }}>
                <button onClick={rec.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: spacing.sm + 2,
                    flex: 1, background: 'none', border: 'none', padding: 0,
                    cursor: rec.action ? 'pointer' : 'default', textAlign: 'left'
                  }}>
                  <span style={{ fontSize: 14 }}>{rec.icon}</span>
                  <span style={{ ...typography.body, fontSize: 12, color: rec.color, fontWeight: 500 }}>{rec.text}</span>
                </button>
                <button
                  onClick={() => {
                    setDismissedRecs((prev) => {
                      const next = new Set([...prev, rec.text])
                      const todayKey = new Date().toISOString().slice(0, 10)
                      window.api.setStore('dismissedRecs', { date: todayKey, items: [...next] })
                      return next
                    })
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.border.primary, fontSize: 10, padding: '2px 4px',
                    flexShrink: 0, transition: transition.fast, lineHeight: 1
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.status.error }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.border.primary }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goal Tracker */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <div style={sectionLabel}>주간 목표</div>
          {totalGoals > 0 && (
            <span style={{ ...typography.caption, color: colors.text.tertiary }}>
              {doneCount}/{totalGoals}
            </span>
          )}
        </div>

        {totalGoals > 0 && (
          <div style={{
            height: 6, borderRadius: 3, background: colors.border.subtle,
            overflow: 'hidden', marginBottom: spacing.sm + 2
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${(doneCount / totalGoals) * 100}%`,
              background: doneCount === totalGoals ? colors.status.success : colors.accent.primary,
              transition: 'width 0.3s'
            }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {goals.map((goal) => (
            <div key={goal.id} style={{
              display: 'flex', alignItems: 'center', gap: spacing.sm,
              padding: `${spacing.sm - 2}px ${spacing.sm + 2}px`, borderRadius: radius.sm,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.subtle}`
            }}>
              <button onClick={() => toggleGoal(goal.id)}
                style={{
                  width: 16, height: 16, borderRadius: 4, border: 'none',
                  background: goal.done ? colors.accent.primary : colors.bg.input,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'white', flexShrink: 0,
                  transition: transition.fast
                }}>
                {goal.done ? '✓' : ''}
              </button>
              <span style={{
                flex: 1, ...typography.caption,
                color: goal.done ? colors.text.tertiary : colors.text.secondary,
                textDecoration: goal.done ? 'line-through' : 'none'
              }}>
                {goal.text}
              </span>
              <button onClick={() => deleteGoal(goal.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, color: colors.text.tertiary, padding: '0 2px',
                  transition: transition.fast
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = colors.status.error }}
                onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
                ×
              </button>
            </div>
          ))}
        </div>

        {addingGoal ? (
          <div style={{ display: 'flex', gap: spacing.sm - 2, marginTop: spacing.sm - 2 }}>
            <input value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') setAddingGoal(false) }}
              placeholder="목표 입력..."
              autoFocus
              style={{
                flex: 1, padding: `5px ${spacing.sm}px`, borderRadius: radius.sm, fontSize: 11,
                border: `1px solid ${colors.border.accent}`, background: colors.bg.input,
                color: 'white', outline: 'none', fontFamily: 'Segoe UI, sans-serif'
              }} />
            <button onClick={addGoal}
              style={{
                padding: `5px ${spacing.sm + 2}px`, borderRadius: radius.sm, border: 'none',
                background: colors.accent.primaryMuted, color: colors.accent.primary,
                cursor: 'pointer', fontSize: 10, fontWeight: 600
              }}>
              추가
            </button>
          </div>
        ) : (
          <button onClick={() => setAddingGoal(true)}
            style={{
              marginTop: spacing.sm - 2, width: '100%', padding: '5px', borderRadius: radius.sm,
              border: `1px dashed ${colors.border.primary}`, background: 'transparent',
              color: colors.text.tertiary, cursor: 'pointer', fontSize: 10,
              transition: transition.fast
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border.accent; e.currentTarget.style.color = colors.accent.primary }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary; e.currentTarget.style.color = colors.text.tertiary }}>
            + 목표 추가
          </button>
        )}
      </div>

      {/* Daily Standup */}
      {standupData.length > 0 && (
        <div style={{ marginBottom: spacing.lg }}>
          <div style={sectionLabel}>Daily Standup</div>
          <div style={{
            ...glassCard,
            background: colors.accent.primarySubtle,
            border: `1px solid rgba(0,122,255,0.12)`
          }}>
            <div style={{ ...typography.caption, color: colors.text.tertiary, marginBottom: spacing.sm }}>어제 한 일:</div>
            {standupData.map((p) => (
              <div key={p.project} style={{ marginBottom: spacing.sm - 2 }}>
                <div style={{ ...typography.caption, color: colors.accent.primary, fontWeight: 600, marginBottom: 2 }}>
                  • {p.project}
                </div>
                {p.commits.map((c) => (
                  <div key={c.hash} style={{
                    fontSize: 10.5, color: colors.text.secondary,
                    paddingLeft: spacing.md + 2, lineHeight: 1.6
                  }}>
                    {c.message}
                  </div>
                ))}
              </div>
            ))}
            <button onClick={copyStandup}
              style={{
                marginTop: spacing.sm, width: '100%', padding: `${spacing.sm - 2}px`, borderRadius: radius.sm, border: 'none',
                background: standupCopied ? colors.status.successMuted : colors.accent.primaryMuted,
                color: standupCopied ? colors.status.success : colors.accent.primary,
                cursor: 'pointer', fontSize: 10, fontWeight: 600,
                transition: transition.fast
              }}>
              {standupCopied ? '✓ 복사됨!' : '슬랙에 붙여넣기용 복사'}
            </button>
          </div>
        </div>
      )}

      {/* Project Status Overview */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={sectionLabel}>프로젝트 현황</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {projects.map((project) => {
            const git = project.projectPath ? gitStatuses[project.projectPath] : null
            const days = git?.lastCommitTime ? getDaysAgo(git.lastCommitTime) : null
            const isActive = isProjectActive(project.name)
            const statusColor = isActive ? colors.accent.primary : days === null ? colors.text.tertiary : days <= 3 ? colors.status.success : days <= 7 ? colors.status.warning : colors.status.error
            const timeStr = isActive && !git?.lastCommitTime ? '작업 중' : git?.lastCommitTime ? formatTimeAgo(git.lastCommitTime) : '-'
            return (
              <button key={project.name}
                onClick={() => launchSkill(project.name, project.projectPath)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.sm,
                  background: colors.bg.elevated,
                  border: `1px solid ${colors.border.subtle}`,
                  cursor: 'pointer', transition: transition.fast,
                  width: '100%', textAlign: 'left'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.card }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.elevated }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <div style={{ width: 6, height: 6, borderRadius: radius.full, background: statusColor }} />
                  <span style={{ ...typography.body, fontSize: 12, fontWeight: 500 }}>/{project.name}</span>
                </div>
                <span style={{ ...typography.caption, fontSize: 10, color: colors.text.tertiary }}>{timeStr}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Quick Launch */}
      {recentSkills.length > 0 && (
        <div>
          <div style={sectionLabel}>빠른 실행</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm - 2 }}>
            {recentSkills.slice(0, 6).map((name) => {
              const skill = skills.find((s) => s.name === name)
              if (!skill) return null
              return (
                <button key={name} onClick={() => launchSkill(skill.name, skill.projectPath)}
                  style={{
                    ...typography.caption, padding: `5px ${spacing.md + 2}px`, borderRadius: radius.full,
                    background: colors.accent.primarySubtle,
                    border: `1px solid rgba(0,122,255,0.15)`, color: colors.accent.primary,
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
    </div>
  )
}
