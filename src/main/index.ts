import { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, clipboard, shell, desktopCapturer } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { tmpdir, homedir } from 'os'
import { existsSync, rmSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, readFileSync, statSync } from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'

// GPU 캐시 에러 방지
const sessionPath = join(tmpdir(), 'sophia-hub-session')
app.setPath('sessionData', sessionPath)
const gpuCache = join(app.getPath('userData'), 'GPUCache')
if (existsSync(gpuCache)) {
  try { rmSync(gpuCache, { recursive: true, force: true }) } catch { /* ignore */ }
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

import { SkillsService } from './services/skillsService'
import { LaunchService } from './services/launchService'
import { GitService } from './services/gitService'
import { StoreService } from './services/storeService'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const skillsService = new SkillsService()
const launchService = new LaunchService()
const gitService = new GitService()
const storeService = new StoreService()

// 이미지 저장 폴더
const IMAGE_DIR = join(homedir(), '.claude', 'images')
if (!existsSync(IMAGE_DIR)) mkdirSync(IMAGE_DIR, { recursive: true })

// 녹화 저장 폴더
const RECORDINGS_DIR = join(homedir(), '.claude', 'recordings')
if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true })

// 매크로 저장 폴더
const MACROS_DIR = join(homedir(), '.claude', 'macros')
if (!existsSync(MACROS_DIR)) mkdirSync(MACROS_DIR, { recursive: true })

// 매크로 관련 상태
let cursorPollingInterval: ReturnType<typeof setInterval> | null = null
let pathRecordingInterval: ReturnType<typeof setInterval> | null = null
let pathRecordingData: Array<{ t: number; x: number; y: number }> = []
let pathRecordingStart = 0
let macroProcess: ChildProcess | null = null
let macroStatusInterval: ReturnType<typeof setInterval> | null = null
let macroFailsafeInterval: ReturnType<typeof setInterval> | null = null

function createWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = display.workAreaSize

  const panelW = 420
  const panelX = screenW - panelW

  mainWindow = new BrowserWindow({
    width: panelW,
    height: screenH,
    x: panelX,
    y: 0,
    icon: join(__dirname, '../../resources/icon.ico'),
    frame: false,
    resizable: false,
    minWidth: 52,
    skipTaskbar: false,
    alwaysOnTop: true,
    maximizable: false,
    minimizable: true,
    transparent: true,
    backgroundMaterial: 'acrylic',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function setupIPC(): void {
  ipcMain.handle('get-skills', () => skillsService.getSkills())

  ipcMain.handle('launch-skill', (_e, skillName: string, projectPath?: string) => {
    const recentSkills = (storeService.get('recentSkills') as string[]) || []
    const updated = [skillName, ...recentSkills.filter((s) => s !== skillName)].slice(0, 8)
    storeService.set('recentSkills', updated)

    // Log skill usage
    const logs = (storeService.get('skillLogs') as Array<{ skill: string; time: number }>) || []
    logs.push({ skill: skillName, time: Date.now() })
    // Keep last 500 entries
    storeService.set('skillLogs', logs.slice(-500))

    return launchService.launch(skillName, projectPath)
  })

  ipcMain.handle('get-recent-skills', () => {
    return (storeService.get('recentSkills') as string[]) || []
  })

  // set-mode은 이제 사용 안 하지만 호환성 유지
  ipcMain.handle('set-mode', () => true)

  // 패널 크기 변경 (mini mode)
  ipcMain.handle('set-panel-width', (_e, w: number) => {
    if (!mainWindow) return
    const display = screen.getPrimaryDisplay()
    const screenW = display.workAreaSize.width
    const bounds = mainWindow.getBounds()
    mainWindow.setResizable(true)
    mainWindow.setBounds({ x: screenW - w, y: bounds.y, width: w, height: bounds.height })
    mainWindow.setResizable(false)
  })

  ipcMain.handle('get-git-status', (_e, projectPath: string) => {
    return gitService.getStatus(projectPath)
  })

  ipcMain.handle('get-projects', () => skillsService.getProjects())

  ipcMain.handle('open-url', (_e, url: string) => {
    shell.openExternal(url)
  })

  // 이미지 클립보드에서 붙여넣기
  ipcMain.handle('paste-image', () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return { success: false, error: 'No image in clipboard' }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `capture-${timestamp}.png`
    const filePath = join(IMAGE_DIR, fileName)
    writeFileSync(filePath, image.toPNG())

    return { success: true, path: filePath, fileName }
  })

  // 이미지 목록 가져오기
  ipcMain.handle('get-images', () => {
    try {
      const { readdirSync, statSync } = require('fs')
      const files = readdirSync(IMAGE_DIR)
        .filter((f: string) => f.endsWith('.png') || f.endsWith('.jpg'))
        .map((f: string) => ({
          name: f,
          path: join(IMAGE_DIR, f),
          time: statSync(join(IMAGE_DIR, f)).mtime.getTime()
        }))
        .sort((a: { time: number }, b: { time: number }) => b.time - a.time)
        .slice(0, 20)
      return files
    } catch {
      return []
    }
  })

  // 이미지 삭제
  ipcMain.handle('delete-image', (_e, filePath: string) => {
    try {
      if (existsSync(filePath) && filePath.startsWith(IMAGE_DIR)) {
        unlinkSync(filePath)
        return { success: true }
      }
      return { success: false, error: 'File not found or invalid path' }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 북마크 저장/불러오기
  ipcMain.handle('get-bookmarks', () => {
    return (storeService.get('bookmarks') as Array<{ name: string; url: string }>) || [
      { name: 'Claude', url: 'https://claude.ai' },
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'sophia.ko', url: 'https://sophia-ko.vercel.app' },
      { name: 'Jira', url: 'https://jira.atlassian.com' }
    ]
  })

  ipcMain.handle('save-bookmarks', (_e, bookmarks: Array<{ name: string; url: string }>) => {
    storeService.set('bookmarks', bookmarks)
  })

  // Notes
  ipcMain.handle('get-notes', () => {
    return (storeService.get('notes') as Array<{ id: string; content: string; tags: string[]; category: string; createdAt: number; updatedAt: number }>) || []
  })

  ipcMain.handle('save-notes', (_e, notes: Array<{ id: string; content: string; tags: string[]; category: string; createdAt: number; updatedAt: number }>) => {
    storeService.set('notes', notes)
  })

  ipcMain.handle('get-store', (_e, key: string) => storeService.get(key))
  ipcMain.handle('set-store', (_e, key: string, value: unknown) => storeService.set(key, value))

  ipcMain.handle('set-opacity', (_e, value: number) => {
    if (mainWindow) mainWindow.setOpacity(Math.max(0.2, Math.min(1, value)))
  })

  // Recent commits for Daily Standup
  ipcMain.handle('get-recent-commits', (_e, projectPath: string, since: string) => {
    return gitService.getRecentCommits(projectPath, since)
  })

  // Skill usage logs
  ipcMain.handle('get-skill-logs', () => {
    return (storeService.get('skillLogs') as Array<{ skill: string; time: number }>) || []
  })

  // 아이디어 히스토리 - ~/.claude/ideas/ 폴더 읽기
  const IDEAS_DIR = join(homedir(), '.claude', 'ideas')

  ipcMain.handle('get-idea-files', () => {
    try {
      if (!existsSync(IDEAS_DIR)) return []
      return readdirSync(IDEAS_DIR)
        .filter((f: string) => f.endsWith('.md'))
        .sort((a: string, b: string) => b.localeCompare(a))
        .map((f: string) => ({ name: f, month: f.replace('.md', '') }))
    } catch {
      return []
    }
  })

  ipcMain.handle('get-idea-content', (_e, fileName: string) => {
    try {
      const filePath = join(IDEAS_DIR, fileName)
      if (!existsSync(filePath) || !filePath.startsWith(IDEAS_DIR)) return ''
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  })

  // Jira 이슈 조회
  ipcMain.handle('get-jira-issues', async (_e, projectKeys: string[]) => {
    try {
      const config = storeService.get('apiConfig') as Record<string, Record<string, string>> | null
      const jira = config?.jira
      if (!jira?.baseUrl || !jira?.email || !jira?.apiToken) {
        return []
      }

      const baseUrl = jira.baseUrl.replace(/\/+$/, '')
      const auth = Buffer.from(`${jira.email}:${jira.apiToken}`).toString('base64')

      let jql = '(assignee=currentUser() OR reporter=currentUser()) AND statusCategory != Done ORDER BY updated DESC'
      if (projectKeys.length > 0) {
        const keys = projectKeys.map((k) => k.trim()).join(',')
        jql = `(assignee=currentUser() OR reporter=currentUser()) AND project in (${keys}) AND statusCategory != Done ORDER BY updated DESC`
      }

      const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=30&fields=summary,status,priority`
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json'
        }
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Jira API ${response.status}: ${text.slice(0, 200)}`)
      }

      const data = await response.json()
      return (data.issues || []).map((issue: {
        key: string
        fields: {
          summary: string
          status: { name: string; statusCategory: { key: string } }
          priority: { name: string }
        }
      }) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || '',
        statusCategory: issue.fields.status?.statusCategory?.key || 'new',
        priority: issue.fields.priority?.name || 'Medium'
      }))
    } catch (err) {
      console.error('Jira API error:', err)
      throw err
    }
  })

  // 메모리 히스토리 - ~/.claude/projects/*/memory/ 폴더 읽기
  const MEMORY_DIRS = (() => {
    const projectsDir = join(homedir(), '.claude', 'projects')
    if (!existsSync(projectsDir)) return []
    const dirs: string[] = []
    try {
      for (const proj of readdirSync(projectsDir)) {
        const memDir = join(projectsDir, proj, 'memory')
        if (existsSync(memDir)) dirs.push(memDir)
      }
    } catch { /* ignore */ }
    return dirs
  })()

  const MEMORY_LABELS: Record<string, string> = {
    'MEMORY.md': '워크스페이스 요약',
    'brainstorming.md': '브레인스토밍 기록',
    'worklog.md': '작업 로그',
    'debugging.md': '디버깅 노트',
    'patterns.md': '패턴/컨벤션'
  }

  ipcMain.handle('get-memory-files', () => {
    const files: Array<{ name: string; label: string }> = []
    const seen = new Set<string>()
    for (const dir of MEMORY_DIRS) {
      try {
        for (const f of readdirSync(dir)) {
          if (f.endsWith('.md') && !seen.has(f)) {
            seen.add(f)
            files.push({ name: f, label: MEMORY_LABELS[f] || f.replace('.md', '') })
          }
        }
      } catch { /* ignore */ }
    }
    return files
  })

  ipcMain.handle('get-memory-content', (_e, fileName: string) => {
    for (const dir of MEMORY_DIRS) {
      const filePath = join(dir, fileName)
      if (existsSync(filePath) && filePath.startsWith(dir)) {
        try { return readFileSync(filePath, 'utf-8') } catch { /* ignore */ }
      }
    }
    return ''
  })

  // --- Simple Macro ---

  // Macro CRUD
  ipcMain.handle('get-macros', () => {
    try {
      if (!existsSync(MACROS_DIR)) return []
      return readdirSync(MACROS_DIR)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => {
          try {
            return JSON.parse(readFileSync(join(MACROS_DIR, f), 'utf-8'))
          } catch { return null }
        })
        .filter(Boolean)
        .sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
    } catch { return [] }
  })

  ipcMain.handle('save-macro', (_e, macro: { id: string; name: string; steps: unknown[]; speed: number; repeat: number; createdAt: number; updatedAt: number }) => {
    writeFileSync(join(MACROS_DIR, macro.id + '.json'), JSON.stringify(macro, null, 2))
  })

  ipcMain.handle('delete-macro', (_e, id: string) => {
    const filePath = join(MACROS_DIR, id + '.json')
    if (existsSync(filePath) && filePath.startsWith(MACROS_DIR)) {
      unlinkSync(filePath)
    }
  })

  // Cursor polling
  ipcMain.handle('start-cursor-polling', () => {
    if (cursorPollingInterval) return
    cursorPollingInterval = setInterval(() => {
      const point = screen.getCursorScreenPoint()
      // 허브 창 위에 있으면 업데이트 중지 (마지막 외부 좌표 유지)
      if (mainWindow && !mainWindow.isDestroyed()) {
        const b = mainWindow.getBounds()
        if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) return
      }
      mainWindow?.webContents.send('cursor-update', { x: point.x, y: point.y, rgb: '' })
    }, 16)
  })

  ipcMain.handle('stop-cursor-polling', () => {
    if (cursorPollingInterval) {
      clearInterval(cursorPollingInterval)
      cursorPollingInterval = null
    }
  })

  // Pick color at current cursor position
  ipcMain.handle('pick-color', async () => {
    try {
      const point = screen.getCursorScreenPoint()
      const displays = screen.getAllDisplays()
      const display = screen.getDisplayNearestPoint(point)
      const sf = display.scaleFactor

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) }
      })

      const source = sources.find(s => {
        if (s.display_id) return String(display.id) === s.display_id
        return s.id.startsWith('screen:')
      })

      if (!source) return '#000000'

      const img = source.thumbnail
      const px = Math.round((point.x - display.bounds.x) * sf)
      const py = Math.round((point.y - display.bounds.y) * sf)

      // Crop 1x1 pixel
      const pixel = img.crop({ x: px, y: py, width: 1, height: 1 })
      const buf = pixel.toBitmap()
      // BGRA format
      const b = buf[0], g = buf[1], r = buf[2]
      return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
    } catch {
      return '#000000'
    }
  })

  // Capture 9x9 pixel area around cursor for magnifier
  let lastCursorAreaResult = { grid: [] as string[][], color: '#000000', x: 0, y: 0 }

  ipcMain.handle('capture-cursor-area', async () => {
    try {
      const point = screen.getCursorScreenPoint()
      // 허브 창 위에 있으면 캐시된 결과 반환
      if (mainWindow && !mainWindow.isDestroyed()) {
        const b = mainWindow.getBounds()
        if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
          return lastCursorAreaResult
        }
      }
      const display = screen.getDisplayNearestPoint(point)
      const sf = display.scaleFactor
      const halfSize = 4 // 9x9 grid

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) }
      })

      const source = sources.find(s => {
        if (s.display_id) return String(display.id) === s.display_id
        return s.id.startsWith('screen:')
      })

      if (!source) return { grid: [], color: '#000000', x: point.x, y: point.y }

      const img = source.thumbnail
      const cx = Math.round((point.x - display.bounds.x) * sf)
      const cy = Math.round((point.y - display.bounds.y) * sf)
      const imgSize = img.getSize()

      const grid: string[][] = []
      let centerColor = '#000000'

      for (let dy = -halfSize; dy <= halfSize; dy++) {
        const row: string[] = []
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          const px = cx + dx
          const py = cy + dy
          if (px < 0 || py < 0 || px >= imgSize.width || py >= imgSize.height) {
            row.push('#000000')
            continue
          }
          const pixel = img.crop({ x: px, y: py, width: 1, height: 1 })
          const buf = pixel.toBitmap()
          const hex = '#' + [buf[2], buf[1], buf[0]].map(c => c.toString(16).padStart(2, '0')).join('')
          row.push(hex)
          if (dx === 0 && dy === 0) centerColor = hex
        }
        grid.push(row)
      }

      lastCursorAreaResult = { grid, color: centerColor, x: point.x, y: point.y }
      return lastCursorAreaResult
    } catch {
      return lastCursorAreaResult.grid.length > 0 ? lastCursorAreaResult : { grid: [], color: '#000000', x: 0, y: 0 }
    }
  })

  // Pick position — transparent overlay, click to capture
  let pickOverlays: BrowserWindow[] = []

  ipcMain.handle('pick-position', async () => {
    const allDisplays = screen.getAllDisplays()

    // Pre-capture all screens for color picking
    const maxRes = Math.max(
      ...allDisplays.map(d => d.size.width * d.scaleFactor),
      ...allDisplays.map(d => d.size.height * d.scaleFactor)
    )
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxRes, height: maxRes }
    })

    type ScreenCapture = { display: Electron.Display; thumbnail: Electron.NativeImage }
    const captures: ScreenCapture[] = []
    for (const source of sources) {
      if (!source.display_id) continue
      const display = allDisplays.find(d => String(d.id) === source.display_id)
      if (display) captures.push({ display, thumbnail: source.thumbnail })
    }

    const pickHTML = `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0}
body{width:100vw;height:100vh;cursor:crosshair;background:rgba(0,0,0,0.01);user-select:none;-webkit-user-select:none;}
.ch{position:fixed;background:rgba(255,214,10,0.6);pointer-events:none;z-index:10;}
.chx{width:1px;height:100vh;}
.chy{height:1px;width:100vw;}
#info{position:fixed;padding:6px 12px;border-radius:6px;
  background:rgba(0,0,0,0.8);color:#fff;font-size:12px;
  font-family:Consolas,monospace;pointer-events:none;z-index:11;white-space:nowrap;}
.hint{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);
  padding:8px 20px;border-radius:8px;
  background:rgba(0,0,0,0.75);color:#fff;font-size:13px;
  font-family:-apple-system,sans-serif;pointer-events:none;z-index:11;}
#mag{position:fixed;pointer-events:none;z-index:12;
  border-radius:8px;border:2px solid rgba(255,214,10,0.5);
  box-shadow:0 2px 12px rgba(0,0,0,0.5);display:none;}
#colorHex{position:fixed;pointer-events:none;z-index:12;
  padding:3px 10px;border-radius:4px;
  background:rgba(0,0,0,0.85);color:#fff;font-size:11px;
  font-family:Consolas,monospace;text-align:center;display:none;}
</style></head><body>
<div class="ch chx" id="chx"></div>
<div class="ch chy" id="chy"></div>
<div id="info">0, 0</div>
<canvas id="mag" width="117" height="117"></canvas>
<div id="colorHex"></div>
<div class="hint">클릭하여 좌표 선택 · ESC 취소</div>
<script>
var G=9,C=13,S=G*C;
var chx=document.getElementById('chx');
var chy=document.getElementById('chy');
var info=document.getElementById('info');
var mag=document.getElementById('mag');
var chex=document.getElementById('colorHex');
var ctx=mag.getContext('2d',{willReadFrequently:true});
var mImg=null;
window._initMag=function(src){
  var im=new Image();im.onload=function(){mImg=im;mag.style.display='block';chex.style.display='block';};im.src=src;
};
document.addEventListener('mousemove',function(e){
  chx.style.left=e.clientX+'px';
  chy.style.top=e.clientY+'px';
  info.style.left=(e.clientX+14)+'px';
  info.style.top=(e.clientY-30)+'px';
  info.textContent=e.screenX+', '+e.screenY;
  if(mImg){
    var sx=e.clientX-4,sy=e.clientY-4;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,S,S);
    ctx.drawImage(mImg,sx,sy,G,G,0,0,S,S);
    ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;
    for(var i=1;i<G;i++){
      ctx.beginPath();ctx.moveTo(i*C+0.5,0);ctx.lineTo(i*C+0.5,S);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,i*C+0.5);ctx.lineTo(S,i*C+0.5);ctx.stroke();
    }
    var cx=4*C,cy=4*C;
    ctx.strokeStyle='rgba(255,214,10,0.9)';ctx.lineWidth=2;
    ctx.strokeRect(cx+1,cy+1,C-2,C-2);
    try{var pd=ctx.getImageData(cx+6,cy+6,1,1).data;
      var h='#'+[pd[0],pd[1],pd[2]].map(function(v){return v.toString(16).padStart(2,'0');}).join('');
      chex.textContent=h;chex.style.borderLeft='4px solid '+h;
    }catch(er){}
  }
  var mx=e.clientX+20,my=e.clientY+20;
  if(mx+S+10>window.innerWidth)mx=e.clientX-S-24;
  if(my+S+30>window.innerHeight)my=e.clientY-S-50;
  mag.style.left=mx+'px';mag.style.top=my+'px';
  chex.style.left=mx+'px';chex.style.top=(my+S+4)+'px';chex.style.width=S+'px';
});
document.addEventListener('mousedown',function(e){
  e.preventDefault();window.api.sendPickResult({x:e.screenX,y:e.screenY});
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')window.api.cancelPick();
});
</script></body></html>`

    // Hide hub during pick
    mainWindow?.hide()

    // Create overlay on each display
    for (const display of allDisplays) {
      const { x, y, width, height } = display.bounds
      const cap = captures.find(c => c.display.id === display.id)
      const overlay = new BrowserWindow({
        x, y, width, height,
        frame: false, transparent: true, alwaysOnTop: true,
        skipTaskbar: true, fullscreenable: false, resizable: false, movable: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true, nodeIntegration: false
        }
      })
      overlay.setAlwaysOnTop(true, 'screen-saver')
      overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pickHTML))

      // Inject screenshot for magnifier loupe
      if (cap) {
        overlay.webContents.on('did-finish-load', () => {
          try {
            const thumb = cap.thumbnail.resize({ width: display.size.width, height: display.size.height })
            const dataUrl = thumb.toDataURL()
            overlay.webContents.executeJavaScript(`window._initMag('${dataUrl}')`)
          } catch { /* ignore */ }
        })
      }

      pickOverlays.push(overlay)
    }

    return new Promise<{ x: number; y: number; color: string } | null>((resolve) => {
      let resolved = false
      const cleanup = (): void => {
        for (const ov of pickOverlays) { if (!ov.isDestroyed()) ov.destroy() }
        pickOverlays = []
        mainWindow?.show()
        mainWindow?.focus()
      }

      const onResult = (_ev: Electron.IpcMainEvent, pos: { x: number; y: number }): void => {
        if (resolved) return
        resolved = true
        ipcMain.removeListener('pick-cancelled', onCancel)
        cleanup()

        // Get color at picked position from pre-captured screenshots
        let color = '#000000'
        for (const cap of captures) {
          const b = cap.display.bounds
          if (pos.x >= b.x && pos.x < b.x + b.width && pos.y >= b.y && pos.y < b.y + b.height) {
            const sf = cap.display.scaleFactor
            const px = Math.round((pos.x - b.x) * sf)
            const py = Math.round((pos.y - b.y) * sf)
            try {
              const pixel = cap.thumbnail.crop({ x: px, y: py, width: 1, height: 1 })
              const buf = pixel.toBitmap()
              color = '#' + [buf[2], buf[1], buf[0]].map(c => c.toString(16).padStart(2, '0')).join('')
            } catch { /* ignore */ }
            break
          }
        }

        resolve({ x: pos.x, y: pos.y, color })
      }

      const onCancel = (): void => {
        if (resolved) return
        resolved = true
        ipcMain.removeListener('pick-result', onResult)
        cleanup()
        resolve(null)
      }

      ipcMain.once('pick-result', onResult)
      ipcMain.once('pick-cancelled', onCancel)

      for (const ov of pickOverlays) {
        ov.on('closed', () => {
          if (resolved) return
          if (pickOverlays.every(o => o.isDestroyed())) {
            resolved = true
            ipcMain.removeListener('pick-result', onResult)
            ipcMain.removeListener('pick-cancelled', onCancel)
            pickOverlays = []
            mainWindow?.show()
            resolve(null)
          }
        })
      }
    })
  })

  // Path recording
  ipcMain.handle('start-path-recording', () => {
    pathRecordingData = []
    pathRecordingStart = Date.now()
    if (pathRecordingInterval) clearInterval(pathRecordingInterval)
    pathRecordingInterval = setInterval(() => {
      const point = screen.getCursorScreenPoint()
      pathRecordingData.push({ t: Date.now() - pathRecordingStart, x: point.x, y: point.y })
    }, 16)
  })

  ipcMain.handle('stop-path-recording', () => {
    if (pathRecordingInterval) {
      clearInterval(pathRecordingInterval)
      pathRecordingInterval = null
    }
    const data = pathRecordingData
    pathRecordingData = []
    return data
  })

  // Interactive path recording with Space toggle
  ipcMain.handle('record-path-interactive', async () => {
    const pathHTML = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0}
body{width:100vw;height:100vh;cursor:crosshair;background:rgba(0,0,0,0.01);user-select:none;-webkit-user-select:none;}
#hint{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);
  padding:10px 24px;border-radius:8px;
  background:rgba(0,0,0,0.8);color:#fff;font-size:14px;
  font-family:-apple-system,sans-serif;pointer-events:none;z-index:11;
  display:flex;align-items:center;gap:8px;}
