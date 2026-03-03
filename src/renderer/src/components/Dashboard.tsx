import { useState, useCallback } from 'react'
import { useHubStore } from '../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../styles/tokens'
import { Contrast, Link2, Image, Video, Zap, ChevronsLeft, ChevronsRight, ArrowLeft } from 'lucide-react'
import HomeTab from './tabs/HomeTab'
import WorkTab from './tabs/WorkTab'
import ToolsTab from './tabs/ToolsTab'
import NotesTab from './tabs/NotesTab'
import MoreTab from './tabs/MoreTab'
import LinksTab from './tabs/LinksTab'
import ImagesTab from './tabs/ImagesTab'
import QuickRecSection from './tabs/QuickRecSection'
import MacroSection from './tabs/MacroSection'

const TABS: Array<{ id: 'home' | 'work' | 'tools' | 'notes' | 'more'; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'tools', label: 'Tools' },
  { id: 'notes', label: 'Notes' },
  { id: 'more', label: '···' }
]

const PANEL_W = 420
const MINI_W = 52

type MiniTool = 'links' | 'images' | 'quickrec' | 'macro' | null

const TOOL_ITEMS: Array<{ id: MiniTool; icon: React.ReactNode; color: string; label: string }> = [
  { id: 'quickrec', icon: <Video size={18} />, color: '#FF453A', label: '녹화' },
  { id: 'macro', icon: <Zap size={18} />, color: '#FFD60A', label: '매크로' },
  { id: 'links', icon: <Link2 size={18} />, color: colors.accent.primary, label: '링크' },
  { id: 'images', icon: <Image size={18} />, color: colors.status.info, label: '이미지' }
]

