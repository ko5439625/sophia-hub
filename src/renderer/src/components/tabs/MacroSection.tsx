import { useEffect, useState, useRef, useCallback } from 'react'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'
import { Crosshair, Type, Keyboard, Clock, Trash2, Play, Copy, Plus, Save, Square, MousePointer, Pipette, GripVertical, ArrowRight, Video, Monitor, ChevronDown } from 'lucide-react'

const STEP_COLORS: Record<string, string> = {
  path: '#FF453A',
  click: '#FFD60A',
  move: '#FF9500',
  direction: '#FF9500',
  text: '#30D158',
  key: '#BF5AF2',
  wait: '#64D2FF'
}

const STEP_LABELS: Record<string, string> = {
  path: '경로 이동',
  click: '클릭',
  move: '이동',
  direction: '방향',
  text: '텍스트',
  key: '단축키',
  wait: '대기'
}

const DIR_LABELS: Record<string, string> = { left: '←', right: '→', up: '↑', down: '↓' }

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function formatStepSummary(step: MacroStep): string {
  switch (step.type) {
    case 'path': return `${step.points.length}점, ${(step.duration / 1000).toFixed(1)}s`
    case 'click': return `(${step.x}, ${step.y}) ${step.button === 'right' ? '우클릭' : '좌클릭'}`
    case 'move': return `(${step.x}, ${step.y})`
    case 'text': return step.value.length > 20 ? step.value.slice(0, 20) + '…' : step.value
    case 'key': return step.keys.join('+')
    case 'direction': return `${DIR_LABELS[step.dir]} ${step.speed}px ${step.duration > 0 ? (step.duration / 1000).toFixed(1) + 's' : '무한'}`
    case 'wait': return step.random ? `랜덤 ${step.min}~${step.max}ms` : `${step.ms}ms`
  }
}

