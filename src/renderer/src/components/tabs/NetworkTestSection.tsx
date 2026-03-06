import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, radius, transition } from '../../styles/tokens'

interface LogEntry {
  time: string
  msg: string
  type: 'info' | 'success' | 'error'
}

interface GameInfo {
  name: string
  ips: string[]
  blocked: boolean
}

interface BlockRule {
  name: string
  direction: string
}

const api = (window as any).api

export default function NetworkTestSection(): JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [adminReady, setAdminReady] = useState(false)
  const [games, setGames] = useState<GameInfo[]>([])
  const [running, setRunning] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [blockRules, setBlockRules] = useState<BlockRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)

  const now = (): string => new Date().toLocaleTimeString('ko-KR', { hour12: false })

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{ time: now(), msg, type }, ...prev].slice(0, 50))
  }, [])

  const loadBlockRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const rules: BlockRule[] = await api.netGetBlockRules()
      setBlockRules(rules)
    } catch {
      setBlockRules([])
    }
    setRulesLoading(false)
  }, [])

  const removeBlockRule = async (rule: BlockRule) => {
    const cmd = `netsh advfirewall firewall delete rule name="${rule.name}"`
    const ok = await run(cmd, `규칙 삭제: ${rule.name}`)
    if (ok) loadBlockRules()
  }

  const removeAllBlockRules = async () => {
    const ok = await run(
      `Get-NetFirewallRule | Where-Object { $_.DisplayName -like '*QA_BLOCK*' } | Remove-NetFirewallRule`,
      '모든 QA 차단 규칙 삭제'
    )
    if (ok) setBlockRules([])
  }

  useEffect(() => {
    api.netCheckAdmin().then((ok: boolean) => setAdminReady(ok))
    detectGames()
    loadBlockRules()
  }, [])

  const setupAdmin = async () => {
    setSetupLoading(true)
    addLog('관리자 권한 설정 중... (UAC 팝업 확인)', 'info')
    const ok = await api.netSetupAdmin()
    setAdminReady(ok)
    addLog(ok ? '관리자 권한 설정 완료' : '설정 실패', ok ? 'success' : 'error')
    setSetupLoading(false)
  }

  const detectGames = async () => {
    setDetecting(true)
    try {
      const result: Record<string, string[]> = await api.netDetectGameIps()
      const freshList: GameInfo[] = Object.entries(result).map(([name, ips]) => ({
        name, ips: ips as string[], blocked: false
      }))
      // 차단된 게임은 목록에 유지 (연결 끊겨서 탐지 안 되더라도)
      setGames(prev => {
        const blocked = prev.filter(g => g.blocked && !freshList.some(f => f.name === g.name))
        return [...freshList, ...blocked]
      })
      if (list.length > 0) addLog(`게임 ${list.length}개 탐지: ${list.map(g => g.name).join(', ')}`, 'info')
      else addLog('실행 중인 게임 프로세스 없음', 'info')
    } catch {
      addLog('프로세스 탐지 실패', 'error')
    }
    setDetecting(false)
  }

  const run = async (cmd: string, label: string): Promise<boolean> => {
    setRunning(true)
    addLog(`실행: ${label}`, 'info')
    try {
      const result = await api.exec(cmd, adminReady)
      const ok = result.exitCode === 0
      addLog(ok ? `성공: ${label}` : `실패: ${result.stderr || '알 수 없는 오류'}`, ok ? 'success' : 'error')
      setRunning(false)
      return ok
    } catch (e: any) {
      addLog(`오류: ${e.message || '실행 실패'}`, 'error')
      setRunning(false)
      return false
    }
  }

  const blockGame = async (game: GameInfo) => {
    const cmds = game.ips.map(ip =>
      `netsh advfirewall firewall add rule name="QA_BLOCK_GAME_${game.name}_${ip}" dir=out action=block remoteip=${ip} protocol=any`
    )
    const ok = await run(cmds.join('; '), `${game.name} 차단 (${game.ips.length}개 IP)`)
    if (ok) {
      setGames(prev => prev.map(g => g.name === game.name ? { ...g, blocked: true } : g))
      loadBlockRules()
    }
  }

  const unblockGame = async (game: GameInfo) => {
    const cmd = `Get-NetFirewallRule | Where-Object { $_.DisplayName -like 'QA_BLOCK_GAME_${game.name}*' } | Remove-NetFirewallRule`
    const ok = await run(cmd, `${game.name} 차단 해제`)
    if (ok) {
      setGames(prev => prev.map(g => g.name === game.name ? { ...g, blocked: false } : g))
      loadBlockRules()
    }
  }

  const blockIp = () => run(
    `netsh advfirewall firewall add rule name="QA_BLOCK_IP_${inputValue}" dir=out action=block remoteip=${inputValue} protocol=any; netsh advfirewall firewall add rule name="QA_BLOCK_IP_${inputValue}_IN" dir=in action=block remoteip=${inputValue} protocol=any`,
    `IP ${inputValue} 차단`
  ).then(ok => { if (ok) loadBlockRules() })

  const unblockIp = () => run(
    `netsh advfirewall firewall delete rule name="QA_BLOCK_IP_${inputValue}"; netsh advfirewall firewall delete rule name="QA_BLOCK_IP_${inputValue}_IN"`,
    `IP ${inputValue} 해제`
  ).then(ok => { if (ok) loadBlockRules() })

  const resetAll = () => run(
    `Get-NetFirewallRule | Where-Object { $_.DisplayName -like 'QA_BLOCK*' } | Remove-NetFirewallRule`,
    '모든 QA 규칙 삭제'
  ).then(() => {
    setGames(prev => prev.map(g => ({ ...g, blocked: false })))
    setBlockRules([])
  })

  const pingTest = () => run('ping -n 1 -w 2000 8.8.8.8', '연결 확인')

  const logColor = { info: colors.text.tertiary, success: '#30D158', error: '#FF453A' }

  return (
    <div style={{ padding: `${spacing.sm}px ${spacing.md}px` }}>
      {/* 관리자 권한 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', marginBottom: 10, borderRadius: radius.md,
        background: adminReady ? '#30D15810' : '#FF453A10',
        border: `1px solid ${adminReady ? '#30D15825' : '#FF453A25'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: adminReady ? '#30D158' : '#FF453A', display: 'inline-block'
          }} />
          <span style={{ fontSize: 11, color: adminReady ? '#30D158' : '#FF453A', fontWeight: 600 }}>
            관리자 {adminReady ? 'ON' : 'OFF'}
          </span>
        </div>
        <button disabled={setupLoading} onClick={adminReady ? () => setAdminReady(false) : setupAdmin} style={{
          padding: '3px 10px', borderRadius: radius.sm, border: 'none',
          background: adminReady ? '#30D158' : '#FF453A', color: '#fff', fontSize: 10, fontWeight: 700,
          cursor: setupLoading ? 'wait' : 'pointer'
        }}>
          {setupLoading ? '설정 중...' : adminReady ? 'OFF' : 'ON'}
        </button>
      </div>

      {/* 게임 프로세스 탐지 */}
      <div style={{
        marginBottom: 10, borderRadius: radius.md,
        border: `1px solid ${colors.border.primary}`, overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: colors.bg.elevated
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: colors.text.secondary }}>
            게임 프로세스
          </span>
          <button disabled={detecting} onClick={detectGames} style={{
            padding: '2px 8px', borderRadius: radius.sm,
            border: `1px solid ${colors.border.primary}`, background: colors.bg.base,
            color: colors.text.secondary, fontSize: 10, cursor: 'pointer'
          }}>
            {detecting ? '탐지 중...' : '새로고침'}
          </button>
        </div>

        {games.length === 0 ? (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: colors.text.tertiary }}>
            {detecting ? '프로세스 탐지 중...' : '실행 중인 게임 없음'}
          </div>
        ) : (
          <div style={{ padding: 6 }}>
            {games.map(g => (
              <div key={g.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 8px', marginBottom: 3, borderRadius: radius.sm,
                background: g.blocked ? '#FF453A08' : colors.bg.base,
                border: `1px solid ${g.blocked ? '#FF453A20' : 'transparent'}`
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.primary }}>
                    {g.name}
                    <span style={{
                      marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      background: g.blocked ? '#FF453A20' : '#30D15820',
                      color: g.blocked ? '#FF453A' : '#30D158'
                    }}>
                      {g.blocked ? 'BLOCKED' : 'CONNECTED'}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: colors.text.tertiary, marginTop: 1 }}>
                    {g.ips.join(', ')}
                  </div>
                </div>
                <button
                  disabled={running}
                  onClick={() => g.blocked ? unblockGame(g) : blockGame(g)}
                  style={{
                    padding: '4px 10px', borderRadius: radius.sm, border: 'none',
                    background: g.blocked ? '#30D158' : '#FF453A',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    cursor: running ? 'wait' : 'pointer',
                    opacity: running ? 0.5 : 1, whiteSpace: 'nowrap' as const
                  }}
                >
                  {g.blocked ? '해제' : '차단'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 활성 차단 규칙 */}
      <div style={{
        marginBottom: 10, borderRadius: radius.md,
        border: `1px solid ${blockRules.length > 0 ? '#FF453A25' : colors.border.primary}`, overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: blockRules.length > 0 ? '#FF453A08' : colors.bg.elevated
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: blockRules.length > 0 ? '#FF453A' : colors.text.secondary }}>
              차단 상태
            </span>
            {blockRules.length > 0 && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 3,
                background: '#FF453A20', color: '#FF453A', fontWeight: 700
              }}>
                {blockRules.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {blockRules.length > 0 && (
              <button disabled={running} onClick={removeAllBlockRules} style={{
                padding: '2px 8px', borderRadius: radius.sm, border: 'none',
                background: '#FF453A', color: '#fff', fontSize: 10, fontWeight: 600,
                cursor: running ? 'wait' : 'pointer', opacity: running ? 0.5 : 1
              }}>
                전체 해제
              </button>
            )}
            <button disabled={rulesLoading} onClick={loadBlockRules} style={{
              padding: '2px 8px', borderRadius: radius.sm,
              border: `1px solid ${colors.border.primary}`, background: colors.bg.base,
              color: colors.text.secondary, fontSize: 10, cursor: 'pointer'
            }}>
              {rulesLoading ? '조회 중...' : '새로고침'}
            </button>
          </div>
        </div>

        {blockRules.length === 0 ? (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: colors.text.tertiary }}>
            {rulesLoading ? '규칙 조회 중...' : '활성 차단 규칙 없음'}
          </div>
        ) : (
          <div style={{ padding: 6 }}>
            {blockRules.map((r, i) => {
              const displayName = r.name.replace(/^\\?QA_BLOCK_(GAME_|IP_)?/, '').replace(/\\?$/, '')
              const isGame = r.name.includes('GAME')
              const isInbound = r.direction === 'Inbound' || r.direction === '1'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', marginBottom: 2, borderRadius: radius.sm,
                  background: '#FF453A06', border: '1px solid #FF453A12'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{displayName}</span>
                      <span style={{
                        fontSize: 8, padding: '1px 4px', borderRadius: 2, flexShrink: 0,
                        background: isGame ? '#FF9F0A20' : '#AF52DE20',
                        color: isGame ? '#FF9F0A' : '#AF52DE'
                      }}>
                        {isGame ? 'GAME' : 'IP'}
                      </span>
                      <span style={{
                        fontSize: 8, padding: '1px 4px', borderRadius: 2, flexShrink: 0,
                        background: isInbound ? '#5AC8FA20' : '#FF453A20',
                        color: isInbound ? '#5AC8FA' : '#FF453A'
                      }}>
                        {isInbound ? 'IN' : 'OUT'}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled={running}
                    onClick={() => removeBlockRule(r)}
                    style={{
                      padding: '2px 8px', borderRadius: radius.sm, border: 'none',
                      background: '#30D158', color: '#fff', fontSize: 9, fontWeight: 700,
                      cursor: running ? 'wait' : 'pointer', opacity: running ? 0.5 : 1,
                      whiteSpace: 'nowrap' as const
                    }}
                  >
                    해제
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 수동 IP 차단 + 유틸 */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        <input
          placeholder="IP 수동 입력"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: radius.md,
            border: `1px solid ${colors.border.primary}`, background: colors.bg.base,
            color: colors.text.primary, fontSize: 11
          }}
        />
        <button disabled={running || !inputValue.trim()} onClick={blockIp} style={smallBtn('#FF453A', running || !inputValue.trim())}>차단</button>
        <button disabled={running || !inputValue.trim()} onClick={unblockIp} style={smallBtn('#30D158', running || !inputValue.trim())}>해제</button>
        <button disabled={running} onClick={resetAll} style={smallBtn(colors.text.secondary, running)}>초기화</button>
        <button disabled={running} onClick={pingTest} style={smallBtn(colors.accent.primary, running)}>Ping</button>
      </div>

      {/* 로그 */}
      <div style={{
        background: colors.bg.base, borderRadius: radius.md,
        border: `1px solid ${colors.border.primary}`,
        padding: 8, maxHeight: 120, overflowY: 'auto',
        fontSize: 10, fontFamily: 'Consolas, monospace'
      }}>
        {logs.length === 0 && (
          <div style={{ color: colors.text.tertiary, textAlign: 'center', padding: 8 }}>
            {adminReady ? '준비 완료' : '먼저 관리자 권한을 설정하세요'}
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} style={{ color: logColor[l.type], lineHeight: 1.6 }}>
            <span style={{ color: colors.text.tertiary }}>{l.time}</span>{' '}{l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

function smallBtn(color: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 8px', borderRadius: 6, border: `1px solid ${color}30`,
    background: `${color}10`, color, fontSize: 10, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
    whiteSpace: 'nowrap'
  }
}