export default function Dashboard(): JSX.Element {
  const { activeTab, setActiveTab } = useHubStore()
  const [showOpacity, setShowOpacity] = useState(false)
  const [opacity, setOpacity] = useState(85)
  const [miniMode, setMiniMode] = useState(false)
  const [miniTool, setMiniTool] = useState<MiniTool>(null)

  const handleOpacity = (val: number): void => {
    setOpacity(val)
    document.documentElement.style.setProperty('--bg-opacity', String(val / 100))
  }

  const goMini = useCallback(() => {
    setMiniMode(true)
    setMiniTool(null)
    window.api.setPanelWidth(MINI_W)
  }, [])

  const goFull = useCallback(() => {
    setMiniMode(false)
    setMiniTool(null)
    window.api.setPanelWidth(PANEL_W)
  }, [])

  const openMiniTool = useCallback((id: MiniTool) => {
    setMiniTool(id)
    window.api.setPanelWidth(PANEL_W)
  }, [])

  const backToMini = useCallback(() => {
    setMiniTool(null)
    window.api.setPanelWidth(MINI_W)
  }, [])

  // ─── Mini mode: icon strip ───
  if (miniMode && !miniTool) {
    return (
      <div style={{
        width: '100%', height: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        color: colors.text.primary, paddingTop: 8
      }}>
        {/* Expand button */}
        <button onClick={goFull} title="펼치기" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: colors.text.tertiary, padding: 8, marginBottom: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: radius.sm, transition: transition.fast, WebkitAppRegion: 'no-drag' as never
        }}
          onMouseEnter={e => { e.currentTarget.style.background = colors.bg.cardHover; e.currentTarget.style.color = colors.text.primary }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.text.tertiary }}
        >
          <ChevronsLeft size={16} />
        </button>

        <div style={{ width: 28, height: 1, background: colors.border.subtle, marginBottom: 8 }} />

        {/* Tool icons */}
        {TOOL_ITEMS.map(tool => (
          <div key={tool.id} style={{ position: 'relative' }}
            onMouseEnter={e => {
              const btn = e.currentTarget.querySelector('button') as HTMLElement
              const lbl = e.currentTarget.querySelector('[data-label]') as HTMLElement
              if (btn) { btn.style.background = `${tool.color}18`; btn.style.color = tool.color }
              if (lbl) { lbl.style.opacity = '1'; lbl.style.transform = 'translateX(0)' }
            }}
            onMouseLeave={e => {
              const btn = e.currentTarget.querySelector('button') as HTMLElement
              const lbl = e.currentTarget.querySelector('[data-label]') as HTMLElement
              if (btn) { btn.style.background = 'none'; btn.style.color = colors.text.tertiary }
              if (lbl) { lbl.style.opacity = '0'; lbl.style.transform = 'translateX(4px)' }
            }}
          >
            <button onClick={() => openMiniTool(tool.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.text.tertiary, padding: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.md, transition: transition.fast,
              WebkitAppRegion: 'no-drag' as never
            }}>
              {tool.icon}
            </button>
            <div data-label style={{
              position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%) translateX(4px)',
              marginRight: 6, whiteSpace: 'nowrap',
              background: '#1c1c1e', border: `1px solid rgba(255,255,255,0.12)`,
              borderRadius: radius.sm, padding: '3px 8px',
              fontSize: 10, fontWeight: 600, color: tool.color,
              opacity: 0, transition: 'opacity 0.15s, transform 0.15s',
              pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
            }}>
              {tool.label}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── Mini mode: tool open ───
  if (miniMode && miniTool) {
    const toolInfo = TOOL_ITEMS.find(t => t.id === miniTool)!
    return (
      <div style={{
        width: '100%', height: '100vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        color: colors.text.primary
      }}>
        {/* Mini tool header */}
        <div style={{
          padding: `${spacing.sm}px ${spacing.md}px`,
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          borderBottom: `1px solid ${colors.border.subtle}`,
          WebkitAppRegion: 'drag' as never
        }}>
          <button onClick={backToMini} title="접기" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.text.tertiary, padding: 4, display: 'flex', alignItems: 'center',
            borderRadius: radius.sm, transition: transition.fast,
            WebkitAppRegion: 'no-drag' as never
          }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.text.primary }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.text.tertiary }}
          >
            <ArrowLeft size={14} />
          </button>
          <span style={{ display: 'flex', alignItems: 'center', color: toolInfo.color }}>{toolInfo.icon}</span>
          <span style={{ ...typography.subtitle, color: toolInfo.color }}>{toolInfo.label}</span>
          <div style={{ flex: 1 }} />
          <button onClick={goFull} title="전체 보기" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.text.tertiary, padding: 4, display: 'flex', alignItems: 'center',
            borderRadius: radius.sm, transition: transition.fast,
            WebkitAppRegion: 'no-drag' as never
          }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.text.primary }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.text.tertiary }}
          >
            <ChevronsLeft size={14} />
          </button>
        </div>

        {/* Tool content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <div style={{ display: miniTool === 'links' ? undefined : 'none' }}><LinksTab /></div>
            <div style={{ display: miniTool === 'images' ? undefined : 'none' }}><ImagesTab /></div>
            <div style={{ display: miniTool === 'quickrec' ? undefined : 'none' }}><QuickRecSection /></div>
            <div style={{ display: miniTool === 'macro' ? undefined : 'none' }}><MacroSection /></div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Full mode ───
  return (
    <div style={{
      width: '100%', height: '100vh',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      color: colors.text.primary
    }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.lg}px ${spacing.xl}px ${spacing.md}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        WebkitAppRegion: 'drag' as never,
        borderBottom: `1px solid ${colors.border.subtle}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <img
            src="data:image/png;base64,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"
            alt="logo"
            style={{ height: 24, objectFit: 'contain' }}
          />
          <span style={{
            ...typography.title,
            letterSpacing: -0.3,
            color: colors.text.primary
          }}>
            Sophia Hub
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, WebkitAppRegion: 'no-drag' as never }}>
          <button onClick={() => setShowOpacity(!showOpacity)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12,
              color: showOpacity ? colors.accent.primary : colors.text.tertiary,
              padding: `${spacing.xs}px`,
              transition: transition.fast
            }}
            title="배경 투명도 조절">
            <Contrast size={12} />
          </button>
          <button onClick={goMini} title="접기" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.text.tertiary, padding: `${spacing.xs}px`,
            display: 'flex', alignItems: 'center',
            transition: transition.fast
          }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.text.primary }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.text.tertiary }}
          >
            <ChevronsRight size={14} />
          </button>
          <span style={{
            ...typography.overline,
            color: colors.text.tertiary
          }}>
            Alt+Space
          </span>
        </div>
      </div>

      {/* Opacity slider */}
      {showOpacity && (
        <div style={{
          padding: `${spacing.sm}px ${spacing.xl}px`,
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          borderBottom: `1px solid ${colors.border.subtle}`,
          background: colors.bg.elevated
        }}>
          <span style={{ ...typography.caption, color: colors.text.tertiary, whiteSpace: 'nowrap' }}>배경</span>
          <input type="range" min={10} max={100} value={opacity}
            onChange={(e) => handleOpacity(Number(e.target.value))}
            style={{ flex: 1, accentColor: colors.accent.primary, height: 3, cursor: 'pointer' }} />
          <span style={{ ...typography.caption, color: colors.accent.primary, minWidth: 28, textAlign: 'right' }}>{opacity}%</span>
        </div>
      )}

      {/* Tab Bar */}
      <div style={{
        display: 'flex', gap: spacing.xs,
        padding: `${spacing.sm}px ${spacing.sm}px`,
        borderBottom: `1px solid ${colors.border.subtle}`
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: `${spacing.sm}px 0`, border: 'none',
                borderRadius: radius.sm,
                background: isActive ? colors.accent.primarySubtle : 'transparent',
                cursor: 'pointer',
                color: isActive ? colors.accent.primary : colors.text.tertiary,
                fontSize: typography.caption.fontSize,
                fontWeight: isActive ? 600 : 400,
                transition: transition.fast,
                letterSpacing: 0.2,
                position: 'relative'
              }}
            >
              <span>{tab.label}</span>
              {isActive && (
                <div style={{
                  position: 'absolute', bottom: -1, left: '25%', right: '25%', height: 2,
                  borderRadius: 1,
                  background: colors.accent.primary
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Content — display:none으로 숨겨 녹화 중 언마운트 방지 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: activeTab === 'home' ? undefined : 'none', height: '100%' }}><HomeTab /></div>
        <div style={{ display: activeTab === 'work' ? undefined : 'none', height: '100%' }}><WorkTab /></div>
        <div style={{ display: activeTab === 'tools' ? undefined : 'none', height: '100%' }}><ToolsTab /></div>
        <div style={{ display: activeTab === 'notes' ? undefined : 'none', height: '100%' }}><NotesTab /></div>
        <div style={{ display: activeTab === 'more' ? undefined : 'none', height: '100%' }}><MoreTab /></div>
      </div>
    </div>
  )
}