#dot{width:10px;height:10px;border-radius:50%;background:#666;}
</style></head><body>
<div id="hint"><div id="dot"></div><span id="msg">Space로 경로 녹화 시작 · ESC 취소</span></div>
<script>
var recording=false;
document.addEventListener('keydown',function(e){
  if(e.key===' '){
    e.preventDefault();
    if(!recording){
      recording=true;
      document.getElementById('dot').style.background='#FF453A';
      document.getElementById('msg').textContent='녹화 중... Space로 완료';
      window.api.startPathRecording();
    }else{
      window.api.sendPickResult({x:0,y:0});
    }
  }
  if(e.key==='Escape'){window.api.cancelPick();}
});
</script></body></html>`

    mainWindow?.hide()

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width, height } = display.bounds
    const overlay = new BrowserWindow({
      x, y, width, height,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, fullscreenable: false, resizable: false, movable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false
      }
    })
    overlay.setAlwaysOnTop(true, 'screen-saver')
    overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pathHTML))

    return new Promise<Array<{ t: number; x: number; y: number }> | null>((resolve) => {
      let resolved = false
      const cleanup = (): void => {
        if (!overlay.isDestroyed()) overlay.destroy()
        mainWindow?.show()
        mainWindow?.focus()
      }

      const onResult = (): void => {
        if (resolved) return
        resolved = true
        ipcMain.removeListener('pick-cancelled', onCancel)
        // Stop recording and return points
        if (pathRecordingInterval) {
          clearInterval(pathRecordingInterval)
          pathRecordingInterval = null
        }
        const data = pathRecordingData
        pathRecordingData = []
        cleanup()
        resolve(data.length > 0 ? data : null)
      }

      const onCancel = (): void => {
        if (resolved) return
        resolved = true
        ipcMain.removeListener('pick-result', onResult)
        if (pathRecordingInterval) {
          clearInterval(pathRecordingInterval)
          pathRecordingInterval = null
        }
        pathRecordingData = []
        cleanup()
        resolve(null)
      }

      ipcMain.once('pick-result', onResult)
      ipcMain.once('pick-cancelled', onCancel)

      overlay.on('closed', () => {
        if (!resolved) {
          resolved = true
          ipcMain.removeListener('pick-result', onResult)
          ipcMain.removeListener('pick-cancelled', onCancel)
          mainWindow?.show()
          resolve(null)
        }
      })
    })
  })

  // Background screen recording for macro
  let bgRecWindow: BrowserWindow | null = null
  let bgRecFilePath = ''

  ipcMain.handle('start-bg-recording', async (_e, sourceId?: string) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    if (sources.length === 0) return false
    const target = (sourceId ? sources.find(s => s.id === sourceId) : null) || sources[0]

    const recDir = join(homedir(), '.claude', 'recordings')
    if (!existsSync(recDir)) mkdirSync(recDir, { recursive: true })
    const fileName = `macro_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
    bgRecFilePath = join(recDir, fileName)

    bgRecWindow = new BrowserWindow({
      width: 1, height: 1, show: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true, backgroundThrottling: false }
    })

    // Auto-grant getDisplayMedia permission with selected source
    bgRecWindow.webContents.session.setDisplayMediaRequestHandler((_request, callback) => {
      callback({ video: target as unknown as Electron.Video })
    })

    const recHTML = `<!DOCTYPE html><html><body><script>
const{writeFileSync}=require('fs');
let recorder,chunks=[];
window._startRec=async function(path){
  const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
  recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
  chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
  recorder.start(1000);
  window._savePath=path;
};
window._stopRec=function(){
  return new Promise(resolve=>{
    if(!recorder||recorder.state==='inactive'){resolve(false);return;}
    recorder.onstop=async()=>{
      const blob=new Blob(chunks,{type:'video/webm'});
      const buf=await blob.arrayBuffer();
      writeFileSync(window._savePath,Buffer.from(buf));
      recorder.stream.getTracks().forEach(t=>t.stop());
      resolve(true);
    };
    recorder.stop();
  });
};
</script></body></html>`

    const tmpHtml = join(tmpdir(), 'sophia-bg-rec.html')
    writeFileSync(tmpHtml, recHTML, 'utf-8')
    bgRecWindow.loadFile(tmpHtml)

    await new Promise<void>(r => bgRecWindow!.webContents.on('did-finish-load', () => r()))

    const escapedPath = bgRecFilePath.replace(/\\/g, '\\\\')
    try {
      await bgRecWindow.webContents.executeJavaScript(`window._startRec('${escapedPath}')`)
      console.log('[BG REC] Started recording to', bgRecFilePath)
      return true
    } catch (e) {
      console.error('[BG REC] Failed to start:', e)
      bgRecWindow.destroy()
      bgRecWindow = null
      return false
    }
  })

  ipcMain.handle('stop-bg-recording', async () => {
    if (!bgRecWindow) return { success: false }
    try {
      await bgRecWindow.webContents.executeJavaScript(`window._stopRec()`)
      bgRecWindow.destroy()
      bgRecWindow = null
      const fileName = bgRecFilePath.split(/[\\/]/).pop() || ''
      console.log('[BG REC] Saved recording:', bgRecFilePath)
      if (existsSync(bgRecFilePath)) {
        return { success: true, path: bgRecFilePath, fileName }
      }
      return { success: true }
    } catch (e) {
      console.error('[BG REC] Failed to stop:', e)
      if (bgRecWindow && !bgRecWindow.isDestroyed()) bgRecWindow.destroy()
      bgRecWindow = null
      return { success: false }
    }
  })

  // Macro execution
  type MacroStepType =
    | { type: 'path'; points: Array<{ t: number; x: number; y: number }>; duration: number }
    | { type: 'click'; x: number; y: number; button: 'left' | 'right' }
    | { type: 'move'; x: number; y: number }
    | { type: 'direction'; dir: 'left' | 'right' | 'up' | 'down'; speed: number; duration: number }
    | { type: 'text'; value: string }
    | { type: 'key'; keys: string[] }
    | { type: 'wait'; ms: number; random?: boolean; min?: number; max?: number }

  type MacroType = {
    id: string; name: string; steps: MacroStepType[]
    speed: number; repeat: number
    gameMode?: 'off' | 'alt-hold' | 'alt-click' | 'postmsg' | 'abs-input'
    runAsAdmin?: boolean
    createdAt: number; updatedAt: number
  }

  const VK_CODES: Record<string, string> = {
    'backspace': '0x08', 'tab': '0x09', 'enter': '0x0D', 'shift': '0x10',
    'ctrl': '0x11', 'alt': '0x12', 'pause': '0x13', 'capslock': '0x14',
    'escape': '0x1B', 'space': '0x20', 'pageup': '0x21', 'pagedown': '0x22',
    'end': '0x23', 'home': '0x24', 'left': '0x25', 'up': '0x26',
    'right': '0x27', 'down': '0x28', 'insert': '0x2D', 'delete': '0x2E',
    '0': '0x30', '1': '0x31', '2': '0x32', '3': '0x33', '4': '0x34',
    '5': '0x35', '6': '0x36', '7': '0x37', '8': '0x38', '9': '0x39',
    'a': '0x41', 'b': '0x42', 'c': '0x43', 'd': '0x44', 'e': '0x45',
    'f': '0x46', 'g': '0x47', 'h': '0x48', 'i': '0x49', 'j': '0x4A',
    'k': '0x4B', 'l': '0x4C', 'm': '0x4D', 'n': '0x4E', 'o': '0x4F',
    'p': '0x50', 'q': '0x51', 'r': '0x52', 's': '0x53', 't': '0x54',
    'u': '0x55', 'v': '0x56', 'w': '0x57', 'x': '0x58', 'y': '0x59', 'z': '0x5A',
    'f1': '0x70', 'f2': '0x71', 'f3': '0x72', 'f4': '0x73', 'f5': '0x74',
    'f6': '0x75', 'f7': '0x76', 'f8': '0x77', 'f9': '0x78', 'f10': '0x79',
    'f11': '0x7A', 'f12': '0x7B',
    'numlock': '0x90', 'scrolllock': '0x91',
    'lshift': '0xA0', 'rshift': '0xA1', 'lctrl': '0xA2', 'rctrl': '0xA3',
    'lalt': '0xA4', 'ralt': '0xA5',
    ';': '0xBA', '=': '0xBB', ',': '0xBC', '-': '0xBD', '.': '0xBE',
    '/': '0xBF', '`': '0xC0', '[': '0xDB', '\\': '0xDC', ']': '0xDD', "'": '0xDE',
    'win': '0x5B', 'super': '0x5B'
  }

  function generateMacroScript(macro: MacroType): string {
    const speedFactor = macro.speed > 0 ? 1 / macro.speed : 1
    const lines: string[] = []

    // SendInput API — game-compatible (스캔코드 + SendInput)
    lines.push('Add-Type @"')
    lines.push('using System;')
    lines.push('using System.Runtime.InteropServices;')
    lines.push('using System.Threading;')
    lines.push('')
    lines.push('[StructLayout(LayoutKind.Sequential)]')
    lines.push('public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }')
    lines.push('[StructLayout(LayoutKind.Sequential)]')
    lines.push('public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }')
    lines.push('[StructLayout(LayoutKind.Sequential)]')
    lines.push('public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL, wParamH; }')
    lines.push('[StructLayout(LayoutKind.Explicit)]')
    lines.push('public struct MKHI {')
    lines.push('  [FieldOffset(0)] public MOUSEINPUT mi;')
    lines.push('  [FieldOffset(0)] public KEYBDINPUT ki;')
    lines.push('  [FieldOffset(0)] public HARDWAREINPUT hi;')
    lines.push('}')
    lines.push('[StructLayout(LayoutKind.Sequential)]')
    lines.push('public struct INPUT { public uint type; public MKHI u; }')
    lines.push('')
    lines.push('public class GI {')
    lines.push('  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);')
    lines.push('  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] inputs, int size);')
    lines.push('  [DllImport("user32.dll")] public static extern uint MapVirtualKeyW(uint code, uint mapType);')
    lines.push('  static int SZ = Marshal.SizeOf(typeof(INPUT));')
    lines.push('')
    lines.push('  public static void Click(int x, int y, bool right) {')
    lines.push('    SetCursorPos(x, y); Thread.Sleep(10);')
    lines.push('    var i = new INPUT[2];')
    lines.push('    i[0].type = 0; i[0].u.mi.dwFlags = right ? 0x0008u : 0x0002u;')
    lines.push('    i[1].type = 0; i[1].u.mi.dwFlags = right ? 0x0010u : 0x0004u;')
    lines.push('    SendInput(2, i, SZ);')
    lines.push('  }')
    lines.push('')
    lines.push('  public static void KD(ushort vk) {')
    lines.push('    var i = new INPUT[1]; i[0].type = 1;')
    lines.push('    i[0].u.ki.wVk = vk; i[0].u.ki.wScan = (ushort)MapVirtualKeyW(vk, 0);')
    lines.push('    i[0].u.ki.dwFlags = 0x0008;')
    lines.push('    SendInput(1, i, SZ);')
    lines.push('  }')
    lines.push('')
    lines.push('  public static void KU(ushort vk) {')
    lines.push('    var i = new INPUT[1]; i[0].type = 1;')
    lines.push('    i[0].u.ki.wVk = vk; i[0].u.ki.wScan = (ushort)MapVirtualKeyW(vk, 0);')
    lines.push('    i[0].u.ki.dwFlags = 0x000A;')
    lines.push('    SendInput(1, i, SZ);')
    lines.push('  }')
    lines.push('')
    lines.push('  public static void Type(string text) {')
    lines.push('    foreach (char c in text) {')
    lines.push('      var i = new INPUT[2];')
    lines.push('      i[0].type = 1; i[0].u.ki.wScan = (ushort)c; i[0].u.ki.dwFlags = 0x0004;')
    lines.push('      i[1].type = 1; i[1].u.ki.wScan = (ushort)c; i[1].u.ki.dwFlags = 0x0006;')
    lines.push('      SendInput(2, i, SZ); Thread.Sleep(5);')
    lines.push('    }')
    lines.push('  }')
    lines.push('')
    lines.push('  // PostMessage — 게임 창에 직접 윈도우 메시지 전송')
    lines.push('  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();')
    lines.push('  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);')
    lines.push('  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);')
    lines.push('  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x, y; }')
    lines.push('')
    lines.push('  public static void WMClick(int x, int y, bool right) {')
    lines.push('    SetCursorPos(x, y); Thread.Sleep(10);')
    lines.push('    IntPtr hw = GetForegroundWindow();')
    lines.push('    POINT pt; pt.x = x; pt.y = y;')
    lines.push('    ScreenToClient(hw, ref pt);')
    lines.push('    IntPtr lp = (IntPtr)((pt.y << 16) | (pt.x & 0xFFFF));')
    lines.push('    uint down = right ? 0x0204u : 0x0201u;')
    lines.push('    uint up = right ? 0x0205u : 0x0202u;')
    lines.push('    PostMessage(hw, down, IntPtr.Zero, lp);')
    lines.push('    Thread.Sleep(30);')
    lines.push('    PostMessage(hw, up, IntPtr.Zero, lp);')
    lines.push('  }')
    lines.push('')
    lines.push('  // Alt + SendInput click')
    lines.push('  public static void AltClick(int x, int y, bool right) {')
    lines.push('    KD(0x12); Thread.Sleep(30);')
    lines.push('    Click(x, y, right);')
    lines.push('    Thread.Sleep(30); KU(0x12);')
    lines.push('  }')
    lines.push('')
    lines.push('  // Absolute mouse — move+click in single SendInput call')
    lines.push('  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);')
    lines.push('  public static void AbsClick(int x, int y, bool right) {')
    lines.push('    int sw = GetSystemMetrics(0); int sh = GetSystemMetrics(1);')
    lines.push('    int ax = (int)(((double)x * 65536) / sw) + 1;')
    lines.push('    int ay = (int)(((double)y * 65536) / sh) + 1;')
    lines.push('    uint df = right ? 0x0008u : 0x0002u;')
    lines.push('    uint uf = right ? 0x0010u : 0x0004u;')
    lines.push('    var i = new INPUT[3];')
    lines.push('    i[0].type = 0; i[0].u.mi.dx = ax; i[0].u.mi.dy = ay; i[0].u.mi.dwFlags = 0x8001;')
    lines.push('    i[1].type = 0; i[1].u.mi.dwFlags = df;')
    lines.push('    i[2].type = 0; i[2].u.mi.dwFlags = uf;')
    lines.push('    SendInput(3, i, SZ);')
    lines.push('  }')
    lines.push('}')
    lines.push('"@')

    // Progress file path
    const progressFile = join(MACROS_DIR, '_progress.txt').replace(/\\/g, '\\\\')
    lines.push(`$progressFile = "${progressFile}"`)

    // Game mode: alt-hold → Alt 누른 상태 유지
    const gm = macro.gameMode || 'off'
    if (gm === 'alt-hold') {
      lines.push(`# Game mode: Alt hold`)
      lines.push(`[GI]::KD(0x12)`)
      lines.push(`Start-Sleep -Milliseconds 100`)
    }

    // Repeat loop
    const repeatCount = macro.repeat === 0 ? -1 : macro.repeat
    if (repeatCount === -1) {
      lines.push(`$totalRepeat = 0`)
      lines.push(`$r = 0`)
      lines.push(`while ($true) {`)
      lines.push(`  $r++`)
    } else {
      lines.push(`$totalRepeat = ${repeatCount}`)
      lines.push(`for ($r = 1; $r -le ${repeatCount}; $r++) {`)
    }

    // Steps
    macro.steps.forEach((step, i) => {
      const stepNum = i + 1
      const totalSteps = macro.steps.length
      lines.push(`  # Step ${stepNum}`)
      lines.push(`  Set-Content $progressFile "running|${stepNum}|${totalSteps}|$r|$totalRepeat"`)

      switch (step.type) {
        case 'path':
          if (step.points.length > 0) {
            const pts = step.points
            for (let j = 0; j < pts.length; j++) {
              lines.push(`  [GI]::SetCursorPos(${pts[j].x}, ${pts[j].y})`)
              if (j < pts.length - 1) {
                const dt = Math.max(1, Math.round((pts[j + 1].t - pts[j].t) * speedFactor))
                lines.push(`  Start-Sleep -Milliseconds ${dt}`)
              }
            }
          }
          break
        case 'click': {
          const isRight = step.button === 'right' ? '$true' : '$false'
          if (gm === 'postmsg') {
            lines.push(`  [GI]::WMClick(${step.x}, ${step.y}, ${isRight})`)
          } else if (gm === 'alt-click') {
            lines.push(`  [GI]::AltClick(${step.x}, ${step.y}, ${isRight})`)
          } else if (gm === 'abs-input') {
            lines.push(`  [GI]::AbsClick(${step.x}, ${step.y}, ${isRight})`)
          } else {
            lines.push(`  [GI]::Click(${step.x}, ${step.y}, ${isRight})`)
          }
          break
        }
        case 'move': {
          lines.push(`  [GI]::SetCursorPos(${step.x}, ${step.y})`)
          break
        }
        case 'direction': {
          const dx = step.dir === 'right' ? step.speed : step.dir === 'left' ? -step.speed : 0
          const dy = step.dir === 'down' ? step.speed : step.dir === 'up' ? -step.speed : 0
          lines.push(`  Add-Type -AssemblyName System.Windows.Forms`)
          if (step.duration > 0) {
            const dur = Math.round(step.duration * speedFactor)
            lines.push(`  $dirStart = [DateTime]::Now`)
            lines.push(`  while (([DateTime]::Now - $dirStart).TotalMilliseconds -lt ${dur}) {`)
          } else {
            lines.push(`  while ($true) {`)
          }
          lines.push(`    $p = [System.Windows.Forms.Cursor]::Position`)
          lines.push(`    [GI]::SetCursorPos($p.X + (${dx}), $p.Y + (${dy}))`)
          lines.push(`    Start-Sleep -Milliseconds 16`)
          lines.push(`  }`)
          break
        }
        case 'text': {
          // SendInput Unicode — game-compatible, no SendKeys
          const escaped = step.value.replace(/'/g, "''")
          lines.push(`  [GI]::Type('${escaped}')`)
          break
        }
        case 'key': {
          // SendInput scan code — key down in order, up in reverse
          const vks = step.keys.map(k => VK_CODES[k.toLowerCase()] || '0x00')
          for (const vk of vks) {
            lines.push(`  [GI]::KD(${vk})`)
          }
          lines.push(`  Start-Sleep -Milliseconds 50`)
          for (const vk of [...vks].reverse()) {
            lines.push(`  [GI]::KU(${vk})`)
          }
          break
        }
        case 'wait': {
          if (step.random && step.min != null && step.max != null) {
            const rMin = Math.max(1, Math.round(step.min * speedFactor))
            const rMax = Math.max(rMin, Math.round(step.max * speedFactor))
            lines.push(`  $waitMs = Get-Random -Minimum ${rMin} -Maximum ${rMax + 1}`)
            lines.push(`  Start-Sleep -Milliseconds $waitMs`)
          } else {
            const waitMs = Math.max(1, Math.round(step.ms * speedFactor))
            lines.push(`  Start-Sleep -Milliseconds ${waitMs}`)
          }
          break
        }
      }
    })

    lines.push(`}`) // End repeat loop

    // Game mode: alt-hold → Alt 해제
    if (gm === 'alt-hold') {
      lines.push(`[GI]::KU(0x12)`)
    }

    lines.push(`Set-Content $progressFile "stopped|completed"`)

    return lines.join('\r\n')
  }

  function cleanupMacroExecution(): void {
    if (macroStatusInterval) {
      clearInterval(macroStatusInterval)
      macroStatusInterval = null
    }
    if (macroFailsafeInterval) {
      clearInterval(macroFailsafeInterval)
      macroFailsafeInterval = null
    }
    // Unregister emergency stop shortcut
    try { globalShortcut.unregister('Super+Space') } catch { /* ignore */ }
    // Clean up temp files
    const scriptPath = join(MACROS_DIR, '_running.ps1')
    const progressPath = join(MACROS_DIR, '_progress.txt')
    try { if (existsSync(scriptPath)) unlinkSync(scriptPath) } catch { /* ignore */ }
    try { if (existsSync(progressPath)) unlinkSync(progressPath) } catch { /* ignore */ }
  }

  function killMacroProcess(): void {
    if (macroProcess && !macroProcess.killed) {
      try {
        execSync(`taskkill /PID ${macroProcess.pid} /T /F`, { stdio: 'ignore' })
      } catch { /* ignore */ }
      macroProcess = null
    }
  }

  ipcMain.handle('execute-macro', (_e, macro: MacroType) => {
    if (macroProcess) return // Already running

    const script = generateMacroScript(macro)
    const scriptPath = join(MACROS_DIR, '_running.ps1')
    const progressPath = join(MACROS_DIR, '_progress.txt')

    const BOM = '\ufeff'
    writeFileSync(scriptPath, BOM + script, 'utf-8')
    // Debug: save a copy for inspection
    writeFileSync(join(MACROS_DIR, '_debug_last.ps1'), BOM + script, 'utf-8')
    console.log('[MACRO] Script written to', scriptPath, '- length:', script.length)
    writeFileSync(progressPath, 'countdown|3', 'utf-8')

    // 3-second countdown
    let countdown = 3
    const sendStatus = (status: unknown): void => {
      mainWindow?.webContents.send('macro-status', status)
    }

    sendStatus({ state: 'countdown', remaining: countdown })

    const countdownInterval = setInterval(() => {
      countdown--
      if (countdown > 0) {
        sendStatus({ state: 'countdown', remaining: countdown })
        writeFileSync(progressPath, `countdown|${countdown}`, 'utf-8')
      } else {
        clearInterval(countdownInterval)

        // Hide window and start execution
        mainWindow?.hide()

        if (macro.runAsAdmin) {
          // 관리자 권한: wrapper 스크립트로 UAC 승인 후 실행
          const wrapperScript = `Start-Process powershell.exe -Verb RunAs -ArgumentList '-ExecutionPolicy','Bypass','-File','${scriptPath.replace(/'/g, "''")}' -Wait`
          const wrapperPath = join(MACROS_DIR, '_admin_wrapper.ps1')
          writeFileSync(wrapperPath, '\ufeff' + wrapperScript, 'utf-8')
          macroProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', wrapperPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          })
        } else {
          macroProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          })
        }
        macroProcess.stdout?.on('data', (d: Buffer) => console.log('[MACRO]', d.toString()))
        macroProcess.stderr?.on('data', (d: Buffer) => console.error('[MACRO ERR]', d.toString()))

        // Register emergency stop: Win+Space
        try {
          globalShortcut.register('Super+Space', () => {
            killMacroProcess()
            cleanupMacroExecution()
            mainWindow?.show()
            mainWindow?.focus()
            sendStatus({ state: 'stopped', reason: 'emergency' })
          })
        } catch { /* ignore - may already be registered */ }

        // Failsafe: cursor at (0,0)
        macroFailsafeInterval = setInterval(() => {
          const pos = screen.getCursorScreenPoint()
          if (pos.x === 0 && pos.y === 0) {
            killMacroProcess()
            cleanupMacroExecution()
            mainWindow?.show()
            mainWindow?.focus()
            sendStatus({ state: 'stopped', reason: 'failsafe' })
          }
        }, 500)

        // Poll progress file
        macroStatusInterval = setInterval(() => {
          try {
            if (!existsSync(progressPath)) return
            const content = readFileSync(progressPath, 'utf-8').trim()
            const parts = content.split('|')
            if (parts[0] === 'running') {
              sendStatus({
                state: 'running',
                currentStep: parseInt(parts[1]) || 1,
                totalSteps: parseInt(parts[2]) || 1,
                currentRepeat: parseInt(parts[3]) || 1,
                totalRepeat: parseInt(parts[4]) || 1
              })
            }
          } catch { /* ignore */ }
        }, 200)

        macroProcess.on('exit', () => {
          macroProcess = null
          cleanupMacroExecution()
          mainWindow?.show()
          mainWindow?.focus()
          sendStatus({ state: 'stopped', reason: 'completed' })
        })

        macroProcess.on('error', (err) => {
          macroProcess = null
          cleanupMacroExecution()
          mainWindow?.show()
          mainWindow?.focus()
          sendStatus({ state: 'stopped', reason: 'error', error: err.message })
        })
      }
    }, 1000)
  })

  ipcMain.handle('stop-macro', () => {
    killMacroProcess()
    cleanupMacroExecution()
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('macro-status', { state: 'stopped', reason: 'emergency' })
  })

  // --- QuickRec: 화면 녹화 ---

  // 녹화 소스 목록 (스크린 + 윈도우)
  ipcMain.handle('get-recording-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 160, height: 90 }
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL()
      }))
    } catch (err) {
      console.error('Failed to get recording sources:', err)
      return []
    }
  })

  // 녹화 파일 저장
  ipcMain.handle('save-recording', (_e, buffer: ArrayBuffer) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const fileName = `rec_${timestamp}.webm`
      const filePath = join(RECORDINGS_DIR, fileName)
      writeFileSync(filePath, Buffer.from(buffer))
      return { success: true, path: filePath, fileName }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 녹화 파일 목록
  ipcMain.handle('get-recordings', () => {
    try {
      return readdirSync(RECORDINGS_DIR)
        .filter((f: string) => f.endsWith('.webm') || f.endsWith('.png'))
        .map((f: string) => {
          const p = join(RECORDINGS_DIR, f)
          const st = statSync(p)
          return { name: f, path: p, time: st.mtime.getTime(), size: st.size }
        })
        .sort((a: { time: number }, b: { time: number }) => b.time - a.time)
        .slice(0, 20)
    } catch {
      return []
    }
  })

  // 녹화 폴더 열기
  ipcMain.handle('open-recordings-folder', () => {
    shell.openPath(RECORDINGS_DIR)
  })

  // 녹화 파일 재생
  ipcMain.handle('open-recording', (_e, filePath: string) => {
    if (existsSync(filePath) && filePath.startsWith(RECORDINGS_DIR)) {
      shell.openPath(filePath)
    }
  })

  // 녹화 파일 삭제
  ipcMain.handle('delete-recording', (_e, filePath: string) => {
    try {
      if (existsSync(filePath) && filePath.startsWith(RECORDINGS_DIR)) {
        unlinkSync(filePath)
        return { success: true }
      }
      return { success: false, error: 'File not found' }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 이미지 데이터 읽기 (미리보기용)
  ipcMain.handle('get-image-data', (_e, filePath: string) => {
    try {
      if (!existsSync(filePath) || !filePath.startsWith(RECORDINGS_DIR)) return null
      const img = nativeImage.createFromPath(filePath)
      if (img.isEmpty()) return null
      return img.toDataURL()
    } catch {
      return null
    }
  })

  // 이미지 클립보드 복사
  ipcMain.handle('copy-image-to-clipboard', (_e, filePath: string) => {
    try {
      if (!existsSync(filePath) || !filePath.startsWith(RECORDINGS_DIR)) {
        return { success: false, error: 'File not found' }
      }
      const img = nativeImage.createFromPath(filePath)
      if (img.isEmpty()) return { success: false, error: 'Invalid image' }
      clipboard.writeImage(img)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // --- 화면 캡쳐 ---

  // 전체 화면 캡쳐
  ipcMain.handle('capture-screen', async (_e, sourceId: string) => {
    try {
      // 선택된 소스의 디스플레이 찾기
      const allDisplays = screen.getAllDisplays()
      const primaryDisplay = screen.getPrimaryDisplay()

      // 가장 큰 해상도 기준으로 캡쳐 (멀티모니터 대응)
      const maxW = Math.max(...allDisplays.map((d) => d.size.width * d.scaleFactor))
      const maxH = Math.max(...allDisplays.map((d) => d.size.height * d.scaleFactor))

      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: maxW, height: maxH }
      })

      const source = sources.find((s) => s.id === sourceId)
      if (!source) return { success: false, error: 'Source not found' }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const fileName = `cap_${timestamp}.png`
      const filePath = join(RECORDINGS_DIR, fileName)
      writeFileSync(filePath, source.thumbnail.toPNG())

      return { success: true, path: filePath, fileName }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 영역 지정 캡쳐 (모니터별 개별 오버레이)
  let regionOverlays: BrowserWindow[] = []

  ipcMain.handle('capture-region', async () => {
    try {
      const allDisplays = screen.getAllDisplays()

      // 모든 스크린 소스를 고해상도로 캡쳐
      const maxRes = Math.max(
        ...allDisplays.map((d) => d.size.width * d.scaleFactor),
        ...allDisplays.map((d) => d.size.height * d.scaleFactor)
      )
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxRes, height: maxRes }
      })

      // 소스 ↔ 디스플레이 매칭
      type ScreenInfo = {
        index: number
        display: Electron.Display
        thumbnail: Electron.NativeImage
        dataUrl: string
      }
      const screenInfos: ScreenInfo[] = []

      for (const source of sources) {
        if (!source.display_id) continue
        const display = allDisplays.find((d) => String(d.id) === source.display_id)
        if (!display) continue
        screenInfos.push({
          index: screenInfos.length,
          display,
          thumbnail: source.thumbnail,
          dataUrl: source.thumbnail.toDataURL()
        })
      }

      if (screenInfos.length === 0) return { success: false, error: 'No screens found' }

      const regionHTML = `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:100vw;height:100vh;overflow:hidden;cursor:crosshair;
  user-select:none;-webkit-user-select:none;
  background-size:cover;background-position:center;}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.3);}
.selection{position:fixed;border:2px dashed #007AFF;
  background:rgba(0,122,255,0.08);
  box-shadow:0 0 0 9999px rgba(0,0,0,0.4);
  display:none;z-index:10;}
.size-label{position:fixed;padding:4px 10px;border-radius:4px;
  background:rgba(0,0,0,0.75);color:#fff;font-size:12px;
  font-family:Consolas,monospace;pointer-events:none;display:none;z-index:11;}
.hint{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);
  padding:10px 24px;border-radius:8px;
  background:rgba(0,0,0,0.75);color:#fff;font-size:14px;
  font-family:-apple-system,sans-serif;pointer-events:none;z-index:11;}
</style></head><body>
<div class="overlay" id="overlay"></div>
<div class="selection" id="sel"></div>
<div class="size-label" id="sizeLabel"></div>
<div class="hint" id="hint">드래그로 캡쳐 영역을 선택하세요 · ESC 취소</div>
<script>
let startX=0,startY=0,dragging=false;
const sel=document.getElementById('sel');
const sizeLabel=document.getElementById('sizeLabel');
const hint=document.getElementById('hint');
const overlay=document.getElementById('overlay');

document.addEventListener('mousedown',(e)=>{
  startX=e.clientX;startY=e.clientY;dragging=true;
  sel.style.display='block';hint.style.display='none';
  overlay.style.background='transparent';
  sel.style.left=startX+'px';sel.style.top=startY+'px';
  sel.style.width='0';sel.style.height='0';
});
document.addEventListener('mousemove',(e)=>{
  if(!dragging)return;
  const x=Math.min(startX,e.clientX),y=Math.min(startY,e.clientY);
  const w=Math.abs(e.clientX-startX),h=Math.abs(e.clientY-startY);
  sel.style.left=x+'px';sel.style.top=y+'px';
  sel.style.width=w+'px';sel.style.height=h+'px';
  sizeLabel.style.display='block';
  sizeLabel.style.left=(x+w+8)+'px';sizeLabel.style.top=(y+h+8)+'px';
  sizeLabel.textContent=w+' x '+h;
});
document.addEventListener('mouseup',(e)=>{
  if(!dragging)return;dragging=false;
  const x=Math.min(startX,e.clientX),y=Math.min(startY,e.clientY);
  const w=Math.abs(e.clientX-startX),h=Math.abs(e.clientY-startY);
  if(w>10&&h>10){window.api.sendRegionSelection({x,y,w,h});}
  else{sel.style.display='none';sizeLabel.style.display='none';
    hint.style.display='block';overlay.style.background='rgba(0,0,0,0.3)';}
});
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape')window.api.cancelRegionSelection();
});
</script></body></html>`

      // 각 모니터마다 개별 오버레이 창 생성
      for (const si of screenInfos) {
        const { x, y, width, height } = si.display.bounds
        const overlay = new BrowserWindow({
          x, y, width, height,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          fullscreenable: false,
          resizable: false,
          movable: false,
          webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        overlay.setAlwaysOnTop(true, 'screen-saver')
        overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(regionHTML))

        // 해당 모니터의 스크린샷을 배경으로 설정
        const dataUrl = si.dataUrl
        overlay.webContents.on('did-finish-load', () => {
          overlay.webContents.executeJavaScript(
            `document.body.style.backgroundImage="url(${dataUrl})"`
          )
        })

        // 오버레이에 스크린 인덱스 저장 (선택 시 식별용)
        ;(overlay as { _screenIndex?: number })._screenIndex = si.index
        regionOverlays.push(overlay)
      }

      // 결과 대기
      return new Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>((resolve) => {
        let resolved = false
        const cleanup = (): void => {
          for (const ov of regionOverlays) {
            if (!ov.isDestroyed()) ov.destroy()
          }
          regionOverlays = []
        }

        const onSelected = (ev: Electron.IpcMainEvent, rect: { x: number; y: number; w: number; h: number }): void => {
          if (resolved) return
          resolved = true
          ipcMain.removeListener('region-cancelled', onCancelled)

          // 어느 오버레이에서 선택했는지 찾기
          const senderOverlay = regionOverlays.find((ov) => !ov.isDestroyed() && ov.webContents.id === ev.sender.id)
          const screenIdx = senderOverlay ? (senderOverlay as { _screenIndex?: number })._screenIndex ?? 0 : 0
          const target = screenInfos[screenIdx] || screenInfos[0]

          cleanup()

          // 크롭
          const sf = target.display.scaleFactor
          const cropped = target.thumbnail.crop({
            x: Math.round(rect.x * sf),
            y: Math.round(rect.y * sf),
            width: Math.round(rect.w * sf),
            height: Math.round(rect.h * sf)
          })

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const fileName = `cap_${timestamp}.png`
          const filePath = join(RECORDINGS_DIR, fileName)
          writeFileSync(filePath, cropped.toPNG())

          resolve({ success: true, path: filePath, fileName })
        }

        const onCancelled = (): void => {
          if (resolved) return
          resolved = true
          ipcMain.removeListener('region-selected', onSelected)
          cleanup()
          resolve({ success: false, error: 'cancelled' })
        }

        ipcMain.once('region-selected', onSelected)
        ipcMain.once('region-cancelled', onCancelled)

        // 오버레이가 닫히면 취소 처리
        for (const ov of regionOverlays) {
          ov.on('closed', () => {
            if (resolved) return
            // 모든 오버레이가 닫혔는지 확인
            const allClosed = regionOverlays.every((o) => o.isDestroyed())
            if (allClosed) {
              resolved = true
              ipcMain.removeListener('region-selected', onSelected)
              ipcMain.removeListener('region-cancelled', onCancelled)
              regionOverlays = []
              resolve({ success: false, error: 'cancelled' })
            }
          })
        }
      })
    } catch (err) {
      for (const ov of regionOverlays) {
        if (!ov.isDestroyed()) ov.destroy()
      }
      regionOverlays = []
      return { success: false, error: (err as Error).message }
    }
  })
}

function setupTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')).resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip('Sophia Hub')
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide', click: () => { mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show() } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', () => { mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show() })
}

app.whenReady().then(async () => {
  setupIPC()
  createWindow()
  setupTray()

  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus())
  })

  // QuickRec 글로벌 단축키
  globalShortcut.register('Ctrl+Shift+R', () => {
    mainWindow?.webContents.send('toggle-recording')
  })

  await skillsService.init()
  skillsService.watch((skills) => { mainWindow?.webContents.send('skills-updated', skills) })
  gitService.startPolling((statuses) => { mainWindow?.webContents.send('git-status-updated', statuses) }, skillsService.getProjects())
})

app.on('will-quit', () => {
  killMacroProcess()
  cleanupMacroExecution()
  globalShortcut.unregisterAll()
  gitService.stopPolling()
  if (cursorPollingInterval) { clearInterval(cursorPollingInterval); cursorPollingInterval = null }
  if (pathRecordingInterval) { clearInterval(pathRecordingInterval); pathRecordingInterval = null }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
