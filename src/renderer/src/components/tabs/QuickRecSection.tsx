import { useEffect, useState, useRef, useCallback } from 'react'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'
import { Video, Square, FolderOpen, Play, Trash2, Copy, Monitor, AppWindow, ChevronDown, Camera, Crop, ClipboardCopy, X } from 'lucide-react'
// fix-webm-duration 제거 — Cluster 오프셋 손상으로 영상 후반부 재생 불가 이슈

type RecState = 'idle' | 'recording'

export default function QuickRecSection(): JSX.Element {
  const [sources, setSources] = useState<RecordingSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [recState, setRecState] = useState<RecState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [recordings, setRecordings] = useState<RecordingFile[]>([])
  const [status, setStatus] = useState('')
  const [lastPath, setLastPath] = useState('')
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<{ dataUrl: string; path: string; fileName: string } | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const elapsedRef = useRef(0)

  // Load sources and recordings
  useEffect(() => {
    loadSources()
    loadRecordings()
  }, [])

  const loadSources = async (): Promise<void> => {
    const srcs = await window.api.getRecordingSources()
    setSources(srcs)
    // Auto-select first screen
    const firstScreen = srcs.find((s) => s.type === 'screen')
    if (firstScreen && !selectedSourceId) {
      setSelectedSourceId(firstScreen.id)
    }
  }

  const loadRecordings = async (): Promise<void> => {
    const recs = await window.api.getRecordings()
    setRecordings(recs)
  }

  // Toggle recording (for global shortcut)
  const toggleRecording = useCallback(async () => {
    if (recState === 'recording') {
      stopRecording()
    } else {
      await startRecording()
    }
  }, [recState, selectedSourceId])

  // Listen for global shortcut
  useEffect(() => {
    const unsub = window.api.onToggleRecording(() => {
      toggleRecording()
    })
    return unsub
  }, [toggleRecording])

  const startRecording = async (): Promise<void> => {
    if (!selectedSourceId) {
      setStatus('녹화 소스를 선택해주세요')
      setTimeout(() => setStatus(''), 2000)
      return
    }

    try {
      // Refresh sources to get current IDs
      await loadSources()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      })

      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 5_000_000
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        // fix-webm-duration 제거: Cluster 오프셋 손상으로 영상 후반부 깨짐
        // 시크바 이동 불가하지만 녹화 품질 보장
        const buffer = await blob.arrayBuffer()
        const result = await window.api.saveRecording(buffer)

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        if (result.success && result.path) {
          setStatus(`저장됨: ${result.fileName}`)
          setLastPath(result.path)
          loadRecordings()
        } else {
          setStatus(`저장 실패: ${result.error}`)
        }
        setTimeout(() => setStatus(''), 3000)
      }

      recorder.start(1000) // Collect data every 1s
      mediaRecorderRef.current = recorder
      setRecState('recording')
      setElapsed(0)
      elapsedRef.current = 0

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          elapsedRef.current = prev + 1
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      setStatus(`녹화 시작 실패: ${(err as Error).message}`)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    setRecState('idle')
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const copyPath = (path: string): void => {
    navigator.clipboard.writeText(path)
    setStatus('경로 복사됨!')
    setTimeout(() => setStatus(''), 1500)
  }

  const deleteRecording = async (path: string, name: string): Promise<void> => {
    const result = await window.api.deleteRecording(path)
    if (result.success) {
      setStatus(`삭제됨: ${name}`)
      if (lastPath === path) setLastPath('')
      loadRecordings()
    } else {
      setStatus('삭제 실패')
    }
    setTimeout(() => setStatus(''), 2000)
  }

  // 캡쳐 후 미리보기 로드
  const showPreview = async (path: string, fileName: string): Promise<void> => {
    const dataUrl = await window.api.getImageData(path)
    if (dataUrl) {
      setPreview({ dataUrl, path, fileName })
    }
  }

  // 이미지 클립보드 복사
  const copyImageToClipboard = async (path: string): Promise<void> => {
    const result = await window.api.copyImageToClipboard(path)
    if (result.success) {
      setStatus('이미지 복사됨!')
    } else {
      setStatus('복사 실패')
    }
    setTimeout(() => setStatus(''), 2000)
  }

  // 전체 화면 캡쳐
  const captureFullScreen = async (): Promise<void> => {
    if (!selectedSourceId) {
      setStatus('캡쳐 소스를 선택해주세요')
      setTimeout(() => setStatus(''), 2000)
      return
    }
    setCapturing(true)
    try {
      const result = await window.api.captureScreen(selectedSourceId)
      if (result.success && result.path && result.fileName) {
        setLastPath(result.path)
        loadRecordings()
        await showPreview(result.path, result.fileName)
      } else {
        setStatus(`캡쳐 실패: ${result.error}`)
        setTimeout(() => setStatus(''), 3000)
      }
    } catch (err) {
      setStatus(`캡쳐 실패: ${(err as Error).message}`)
      setTimeout(() => setStatus(''), 3000)
    }
    setCapturing(false)
  }

  // 영역 지정 캡쳐 (모든 모니터에서 선택 가능)
  const captureRegion = async (): Promise<void> => {
    setCapturing(true)
    try {
      const result = await window.api.captureRegion(selectedSourceId)
      if (result.success && result.path && result.fileName) {
        setLastPath(result.path)
        loadRecordings()
        await showPreview(result.path, result.fileName)
      } else if (result.error !== 'cancelled') {
        setStatus(`캡쳐 실패: ${result.error}`)
        setTimeout(() => setStatus(''), 3000)
      }
    } catch (err) {
      setStatus(`캡쳐 실패: ${(err as Error).message}`)
      setTimeout(() => setStatus(''), 3000)
    }
    setCapturing(false)
  }

  const selectedSource = sources.find((s) => s.id === selectedSourceId)
  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')

  const REC_COLOR = '#FF453A'

  return (
    <div style={{ padding: `${spacing.md}px ${spacing.lg}px` }}>

      {/* Source Picker */}
      {recState === 'idle' && (
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.xs }}>
            녹화 소스
          </div>
          <button
            onClick={() => { loadSources(); setShowSourcePicker(!showSourcePicker) }}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: radius.md,
              background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
              color: colors.text.primary, cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, transition: transition.fast
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border.accent }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <span style={{ display: 'flex', color: colors.text.tertiary }}>
                {selectedSource?.type === 'window' ? <AppWindow size={14} /> : <Monitor size={14} />}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedSource?.name || '소스 선택...'}
              </span>
            </div>
            <ChevronDown size={12} style={{
              color: colors.text.tertiary,
              transform: showSourcePicker ? 'rotate(180deg)' : 'rotate(0)',
              transition: transition.fast
            }} />
          </button>

          {showSourcePicker && (
            <div style={{
              marginTop: spacing.xs, borderRadius: radius.md,
              border: `1px solid ${colors.border.primary}`,
              background: colors.bg.elevated, maxHeight: 220, overflowY: 'auto'
            }}>
              {/* Screens */}
              {screens.length > 0 && (
                <>
                  <div style={{
                    padding: '6px 12px', fontSize: 9, fontWeight: 600,
                    color: colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1
                  }}>
                    화면
                  </div>
                  {screens.map((src) => (
                    <button key={src.id}
                      onClick={() => { setSelectedSourceId(src.id); setShowSourcePicker(false) }}
                      style={{
                        width: '100%', padding: '8px 12px', border: 'none',
                        background: src.id === selectedSourceId ? colors.accent.primarySubtle : 'transparent',
                        color: src.id === selectedSourceId ? colors.accent.primary : colors.text.secondary,
                        cursor: 'pointer', textAlign: 'left', display: 'flex',
                        alignItems: 'center', gap: spacing.sm, fontSize: 11,
                        transition: transition.fast
                      }}
                      onMouseEnter={(e) => { if (src.id !== selectedSourceId) e.currentTarget.style.background = colors.bg.cardHover }}
                      onMouseLeave={(e) => { if (src.id !== selectedSourceId) e.currentTarget.style.background = 'transparent' }}
                    >
                      <Monitor size={12} />
                      <span>{src.name}</span>
                    </button>
                  ))}
                </>
              )}
              {/* Windows */}
              {windows.length > 0 && (
                <>
                  <div style={{
                    padding: '6px 12px', fontSize: 9, fontWeight: 600,
                    color: colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1,
                    borderTop: `1px solid ${colors.border.subtle}`
                  }}>
                    창
                  </div>
                  {windows.slice(0, 15).map((src) => (
                    <button key={src.id}
                      onClick={() => { setSelectedSourceId(src.id); setShowSourcePicker(false) }}
                      style={{
                        width: '100%', padding: '8px 12px', border: 'none',
                        background: src.id === selectedSourceId ? colors.accent.primarySubtle : 'transparent',
                        color: src.id === selectedSourceId ? colors.accent.primary : colors.text.secondary,
                        cursor: 'pointer', textAlign: 'left', display: 'flex',
                        alignItems: 'center', gap: spacing.sm, fontSize: 11,
                        transition: transition.fast, overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => { if (src.id !== selectedSourceId) e.currentTarget.style.background = colors.bg.cardHover }}
                      onMouseLeave={(e) => { if (src.id !== selectedSourceId) e.currentTarget.style.background = 'transparent' }}
                    >
                      <AppWindow size={12} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {src.name}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Record / Stop Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <button
          onClick={toggleRecording}
          style={{
            flex: 1, padding: '14px', borderRadius: radius.lg,
            border: recState === 'recording'
              ? `1px solid ${REC_COLOR}40`
              : `1px solid ${colors.accent.primary}30`,
            background: recState === 'recording'
              ? `${REC_COLOR}15`
              : colors.accent.primarySubtle,
            color: recState === 'recording' ? REC_COLOR : colors.accent.primary,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
            transition: transition.fast
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = recState === 'recording'
              ? `${REC_COLOR}25` : colors.accent.primaryMuted
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = recState === 'recording'
              ? `${REC_COLOR}15` : colors.accent.primarySubtle
          }}
        >
          {recState === 'recording' ? (
            <>
              <Square size={14} fill={REC_COLOR} />
              녹화 중지
            </>
          ) : (
            <>
              <Video size={14} />
              녹화 시작
            </>
          )}
        </button>

        {recState === 'recording' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.xs,
            padding: '8px 14px', borderRadius: radius.lg,
            background: `${REC_COLOR}12`, border: `1px solid ${REC_COLOR}30`
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: REC_COLOR,
              animation: 'quickrec-pulse 1.2s ease-in-out infinite'
            }} />
            <span style={{
              fontFamily: 'Consolas, monospace', fontSize: 13, fontWeight: 600,
              color: REC_COLOR, letterSpacing: 1, minWidth: 45, textAlign: 'center'
            }}>
              {formatTime(elapsed)}
            </span>
          </div>
        )}
      </div>

      {/* Capture Buttons */}
      {recState === 'idle' && (
        <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
          <button
            onClick={captureFullScreen}
            disabled={capturing}
            style={{
              flex: 1, padding: '10px', borderRadius: radius.md,
              border: `1px solid ${colors.status.info}30`,
              background: colors.status.infoMuted,
              color: colors.status.info,
              cursor: capturing ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
              transition: transition.fast,
              opacity: capturing ? 0.6 : 1
            }}
            onMouseEnter={(e) => { if (!capturing) e.currentTarget.style.background = `${colors.status.info}25` }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.status.infoMuted }}
          >
            <Camera size={13} />
            전체 캡쳐
          </button>
          <button
            onClick={captureRegion}
            disabled={capturing}
            style={{
              flex: 1, padding: '10px', borderRadius: radius.md,
              border: `1px solid #BF5AF230`,
              background: 'rgba(191,90,242,0.08)',
              color: '#BF5AF2',
              cursor: capturing ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
              transition: transition.fast,
              opacity: capturing ? 0.6 : 1
            }}
            onMouseEnter={(e) => { if (!capturing) e.currentTarget.style.background = 'rgba(191,90,242,0.18)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(191,90,242,0.08)' }}
          >
            <Crop size={13} />
            영역 캡쳐
          </button>
        </div>
      )}

      {/* Capture Preview */}
      {preview && (
        <div style={{
          marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden',
          border: `1px solid ${colors.status.success}30`,
          background: colors.bg.elevated
        }}>
          {/* Preview header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: `${colors.status.success}08`,
            borderBottom: `1px solid ${colors.status.success}15`
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: colors.status.success }}>
              {preview.fileName}
            </span>
            <button onClick={() => setPreview(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: colors.text.tertiary, display: 'flex', padding: 2,
                transition: transition.fast
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = colors.text.secondary }}
              onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
              <X size={14} />
            </button>
          </div>

          {/* Preview image */}
          <div style={{ padding: spacing.sm, background: 'rgba(0,0,0,0.2)' }}>
            <img
              src={preview.dataUrl}
              alt="캡쳐 미리보기"
              style={{
                width: '100%', borderRadius: radius.sm,
                border: `1px solid ${colors.border.subtle}`
              }}
            />
          </div>

          {/* Preview actions */}
          <div style={{
            display: 'flex', gap: spacing.xs, padding: `${spacing.sm}px ${spacing.md}px`
          }}>
            <button onClick={() => copyImageToClipboard(preview.path)}
              style={{
                flex: 1, padding: '8px', borderRadius: radius.sm,
                border: `1px solid ${colors.accent.primary}30`,
                background: colors.accent.primarySubtle,
                color: colors.accent.primary,
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                transition: transition.fast
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primarySubtle }}>
              <ClipboardCopy size={12} /> 이미지 복사
            </button>
            <button onClick={() => copyPath(preview.path)}
              style={{
                padding: '8px 12px', borderRadius: radius.sm,
                border: `1px solid ${colors.border.primary}`,
                background: colors.bg.card,
                color: colors.text.secondary,
                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                transition: transition.fast
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card }}>
              <Copy size={11} /> 경로
            </button>
            <button onClick={() => window.api.openRecordingsFolder()}
              style={{
                padding: '8px 12px', borderRadius: radius.sm,
                border: `1px solid ${colors.border.primary}`,
                background: colors.bg.card,
                color: colors.text.secondary,
                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                transition: transition.fast
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card }}>
              <FolderOpen size={11} /> 폴더
            </button>
          </div>
        </div>
      )}

      {/* Recording indicator */}
      {recState === 'recording' && selectedSource && (
        <div style={{
          padding: '8px 12px', borderRadius: radius.sm, marginBottom: spacing.md,
          background: `${REC_COLOR}08`, border: `1px solid ${REC_COLOR}15`,
          display: 'flex', alignItems: 'center', gap: spacing.sm
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: REC_COLOR, letterSpacing: 1 }}>REC</span>
          <span style={{ fontSize: 11, color: colors.text.secondary }}>{selectedSource.name}</span>
        </div>
      )}

      {/* Shortcut hint */}
      {recState === 'idle' && (
        <div style={{
          textAlign: 'center', fontSize: 10, color: colors.text.tertiary, marginBottom: spacing.md
        }}>
          <kbd style={{
            padding: '2px 6px', borderRadius: 3, fontSize: 9,
            background: colors.bg.input, border: `1px solid ${colors.border.primary}`,
            fontFamily: 'Consolas, monospace'
          }}>Ctrl+Shift+R</kbd>
          {' '}으로 어디서든 녹화 토글
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{
          padding: '8px 12px', borderRadius: radius.sm, marginBottom: spacing.md, fontSize: 11,
          background: status.includes('저장됨') ? colors.status.successMuted :
                     status.includes('삭제됨') ? colors.status.errorMuted :
                     status.includes('복사') ? colors.accent.primarySubtle :
                     colors.status.warningMuted,
          color: status.includes('저장됨') ? colors.status.success :
                 status.includes('삭제됨') ? colors.status.error :
                 status.includes('복사') ? colors.accent.primary :
                 colors.status.warning,
          border: `1px solid ${
            status.includes('저장됨') ? `${colors.status.success}25` :
            status.includes('삭제됨') ? `${colors.status.error}25` :
            status.includes('복사') ? `${colors.accent.primary}25` :
            `${colors.status.warning}25`
          }`
        }}>
          {status}
        </div>
      )}

      {/* Last saved path */}
      {lastPath && (
        <div style={{
          padding: '10px 12px', borderRadius: radius.md, marginBottom: spacing.md,
          background: colors.status.successMuted,
          border: `1px solid ${colors.status.success}25`
        }}>
          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: spacing.xs }}>
            저장 경로:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{
              fontSize: 10, color: colors.status.success, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Consolas, monospace'
            }}>
              {lastPath}
            </code>
            <button onClick={() => copyPath(lastPath)}
              style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 4, border: 'none',
                background: `${colors.status.success}20`, color: colors.status.success,
                cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
                transition: transition.fast, display: 'flex', alignItems: 'center', gap: 3
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.status.success}30` }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `${colors.status.success}20` }}>
              <Copy size={9} /> 복사
            </button>
            <button onClick={() => window.api.openRecordingsFolder()}
              style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 4, border: 'none',
                background: colors.bg.card, color: colors.text.tertiary,
                cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
                transition: transition.fast, display: 'flex', alignItems: 'center', gap: 3
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card }}>
              <FolderOpen size={9} /> 폴더
            </button>
          </div>
        </div>
      )}

      {/* Recording List */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: spacing.sm
      }}>
        <div style={{ ...typography.overline, color: colors.text.tertiary }}>
          최근 파일 ({recordings.length})
        </div>
        {recordings.length > 0 && (
          <button onClick={() => window.api.openRecordingsFolder()}
            style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4, border: 'none',
              background: 'transparent', color: colors.text.tertiary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
              transition: transition.fast
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = colors.text.secondary }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.tertiary }}>
            <FolderOpen size={9} /> 폴더 열기
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {recordings.map((rec) => (
          <div key={rec.name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: radius.sm,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.subtle}`,
              transition: transition.fast
            }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                ...typography.caption, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                <span style={{
                  fontSize: 9, padding: '1px 4px', borderRadius: 3, fontWeight: 600, flexShrink: 0,
                  background: rec.name.endsWith('.png') ? `${colors.status.info}18` : `${REC_COLOR}18`,
                  color: rec.name.endsWith('.png') ? colors.status.info : REC_COLOR
                }}>
                  {rec.name.endsWith('.png') ? 'CAP' : 'REC'}
                </span>
                <span>{rec.name}</span>
              </div>
              <div style={{ fontSize: 9, color: colors.text.tertiary, display: 'flex', gap: spacing.sm }}>
                <span>{new Date(rec.time).toLocaleString('ko-KR')}</span>
                <span>{formatSize(rec.size)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: spacing.xs, marginLeft: spacing.sm, flexShrink: 0 }}>
              <button onClick={() => window.api.openRecording(rec.path)}
                title="재생"
                style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  transition: transition.fast
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover; e.currentTarget.style.color = colors.accent.primary }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card; e.currentTarget.style.color = colors.text.tertiary }}>
                <Play size={10} />
              </button>
              <button onClick={() => copyPath(rec.path)}
                title="경로 복사"
                style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  transition: transition.fast
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover; e.currentTarget.style.color = colors.accent.primary }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card; e.currentTarget.style.color = colors.text.tertiary }}>
                <Copy size={10} />
              </button>
              <button onClick={() => deleteRecording(rec.path, rec.name)}
                title="삭제"
                style={{
                  padding: '3px 6px', borderRadius: 4, border: 'none',
                  background: colors.status.errorMuted, color: `${colors.status.error}80`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  transition: transition.fast
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.status.error}30`; e.currentTarget.style.color = colors.status.error }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.status.errorMuted; e.currentTarget.style.color = `${colors.status.error}80` }}>
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        ))}
        {recordings.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: colors.text.tertiary, ...typography.caption }}>
            아직 녹화/캡쳐 파일이 없습니다
          </div>
        )}
      </div>

      {/* Pulse animation for recording indicator */}
      <style>{`
        @keyframes quickrec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