export default function MacroSection(): JSX.Element {
  const [macros, setMacros] = useState<Macro[]>([])
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null)
  const [recording, setRecording] = useState(false)
  const [execStatus, setExecStatus] = useState<MacroExecStatus | null>(null)
  const [status, setStatus] = useState('')
  const [lastPickResult, setLastPickResult] = useState<{ x: number; y: number; color: string } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [recordWithMacro, setRecordWithMacro] = useState(false)
  const [recSources, setRecSources] = useState<RecordingSource[]>([])
  const [recSourceId, setRecSourceId] = useState<string>('')
  const [showRecSourcePicker, setShowRecSourcePicker] = useState(false)

  // Direction dialog
  const [showDirDialog, setShowDirDialog] = useState(false)
  const [dirDir, setDirDir] = useState<'left' | 'right' | 'up' | 'down'>('right')
  const [dirSpeed, setDirSpeed] = useState('5')
  const [dirDuration, setDirDuration] = useState('0')

  // Repeat custom input
  const [customRepeat, setCustomRepeat] = useState(false)
  const [customRepeatInput, setCustomRepeatInput] = useState('')

  // Dialog states
  const [showTextDialog, setShowTextDialog] = useState(false)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [showWaitDialog, setShowWaitDialog] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [waitInput, setWaitInput] = useState('500')
  const [waitRandom, setWaitRandom] = useState(false)
  const [waitMinInput, setWaitMinInput] = useState('300')
  const [waitMaxInput, setWaitMaxInput] = useState('1500')

  const statusUnsubRef = useRef<(() => void) | null>(null)

  // Load macros on mount
  useEffect(() => {
    loadMacros()
    statusUnsubRef.current = window.api.onMacroStatus(async (s) => {
      setExecStatus(s as MacroExecStatus)
      if ((s as MacroExecStatus).state === 'stopped') {
        // Stop background recording if active
        try {
          const rec = await window.api.stopBgRecording()
          if (rec.success && rec.fileName) {
            showStatusMsg(`녹화 저장됨: ${rec.fileName}`)
            window.api.openRecordingsFolder()
          }
        } catch { /* no recording active */ }
        setTimeout(() => setExecStatus(null), 3000)
      }
    })
    return () => {
      if (statusUnsubRef.current) statusUnsubRef.current()
    }
  }, [])

  const loadMacros = async (): Promise<void> => {
    const m = await window.api.getMacros()
    setMacros(m)
  }

  // --- Picker logic (overlay-based) ---
  const pickCoord = async (): Promise<void> => {
    if (!editingMacro) return
    const result = await window.api.pickPosition()
    if (!result) return
    setLastPickResult(result)
    const step: MacroStep = { type: 'click', x: result.x, y: result.y, button: 'left' }
    setEditingMacro(prev => {
      if (!prev) return prev
      return { ...prev, steps: [...prev.steps, step] }
    })
    navigator.clipboard.writeText(`${result.x}, ${result.y}`)
    showStatusMsg(`좌클릭 추가: (${result.x}, ${result.y})`)
  }

  const pickRgb = async (): Promise<void> => {
    const result = await window.api.pickPosition()
    if (!result) return
    setLastPickResult(result)
    navigator.clipboard.writeText(result.color)
    showStatusMsg(`색상 복사됨: ${result.color}`)
  }

  const addClickFromLastPick = (button: 'left' | 'right'): void => {
    if (!editingMacro || !lastPickResult) return
    const step: MacroStep = { type: 'click', x: lastPickResult.x, y: lastPickResult.y, button }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    showStatusMsg(`${button === 'right' ? '우' : '좌'}클릭 추가: (${lastPickResult.x}, ${lastPickResult.y})`)
  }

  const addMoveFromLastPick = (): void => {
    if (!editingMacro || !lastPickResult) return
    const step: MacroStep = { type: 'move', x: lastPickResult.x, y: lastPickResult.y }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    showStatusMsg(`이동 추가: (${lastPickResult.x}, ${lastPickResult.y})`)
  }

  // Drag & drop reorder
  const handleDragStart = (index: number): void => { setDragIndex(index) }
  const handleDragOver = (e: React.DragEvent, index: number): void => { e.preventDefault(); setDragOverIndex(index) }
  const handleDragEnd = (): void => { setDragIndex(null); setDragOverIndex(null) }
  const handleDrop = (index: number): void => {
    if (dragIndex === null || dragIndex === index || !editingMacro) return
    const steps = [...editingMacro.steps]
    const [moved] = steps.splice(dragIndex, 1)
    steps.splice(index, 0, moved)
    setEditingMacro({ ...editingMacro, steps })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const toggleClickButton = (index: number): void => {
    if (!editingMacro) return
    const steps = [...editingMacro.steps]
    const step = steps[index]
    if (step.type === 'click') {
      steps[index] = { ...step, button: step.button === 'left' ? 'right' : 'left' }
      setEditingMacro({ ...editingMacro, steps })
    }
  }

  // Interactive path recording (Space to start/stop)
  const startPathRecording = useCallback(async () => {
    if (!editingMacro) return
    const points = await window.api.recordPathInteractive()
    if (points && points.length > 0) {
      const duration = points[points.length - 1].t - points[0].t
      const newStep: MacroStep = { type: 'path', points, duration }
      setEditingMacro(prev => {
        if (!prev) return prev
        return { ...prev, steps: [...prev.steps, newStep] }
      })
      showStatusMsg('경로 녹화 완료')
    }
  }, [editingMacro])

  const addTextStep = (): void => {
    if (!editingMacro || !textInput.trim()) return
    const step: MacroStep = { type: 'text', value: textInput }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    setTextInput('')
    setShowTextDialog(false)
  }

  const addKeyStep = (): void => {
    if (!editingMacro || !keyInput.trim()) return
    const keys = keyInput.split('+').map(k => k.trim().toLowerCase())
    const step: MacroStep = { type: 'key', keys }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    setKeyInput('')
    setShowKeyDialog(false)
  }

  const addDirStep = (): void => {
    if (!editingMacro) return
    const speed = parseInt(dirSpeed) || 5
    const duration = parseInt(dirDuration) || 0
    const step: MacroStep = { type: 'direction', dir: dirDir, speed, duration: duration * 1000 }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    setShowDirDialog(false)
    showStatusMsg(`방향 이동 추가: ${DIR_LABELS[dirDir]}`)
  }

  const addWaitStep = (): void => {
    if (!editingMacro) return
    let step: MacroStep
    if (waitRandom) {
      const min = parseInt(waitMinInput) || 300
      const max = Math.max(min, parseInt(waitMaxInput) || 1500)
      step = { type: 'wait', ms: Math.round((min + max) / 2), random: true, min, max }
    } else {
      step = { type: 'wait', ms: parseInt(waitInput) || 500 }
    }
    setEditingMacro({ ...editingMacro, steps: [...editingMacro.steps, step] })
    setWaitInput('500')
    setWaitMinInput('300')
    setWaitMaxInput('1500')
    setShowWaitDialog(false)
  }

  const removeStep = (index: number): void => {
    if (!editingMacro) return
    setEditingMacro({
      ...editingMacro,
      steps: editingMacro.steps.filter((_, i) => i !== index)
    })
  }

  const createNewMacro = (): void => {
    const now = Date.now()
    setEditingMacro({
      id: generateId(), name: '새 매크로', steps: [],
      speed: 1, repeat: 1, gameMode: 'off', createdAt: now, updatedAt: now
    })
  }

  const saveMacro = async (): Promise<void> => {
    if (!editingMacro) return
    const updated = { ...editingMacro, updatedAt: Date.now() }
    await window.api.saveMacro(updated)
    showStatusMsg('저장됨')
    await loadMacros()
    setEditingMacro(updated)
  }

  const deleteMacro = async (id: string): Promise<void> => {
    await window.api.deleteMacro(id)
    showStatusMsg('삭제됨')
    if (editingMacro?.id === id) setEditingMacro(null)
    await loadMacros()
  }

  const executeMacro = async (macro: Macro, withRecording?: boolean): Promise<void> => {
    if (macro.steps.length === 0) { showStatusMsg('실행할 스텝이 없습니다'); return }
    if (withRecording) {
      const started = await window.api.startBgRecording(recSourceId || undefined)
      if (!started) { showStatusMsg('녹화 시작 실패'); return }
    }
    await window.api.executeMacro(macro)
  }

  const loadRecSources = async (): Promise<void> => {
    const srcs = await window.api.getRecordingSources()
    setRecSources(srcs)
    if (!recSourceId && srcs.length > 0) {
      const firstScreen = srcs.find(s => s.type === 'screen')
      if (firstScreen) setRecSourceId(firstScreen.id)
    }
  }

  const stopMacro = async (): Promise<void> => { await window.api.stopMacro() }

  const duplicateMacro = async (macro: Macro): Promise<void> => {
    const now = Date.now()
    const copy: Macro = { ...macro, id: generateId(), name: macro.name + ' (복사)', createdAt: now, updatedAt: now }
    await window.api.saveMacro(copy)
    showStatusMsg('복사됨')
    await loadMacros()
  }

  const showStatusMsg = (msg: string): void => {
    setStatus(msg)
    setTimeout(() => setStatus(''), 2000)
  }

  const isExecuting = execStatus && (execStatus.state === 'countdown' || execStatus.state === 'running')

  // Select style fix for dark theme
  const selectStyle: React.CSSProperties = {
    padding: '4px 8px', borderRadius: radius.sm,
    background: '#2c2c2e', border: `1px solid ${colors.border.primary}`,
    color: '#f5f5f7', fontSize: 10, outline: 'none', cursor: 'pointer',
    WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' as never,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%236e6e73'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 6px center',
    paddingRight: 20
  }

  return (
    <div style={{ padding: `${spacing.md}px ${spacing.lg}px` }}>

      {/* Macro List */}
      <div style={{ marginBottom: spacing.md }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: spacing.sm
        }}>
          <div style={{ ...typography.overline, color: colors.text.tertiary }}>
            매크로 ({macros.length})
          </div>
          <button onClick={createNewMacro} style={{
            padding: '3px 10px', borderRadius: radius.sm, border: 'none',
            background: colors.accent.primarySubtle, color: colors.accent.primary,
            cursor: 'pointer', fontSize: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primarySubtle }}>
            <Plus size={10} /> 새 매크로
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {macros.map((m) => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: radius.sm,
              background: editingMacro?.id === m.id ? colors.accent.primarySubtle : colors.bg.elevated,
              border: `1px solid ${editingMacro?.id === m.id ? colors.border.accent : colors.border.subtle}`,
              cursor: 'pointer', transition: transition.fast
            }} onClick={() => setEditingMacro(m)}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{
                  ...typography.caption, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{m.name}</div>
                <div style={{ fontSize: 9, color: colors.text.tertiary }}>{m.steps.length}스텝</div>
              </div>
              <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => executeMacro(m)} title="실행" style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: 'rgba(48,209,88,0.12)', color: '#30D158',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', transition: transition.fast
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(48,209,88,0.25)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(48,209,88,0.12)' }}>
                  <Play size={10} />
                </button>
                <button onClick={() => duplicateMacro(m)} title="복사" style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', transition: transition.fast
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.accent.primary }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
                  <Copy size={10} />
                </button>
                <button onClick={() => deleteMacro(m.id)} title="삭제" style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: colors.status.errorMuted, color: `${colors.status.error}80`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', transition: transition.fast
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.status.error }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = `${colors.status.error}80` }}>
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}

          {macros.length === 0 && !editingMacro && (
            <div style={{ textAlign: 'center', padding: 20, color: colors.text.tertiary, ...typography.caption }}>
              매크로가 없습니다. 새 매크로를 만들어보세요.
            </div>
          )}
        </div>
      </div>

      {/* Macro Editor */}
      {editingMacro && (
        <div style={{
          borderRadius: radius.lg, overflow: 'hidden',
          border: `1px solid ${colors.border.accent}`, marginBottom: spacing.md
        }}>
          {/* Editor Header */}
          <div style={{
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: spacing.sm,
            background: 'rgba(0,122,255,0.06)', borderBottom: `1px solid ${colors.border.accent}`
          }}>
            <input
              value={editingMacro.name}
              onChange={(e) => setEditingMacro({ ...editingMacro, name: e.target.value })}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: colors.text.primary, fontSize: 13, fontWeight: 600, padding: 0
              }}
              placeholder="매크로 이름"
            />
          </div>

          {/* Steps List */}
          <div style={{ padding: spacing.sm, maxHeight: 200, overflowY: 'auto' }}>
            {editingMacro.steps.map((step, i) => {
              const color = STEP_COLORS[step.type]
              const isDragging = dragIndex === i
              const isDragOver = dragOverIndex === i && dragIndex !== i
              return (
                <div key={i}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', borderRadius: radius.sm, marginBottom: 3,
                    background: `${color}08`,
                    border: `1px solid ${isDragOver ? colors.accent.primary : color + '15'}`,
                    borderTop: isDragOver && dragIndex !== null && dragIndex > i ? `2px solid ${colors.accent.primary}` : undefined,
                    borderBottom: isDragOver && dragIndex !== null && dragIndex < i ? `2px solid ${colors.accent.primary}` : undefined,
                    opacity: isDragging ? 0.4 : 1,
                    cursor: 'grab', transition: 'opacity 100ms, border 100ms'
                  }}>
                  <span style={{ display: 'flex', color: colors.text.tertiary, cursor: 'grab', flexShrink: 0 }}>
                    <GripVertical size={10} />
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color, minWidth: 14, textAlign: 'center' }}>{i + 1}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                    background: `${color}18`, color
                  }}>{STEP_LABELS[step.type]}</span>
                  <span style={{
                    flex: 1, fontSize: 10, color: colors.text.secondary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>{formatStepSummary(step)}</span>
                  {/* 클릭 스텝: 좌/우 토글 버튼 */}
                  {step.type === 'click' && (
                    <button onClick={() => toggleClickButton(i)} title="좌/우클릭 전환" style={{
                      padding: '1px 6px', borderRadius: 3, border: `1px solid ${color}30`,
                      background: step.button === 'right' ? `${color}20` : `${color}10`,
                      color, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                      transition: transition.fast, lineHeight: '14px'
                    }}>
                      {step.button === 'right' ? '우' : '좌'}
                    </button>
                  )}
                  <button onClick={() => removeStep(i)} style={{
                    padding: 2, border: 'none', background: 'none',
                    color: `${color}80`, cursor: 'pointer', display: 'flex', transition: transition.fast
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = color }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = `${color}80` }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              )
            })}
            {editingMacro.steps.length === 0 && (
              <div style={{ textAlign: 'center', padding: 16, color: colors.text.tertiary, fontSize: 11 }}>
                아래 버튼으로 스텝을 추가하세요
              </div>
            )}
          </div>

          {/* Add Step Buttons */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderTop: `1px solid ${colors.border.subtle}`
          }}>
            <button onClick={startPathRecording} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.path}10`,
              color: STEP_COLORS.path,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <MousePointer size={9} /> 경로녹화
            </button>

            {/* 좌표 픽 */}
            <button onClick={pickCoord} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.click}10`,
              color: STEP_COLORS.click,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <Crosshair size={9} /> 좌표 픽
            </button>

            {/* RGB 픽 */}
            <button onClick={pickRgb} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: 'rgba(191,90,242,0.10)',
              color: '#BF5AF2',
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <Pipette size={9} /> RGB 픽
            </button>

            <button onClick={() => setShowTextDialog(true)} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.text}10`, color: STEP_COLORS.text,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <Type size={9} /> 텍스트
            </button>
            <button onClick={() => setShowKeyDialog(true)} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.key}10`, color: STEP_COLORS.key,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <Keyboard size={9} /> 단축키
            </button>
            <button onClick={() => setShowWaitDialog(true)} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.wait}10`, color: STEP_COLORS.wait,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <Clock size={9} /> 대기
            </button>
            <button onClick={() => setShowDirDialog(true)} style={{
              padding: '5px 8px', borderRadius: radius.sm, border: 'none',
              background: `${STEP_COLORS.direction}10`, color: STEP_COLORS.direction,
              cursor: 'pointer', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3, transition: transition.fast
            }}>
              <ArrowRight size={9} /> 방향
            </button>
          </div>

          {/* Last Pick Result */}
          {lastPickResult && (
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderTop: `1px solid ${colors.border.subtle}`,
              background: `${STEP_COLORS.click}05`
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 6
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 3,
                  background: lastPickResult.color,
                  border: '1.5px solid rgba(255,255,255,0.2)',
                  flexShrink: 0
                }} />
                <span style={{
                  fontFamily: 'Consolas, monospace', fontSize: 11, color: colors.text.primary
                }}>
                  ({lastPickResult.x}, {lastPickResult.y})
                </span>
                <span style={{
                  fontFamily: 'Consolas, monospace', fontSize: 10, color: colors.text.secondary
                }}>
                  {lastPickResult.color}
                </span>
                <button onClick={() => setLastPickResult(null)} style={{
                  marginLeft: 'auto', padding: '1px 5px', borderRadius: 3, border: 'none',
                  background: 'none', color: colors.text.tertiary,
                  cursor: 'pointer', fontSize: 9
                }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={addMoveFromLastPick} style={{
                  flex: 1, padding: '5px', borderRadius: radius.sm, border: 'none',
                  background: `${STEP_COLORS.move}15`, color: STEP_COLORS.move,
                  cursor: 'pointer', fontSize: 9, fontWeight: 600
                }}>이동 추가</button>
                <button onClick={() => addClickFromLastPick('left')} style={{
                  flex: 1, padding: '5px', borderRadius: radius.sm, border: 'none',
                  background: `${STEP_COLORS.click}15`, color: STEP_COLORS.click,
                  cursor: 'pointer', fontSize: 9, fontWeight: 600
                }}>좌클릭 추가</button>
                <button onClick={() => addClickFromLastPick('right')} style={{
                  flex: 1, padding: '5px', borderRadius: radius.sm, border: 'none',
                  background: `${STEP_COLORS.click}10`, color: `${STEP_COLORS.click}bb`,
                  cursor: 'pointer', fontSize: 9, fontWeight: 600
                }}>우클릭 추가</button>
              </div>
            </div>
          )}

          {/* Input Dialogs */}
          {showTextDialog && (
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderTop: `1px solid ${STEP_COLORS.text}20`, background: `${STEP_COLORS.text}05`
            }}>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                <input value={textInput} onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTextStep() }}
                  placeholder="입력할 텍스트" autoFocus
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: radius.sm,
                    background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                    color: colors.text.primary, fontSize: 11, outline: 'none'
                  }} />
                <button onClick={addTextStep} style={{
                  padding: '6px 12px', borderRadius: radius.sm, border: 'none',
                  background: STEP_COLORS.text, color: '#000', cursor: 'pointer', fontSize: 10, fontWeight: 700
                }}>추가</button>
                <button onClick={() => { setShowTextDialog(false); setTextInput('') }} style={{
                  padding: '6px 8px', borderRadius: radius.sm, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary, cursor: 'pointer', fontSize: 10
                }}>취소</button>
              </div>
            </div>
          )}

          {showKeyDialog && (
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderTop: `1px solid ${STEP_COLORS.key}20`, background: `${STEP_COLORS.key}05`
            }}>
              <div style={{ fontSize: 9, color: colors.text.tertiary, marginBottom: 4 }}>
                예: ctrl+s, alt+tab, ctrl+shift+n
              </div>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addKeyStep() }}
                  placeholder="ctrl+s" autoFocus
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: radius.sm,
                    background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                    color: colors.text.primary, fontSize: 11, outline: 'none', fontFamily: 'Consolas, monospace'
                  }} />
                <button onClick={addKeyStep} style={{
                  padding: '6px 12px', borderRadius: radius.sm, border: 'none',
                  background: STEP_COLORS.key, color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 700
                }}>추가</button>
                <button onClick={() => { setShowKeyDialog(false); setKeyInput('') }} style={{
                  padding: '6px 8px', borderRadius: radius.sm, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary, cursor: 'pointer', fontSize: 10
                }}>취소</button>
              </div>
            </div>
          )}

          {showWaitDialog && (
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderTop: `1px solid ${STEP_COLORS.wait}20`, background: `${STEP_COLORS.wait}05`
            }}>
              <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
                <button onClick={() => setWaitRandom(false)} style={{
                  flex: 1, padding: '4px 0', borderRadius: `${radius.sm}px 0 0 ${radius.sm}px`,
                  border: `1px solid ${STEP_COLORS.wait}30`,
                  background: !waitRandom ? `${STEP_COLORS.wait}20` : 'transparent',
                  color: !waitRandom ? STEP_COLORS.wait : colors.text.tertiary,
                  cursor: 'pointer', fontSize: 10, fontWeight: 600
                }}>고정</button>
                <button onClick={() => setWaitRandom(true)} style={{
                  flex: 1, padding: '4px 0', borderRadius: `0 ${radius.sm}px ${radius.sm}px 0`,
                  border: `1px solid ${STEP_COLORS.wait}30`, borderLeft: 'none',
                  background: waitRandom ? `${STEP_COLORS.wait}20` : 'transparent',
                  color: waitRandom ? STEP_COLORS.wait : colors.text.tertiary,
                  cursor: 'pointer', fontSize: 10, fontWeight: 600
                }}>랜덤</button>
              </div>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                {waitRandom ? (
                  <>
                    <input value={waitMinInput} onChange={(e) => setWaitMinInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') addWaitStep() }}
                      placeholder="300" autoFocus
                      style={{
                        width: 60, padding: '6px 8px', borderRadius: radius.sm,
                        background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                        color: colors.text.primary, fontSize: 11, outline: 'none',
                        fontFamily: 'Consolas, monospace', textAlign: 'right'
                      }} />
                    <span style={{ fontSize: 10, color: colors.text.tertiary }}>~</span>
                    <input value={waitMaxInput} onChange={(e) => setWaitMaxInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') addWaitStep() }}
                      placeholder="1500"
                      style={{
                        width: 60, padding: '6px 8px', borderRadius: radius.sm,
                        background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                        color: colors.text.primary, fontSize: 11, outline: 'none',
                        fontFamily: 'Consolas, monospace', textAlign: 'right'
                      }} />
                    <span style={{ fontSize: 10, color: colors.text.tertiary }}>ms</span>
                  </>
                ) : (
                  <>
                    <input value={waitInput} onChange={(e) => setWaitInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') addWaitStep() }}
                      placeholder="500" autoFocus
                      style={{
                        width: 80, padding: '6px 10px', borderRadius: radius.sm,
                        background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                        color: colors.text.primary, fontSize: 11, outline: 'none',
                        fontFamily: 'Consolas, monospace', textAlign: 'right'
                      }} />
                    <span style={{ fontSize: 10, color: colors.text.tertiary }}>ms</span>
                  </>
                )}
                <button onClick={addWaitStep} style={{
                  padding: '6px 12px', borderRadius: radius.sm, border: 'none',
                  background: STEP_COLORS.wait, color: '#000', cursor: 'pointer', fontSize: 10, fontWeight: 700
                }}>추가</button>
                <button onClick={() => { setShowWaitDialog(false); setWaitInput('500'); setWaitRandom(false) }} style={{
                  padding: '6px 8px', borderRadius: radius.sm, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary, cursor: 'pointer', fontSize: 10
                }}>취소</button>
              </div>
            </div>
          )}

          {/* Direction Dialog */}
          {showDirDialog && (
            <div style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderTop: `1px solid ${STEP_COLORS.direction}20`, background: `${STEP_COLORS.direction}05`
            }}>
              <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
                {(['left', 'right', 'up', 'down'] as const).map(d => (
                  <button key={d} onClick={() => setDirDir(d)} style={{
                    flex: 1, padding: '4px 0', border: `1px solid ${STEP_COLORS.direction}30`,
                    borderRadius: d === 'left' ? `${radius.sm}px 0 0 ${radius.sm}px` : d === 'down' ? `0 ${radius.sm}px ${radius.sm}px 0` : 0,
                    background: dirDir === d ? `${STEP_COLORS.direction}20` : 'transparent',
                    color: dirDir === d ? STEP_COLORS.direction : colors.text.tertiary,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>{DIR_LABELS[d]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: colors.text.secondary }}>속도</span>
                <input value={dirSpeed} onChange={e => setDirSpeed(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: 40, padding: '5px 6px', borderRadius: radius.sm,
                    background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                    color: colors.text.primary, fontSize: 11, outline: 'none',
                    fontFamily: 'Consolas, monospace', textAlign: 'right'
                  }} />
                <span style={{ fontSize: 9, color: colors.text.tertiary }}>px</span>
                <span style={{ fontSize: 10, color: colors.text.secondary, marginLeft: 4 }}>시간</span>
                <input value={dirDuration} onChange={e => setDirDuration(e.target.value.replace(/\D/g, ''))}
                  placeholder="0=무한"
                  style={{
                    width: 50, padding: '5px 6px', borderRadius: radius.sm,
                    background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
                    color: colors.text.primary, fontSize: 11, outline: 'none',
                    fontFamily: 'Consolas, monospace', textAlign: 'right'
                  }} />
                <span style={{ fontSize: 9, color: colors.text.tertiary }}>초</span>
                <button onClick={addDirStep} style={{
                  padding: '5px 10px', borderRadius: radius.sm, border: 'none',
                  background: STEP_COLORS.direction, color: '#000', cursor: 'pointer', fontSize: 10, fontWeight: 700
                }}>추가</button>
                <button onClick={() => setShowDirDialog(false)} style={{
                  padding: '5px 8px', borderRadius: radius.sm, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary, cursor: 'pointer', fontSize: 10
                }}>취소</button>
              </div>
            </div>
          )}

          {/* Speed & Repeat */}
          <div style={{
            display: 'flex', gap: spacing.md, padding: `${spacing.sm}px ${spacing.md}px`,
            borderTop: `1px solid ${colors.border.subtle}`, alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: colors.text.secondary }}>속도</span>
              <select
                value={editingMacro.speed}
                onChange={(e) => setEditingMacro({ ...editingMacro, speed: parseFloat(e.target.value) })}
                style={selectStyle}
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
                <option value={3}>3x</option>
                <option value={5}>5x</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: colors.text.secondary }}>반복</span>
              {customRepeat ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input
                    value={customRepeatInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '')
                      setCustomRepeatInput(v)
                      const n = parseInt(v)
                      if (n > 0) setEditingMacro({ ...editingMacro, repeat: n })
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setCustomRepeat(false) }}
                    onBlur={() => setCustomRepeat(false)}
                    autoFocus
                    placeholder="횟수"
                    style={{
                      width: 48, padding: '3px 6px', borderRadius: radius.sm,
                      background: colors.bg.input, border: `1px solid ${colors.border.accent}`,
                      color: '#f5f5f7', fontSize: 10, outline: 'none',
                      fontFamily: 'Consolas, monospace', textAlign: 'right'
                    }}
                  />
                  <span style={{ fontSize: 9, color: colors.text.tertiary }}>회</span>
                </div>
              ) : (
                <select
                  value={editingMacro.repeat === 0 ? '0' : editingMacro.repeat === 1 ? '1' : editingMacro.repeat === 10 ? '10' : 'custom'}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'custom') {
                      setCustomRepeatInput(String(editingMacro.repeat || ''))
                      setCustomRepeat(true)
                    } else {
                      setEditingMacro({ ...editingMacro, repeat: parseInt(v) })
                    }
                  }}
                  style={selectStyle}
                >
                  <option value={1}>1회</option>
                  <option value={10}>10회</option>
                  <option value={0}>무한</option>
                  <option value="custom">직접 입력{editingMacro.repeat > 1 && editingMacro.repeat !== 10 ? ` (${editingMacro.repeat}회)` : ''}</option>
                </select>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <select
              value={editingMacro.gameMode || 'off'}
              onChange={(e) => setEditingMacro({ ...editingMacro, gameMode: e.target.value as Macro['gameMode'] })}
              title="게임 모드: 클릭 방식 변경"
              style={{
                ...selectStyle,
                background: (editingMacro.gameMode && editingMacro.gameMode !== 'off') ? 'rgba(48,209,88,0.15)' : colors.bg.input,
                color: (editingMacro.gameMode && editingMacro.gameMode !== 'off') ? '#30D158' : colors.text.tertiary,
                fontWeight: 600
              }}
            >
              <option value="off">일반</option>
              <option value="alt-hold">Alt유지</option>
              <option value="alt-click">Alt+클릭</option>
              <option value="postmsg">PostMsg</option>
              <option value="abs-input">절대좌표</option>
            </select>
            <button
              onClick={() => setEditingMacro({ ...editingMacro, runAsAdmin: !editingMacro.runAsAdmin })}
              title="관리자 권한으로 실행 — 게임이 관리자 권한일 때 필요 (UAC 확인 팝업)"
              style={{
                padding: '3px 8px', borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                background: editingMacro.runAsAdmin ? 'rgba(255,159,10,0.15)' : colors.bg.input,
                color: editingMacro.runAsAdmin ? '#FF9F0A' : colors.text.tertiary,
                fontSize: 9, fontWeight: 600, transition: transition.fast
              }}
            >
              {editingMacro.runAsAdmin ? '관리자 ON' : '관리자'}
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex', gap: spacing.xs, padding: `${spacing.sm}px ${spacing.md}px`,
            borderTop: `1px solid ${colors.border.subtle}`
          }}>
            <button onClick={() => executeMacro(editingMacro)} disabled={!!isExecuting} style={{
              flex: 2, padding: '10px', borderRadius: radius.md, border: 'none',
              background: isExecuting ? colors.bg.card : 'rgba(48,209,88,0.12)',
              color: isExecuting ? colors.text.tertiary : '#30D158',
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
              transition: transition.fast
            }}>
              <Play size={13} /> 실행
            </button>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                <button onClick={() => executeMacro(editingMacro, true)} disabled={!!isExecuting} title="화면 녹화와 함께 실행" style={{
                  padding: '10px 8px', borderRadius: `${radius.md} 0 0 ${radius.md}`, border: 'none',
                  background: isExecuting ? colors.bg.card : 'rgba(255,69,58,0.10)',
                  color: isExecuting ? colors.text.tertiary : '#FF453A',
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                  transition: transition.fast
                }}>
                  <Video size={12} /> 녹화
                </button>
                <button onClick={() => { loadRecSources(); setShowRecSourcePicker(!showRecSourcePicker) }} disabled={!!isExecuting} style={{
                  padding: '10px 4px', borderRadius: `0 ${radius.md} ${radius.md} 0`, border: 'none',
                  borderLeft: '1px solid rgba(255,69,58,0.15)',
                  background: isExecuting ? colors.bg.card : 'rgba(255,69,58,0.10)',
                  color: isExecuting ? colors.text.tertiary : '#FF453A',
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  fontSize: 10, display: 'flex', alignItems: 'center',
                  transition: transition.fast
                }}>
                  <ChevronDown size={10} />
                </button>
              </div>
              {showRecSourcePicker && recSources.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                  background: '#1c1c1e', border: `1px solid rgba(255,255,255,0.15)`,
                  borderRadius: radius.md, padding: 4, minWidth: 180, zIndex: 100,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.7)'
                }}>
                  <div style={{ fontSize: 10, color: colors.text.secondary, padding: '4px 8px', marginBottom: 2, fontWeight: 600 }}>녹화 소스</div>
                  {recSources.filter(s => s.type === 'screen').map(src => (
                    <button key={src.id} onClick={() => { setRecSourceId(src.id); setShowRecSourcePicker(false) }} style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '7px 8px', border: 'none', borderRadius: radius.sm, cursor: 'pointer',
                      background: src.id === recSourceId ? 'rgba(255,69,58,0.2)' : 'rgba(255,255,255,0.06)',
                      color: src.id === recSourceId ? '#FF453A' : colors.text.primary,
                      fontSize: 11, fontWeight: 500, textAlign: 'left', transition: transition.fast
                    }}
                      onMouseEnter={e => { if (src.id !== recSourceId) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { if (src.id !== recSourceId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                    >
                      <Monitor size={11} /> {src.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={saveMacro} style={{
              flex: 1, padding: '10px', borderRadius: radius.md, border: 'none',
              background: colors.accent.primarySubtle, color: colors.accent.primary,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
              transition: transition.fast
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primarySubtle }}>
              <Save size={13} /> 저장
            </button>
          </div>
        </div>
      )}

      {/* Execution Status Overlay */}
      {execStatus && (
        <div style={{
          padding: '12px 14px', borderRadius: radius.lg,
          background: execStatus.state === 'countdown' ? 'rgba(255,214,10,0.08)' :
                     execStatus.state === 'running' ? 'rgba(48,209,88,0.08)' : 'rgba(255,69,58,0.08)',
          border: `1px solid ${
            execStatus.state === 'countdown' ? 'rgba(255,214,10,0.2)' :
            execStatus.state === 'running' ? 'rgba(48,209,88,0.2)' : 'rgba(255,69,58,0.2)'
          }`,
          marginBottom: spacing.md
        }}>
          {execStatus.state === 'countdown' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#FFD60A', fontFamily: 'Consolas, monospace' }}>
                {execStatus.remaining}
              </div>
              <div style={{ fontSize: 10, color: colors.text.tertiary }}>초 후 실행 시작</div>
            </div>
          )}

          {execStatus.state === 'running' && (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#30D158' }}>실행 중</span>
                <span style={{ fontSize: 10, color: colors.text.secondary, fontFamily: 'Consolas, monospace' }}>
                  Step {execStatus.currentStep}/{execStatus.totalSteps}
                  {execStatus.totalRepeat !== 1 && ` · R${execStatus.currentRepeat}/${execStatus.totalRepeat === 0 ? '∞' : execStatus.totalRepeat}`}
                </span>
              </div>
              <div style={{
                height: 3, borderRadius: 2, background: 'rgba(48,209,88,0.15)',
                marginBottom: spacing.sm, overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#30D158',
                  width: `${(execStatus.currentStep / execStatus.totalSteps) * 100}%`,
                  transition: 'width 200ms ease'
                }} />
              </div>
              <button onClick={stopMacro} style={{
                width: '100%', padding: '8px', borderRadius: radius.sm,
                border: `1px solid ${colors.status.error}30`,
                background: colors.status.errorMuted, color: colors.status.error,
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs
              }}>
                <Square size={11} fill={colors.status.error} /> 긴급 정지
                <kbd style={{
                  marginLeft: 6, padding: '1px 5px', borderRadius: 3, fontSize: 9,
                  background: `${colors.status.error}20`, border: `1px solid ${colors.status.error}30`,
                  fontFamily: 'Consolas, monospace'
                }}>Win+Space</kbd>
              </button>
            </div>
          )}

          {execStatus.state === 'stopped' && (
            <div style={{ textAlign: 'center', fontSize: 11 }}>
              <span style={{
                color: execStatus.reason === 'completed' ? '#30D158' :
                       execStatus.reason === 'emergency' ? '#FFD60A' :
                       execStatus.reason === 'failsafe' ? '#FF9500' : colors.status.error,
                fontWeight: 600
              }}>
                {execStatus.reason === 'completed' ? '실행 완료' :
                 execStatus.reason === 'emergency' ? '긴급 정지됨' :
                 execStatus.reason === 'failsafe' ? '페일세이프 정지' :
                 `오류: ${execStatus.error || '알 수 없는 오류'}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{
          padding: '6px 10px', borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: 11,
          background: status.includes('삭제') || status.includes('실패') ? colors.status.errorMuted :
                     status.includes('저장') || status.includes('복사') || status.includes('완료') || status.includes('추가') ? colors.status.successMuted :
                     colors.status.warningMuted,
          color: status.includes('삭제') || status.includes('실패') ? colors.status.error :
                 status.includes('저장') || status.includes('복사') || status.includes('완료') || status.includes('추가') ? colors.status.success :
                 colors.status.warning,
          textAlign: 'center'
        }}>
          {status}
        </div>
      )}

      {/* Hint */}
      {!editingMacro && !isExecuting && (
        <div style={{ textAlign: 'center', fontSize: 10, color: colors.text.tertiary, padding: spacing.sm }}>
          실행 중 <kbd style={{
            padding: '1px 5px', borderRadius: 3, fontSize: 9,
            background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
            fontFamily: 'Consolas, monospace'
          }}>Win+Space</kbd> 긴급 정지 · 마우스→(0,0) 페일세이프
        </div>
      )}

      <style>{`
        /* Dark select dropdown for Electron/Chromium */
        select option {
          background: #2c2c2e;
          color: #f5f5f7;
        }
      `}</style>
    </div>
  )
}
