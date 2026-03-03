import { useState } from 'react'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'
import { Link2, Image, Video, Zap, ChevronDown } from 'lucide-react'
import LinksTab from './LinksTab'
import ImagesTab from './ImagesTab'
import QuickRecSection from './QuickRecSection'
import MacroSection from './MacroSection'

const TOOLS: Array<{ id: string; label: string; icon: React.ReactNode; color: string; desc: string }> = [
  { id: 'links', label: 'Links', icon: <Link2 size={16} />, color: colors.accent.primary, desc: '즐겨찾기 관리' },
  { id: 'images', label: 'Images', icon: <Image size={16} />, color: colors.status.info, desc: '이미지 붙여넣기/관리' },
  { id: 'quickrec', label: 'QuickRec', icon: <Video size={16} />, color: '#FF453A', desc: '화면 녹화' }
]

function ToolSection({ title, icon, color, desc, defaultOpen, children }: {
  title: string; icon: React.ReactNode; color: string; desc: string; defaultOpen: boolean; children: React.ReactNode
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
          <span style={{ fontSize: 10, color: colors.text.tertiary, marginLeft: 2 }}>{desc}</span>
        </div>
        <span style={{
          color: colors.text.tertiary, transition: transition.fast,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'flex'
        }}><ChevronDown size={12} /></span>
      </button>
      {open && <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>{children}</div>}
    </div>
  )
}

export default function ToolsTab(): JSX.Element {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      <div style={{ ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.md }}>
        편의도구
      </div>

      <ToolSection
        title="Links" icon={<Link2 size={14} />}
        color={colors.accent.primary} desc="즐겨찾기" defaultOpen={false}>
        <LinksTab />
      </ToolSection>

      <ToolSection
        title="Images" icon={<Image size={14} />}
        color={colors.status.info} desc="이미지 관리" defaultOpen={false}>
        <ImagesTab />
      </ToolSection>

      <ToolSection
        title="QuickRec" icon={<Video size={14} />}
        color="#FF453A" desc="화면 녹화" defaultOpen={false}>
        <QuickRecSection />
      </ToolSection>

      <ToolSection
        title="Simple Macro" icon={<Zap size={14} />}
        color="#FFD60A" desc="매크로 녹화 및 실행" defaultOpen={false}>
        <MacroSection />
      </ToolSection>
    </div>
  )
}
