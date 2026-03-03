import { useEffect, useState } from 'react'
import { useHubStore } from '../../store/useHubStore'
import { colors, typography, spacing, radius, transition } from '../../styles/tokens'

export default function ImagesTab(): JSX.Element {
  const { images, setImages } = useHubStore()
  const [status, setStatus] = useState('')
  const [lastPath, setLastPath] = useState('')

  useEffect(() => {
    window.api.getImages().then(setImages)
  }, [setImages])

  useEffect(() => {
    const handlePaste = async (): Promise<void> => {
      const result = await window.api.pasteImage()
      if (result.success && result.path) {
        setStatus(`저장됨: ${result.fileName}`)
        setLastPath(result.path)
        const updated = await window.api.getImages()
        setImages(updated)
        setTimeout(() => setStatus(''), 3000)
      } else {
        setStatus('클립보드에 이미지가 없습니다')
        setTimeout(() => setStatus(''), 2000)
      }
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key === 'v') handlePaste()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setImages])

  const handlePasteClick = async (): Promise<void> => {
    const result = await window.api.pasteImage()
    if (result.success && result.path) {
      setStatus(`저장됨: ${result.fileName}`)
      setLastPath(result.path)
      const updated = await window.api.getImages()
      setImages(updated)
      setTimeout(() => setStatus(''), 3000)
    } else {
      setStatus('클립보드에 이미지가 없습니다')
      setTimeout(() => setStatus(''), 2000)
    }
  }

  const copyPath = (path: string): void => {
    navigator.clipboard.writeText(path)
    setStatus('경로 복사됨!')
    setTimeout(() => setStatus(''), 1500)
  }

  const deleteImage = async (path: string, name: string): Promise<void> => {
    const result = await window.api.deleteImage(path)
    if (result.success) {
      setStatus(`삭제됨: ${name}`)
      const updated = await window.api.getImages()
      setImages(updated)
      if (lastPath === path) setLastPath('')
      setTimeout(() => setStatus(''), 2000)
    } else {
      setStatus('삭제 실패')
      setTimeout(() => setStatus(''), 2000)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${spacing.md}px ${spacing.lg}px` }}>
      {/* Paste Area */}
      <button onClick={handlePasteClick}
        style={{
          width: '100%', padding: '22px', borderRadius: radius.lg,
          border: `1px dashed ${colors.border.accent}`,
          background: colors.accent.primarySubtle,
          color: colors.text.tertiary, cursor: 'pointer',
          fontSize: 12, textAlign: 'center', marginBottom: spacing.md,
          transition: transition.fast
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = colors.accent.primaryMuted
          e.currentTarget.style.borderColor = colors.accent.primary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = colors.accent.primarySubtle
          e.currentTarget.style.borderColor = colors.border.accent
        }}>
        클릭하거나 Ctrl+V로 이미지 붙여넣기
        <div style={{ fontSize: 10, marginTop: spacing.xs, color: colors.text.tertiary }}>
          스크린샷 캡처 후 여기에 붙여넣으면 자동 저장
        </div>
      </button>

      {/* Status */}
      {status && (
        <div style={{
          padding: '8px 12px', borderRadius: radius.sm, marginBottom: spacing.md, fontSize: 11,
          background: status.includes('저장') ? colors.status.successMuted :
                     status.includes('삭제됨') ? colors.status.errorMuted :
                     status.includes('복사') ? colors.accent.primarySubtle :
                     colors.status.warningMuted,
          color: status.includes('저장') ? colors.status.success :
                 status.includes('삭제됨') ? colors.status.error :
                 status.includes('복사') ? colors.accent.primary :
                 colors.status.warning,
          border: `1px solid ${
            status.includes('저장') ? `${colors.status.success}25` :
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
          background: colors.accent.primarySubtle,
          border: `1px solid ${colors.accent.primary}25`
        }}>
          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: spacing.xs }}>
            Claude에서 이 경로를 붙여넣으세요:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{
              fontSize: 10, color: colors.accent.primary, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Consolas, monospace'
            }}>
              {lastPath}
            </code>
            <button onClick={() => copyPath(lastPath)}
              style={{
                fontSize: 9, padding: '3px 10px', borderRadius: 5, border: 'none',
                background: colors.accent.primaryMuted, color: colors.accent.primary,
                cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
                transition: transition.fast
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 255, 0.25)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primaryMuted }}>
              복사
            </button>
          </div>
        </div>
      )}

      {/* Image List */}
      <div style={{
        ...typography.overline, color: colors.text.tertiary, marginBottom: spacing.sm
      }}>
        저장된 이미지 ({images.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {images.map((img) => (
          <div key={img.name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: radius.sm,
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.subtle}`,
              transition: transition.fast
            }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ ...typography.caption, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {img.name}
              </div>
              <div style={{ fontSize: 9, color: colors.text.tertiary }}>
                {new Date(img.time).toLocaleString('ko-KR')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: spacing.xs, marginLeft: spacing.sm, flexShrink: 0 }}>
              <button onClick={() => copyPath(img.path)}
                style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: colors.bg.card, color: colors.text.tertiary,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: transition.fast
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.card }}>
                경로 복사
              </button>
              <button onClick={() => deleteImage(img.path, img.name)}
                style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: colors.status.errorMuted, color: `${colors.status.error}80`,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: transition.fast
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${colors.status.error}30`
                  e.currentTarget.style.color = colors.status.error
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.status.errorMuted
                  e.currentTarget.style.color = `${colors.status.error}80`
                }}>
                삭제
              </button>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: colors.text.tertiary, ...typography.caption }}>
            아직 저장된 이미지가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
