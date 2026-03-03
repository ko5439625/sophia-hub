import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSkills: () => ipcRenderer.invoke('get-skills'),
  launchSkill: (name: string, projectPath?: string) => ipcRenderer.invoke('launch-skill', name, projectPath),
  getRecentSkills: () => ipcRenderer.invoke('get-recent-skills'),
  setMode: (mode: string) => ipcRenderer.invoke('set-mode', mode),
  getGitStatus: (path: string) => ipcRenderer.invoke('get-git-status', path),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  dragWindow: (dx: number, dy: number) => ipcRenderer.invoke('drag-window', dx, dy),
  savePosition: () => ipcRenderer.invoke('save-position'),
  getStore: (key: string) => ipcRenderer.invoke('get-store', key),
  setStore: (key: string, val: unknown) => ipcRenderer.invoke('set-store', key, val),

  // 새 기능
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  getImages: () => ipcRenderer.invoke('get-images'),
  deleteImage: (path: string) => ipcRenderer.invoke('delete-image', path),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  saveBookmarks: (b: Array<{ name: string; url: string }>) => ipcRenderer.invoke('save-bookmarks', b),
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNotes: (notes: Array<{ id: string; content: string; tags: string[]; category: string; createdAt: number; updatedAt: number }>) => ipcRenderer.invoke('save-notes', notes),
  getRecentCommits: (projectPath: string, since: string) => ipcRenderer.invoke('get-recent-commits', projectPath, since),
  getSkillLogs: () => ipcRenderer.invoke('get-skill-logs'),
  getIdeaFiles: () => ipcRenderer.invoke('get-idea-files'),
  getIdeaContent: (fileName: string) => ipcRenderer.invoke('get-idea-content', fileName),
  getMemoryFiles: () => ipcRenderer.invoke('get-memory-files'),
  getMemoryContent: (fileName: string) => ipcRenderer.invoke('get-memory-content', fileName),
  setOpacity: (value: number) => ipcRenderer.invoke('set-opacity', value),
  setPanelWidth: (w: number) => ipcRenderer.invoke('set-panel-width', w),
  getJiraIssues: (projectKeys: string[]) => ipcRenderer.invoke('get-jira-issues', projectKeys),

  // QuickRec - 녹화
  getRecordingSources: () => ipcRenderer.invoke('get-recording-sources'),
  saveRecording: (buffer: ArrayBuffer) => ipcRenderer.invoke('save-recording', buffer),
  getRecordings: () => ipcRenderer.invoke('get-recordings'),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  openRecording: (path: string) => ipcRenderer.invoke('open-recording', path),
  deleteRecording: (path: string) => ipcRenderer.invoke('delete-recording', path),

  // QuickRec - 캡쳐
  captureScreen: (sourceId: string) => ipcRenderer.invoke('capture-screen', sourceId),
  captureRegion: (sourceId: string) => ipcRenderer.invoke('capture-region', sourceId),
  sendRegionSelection: (rect: { x: number; y: number; w: number; h: number }) => ipcRenderer.send('region-selected', rect),
  cancelRegionSelection: () => ipcRenderer.send('region-cancelled'),
  getImageData: (path: string) => ipcRenderer.invoke('get-image-data', path),
  copyImageToClipboard: (path: string) => ipcRenderer.invoke('copy-image-to-clipboard', path),

  // Macro - 커서/색상
  startCursorPolling: () => ipcRenderer.invoke('start-cursor-polling'),
  stopCursorPolling: () => ipcRenderer.invoke('stop-cursor-polling'),
  onCursorUpdate: (cb: (info: { x: number; y: number; rgb: string }) => void) => {
    const h = (_e: unknown, info: { x: number; y: number; rgb: string }) => cb(info)
    ipcRenderer.on('cursor-update', h as never)
    return () => ipcRenderer.removeListener('cursor-update', h as never)
  },
  pickColor: () => ipcRenderer.invoke('pick-color'),
  captureCursorArea: () => ipcRenderer.invoke('capture-cursor-area'),
  pickPosition: () => ipcRenderer.invoke('pick-position'),
  sendPickResult: (pos: { x: number; y: number }) => ipcRenderer.send('pick-result', pos),
  cancelPick: () => ipcRenderer.send('pick-cancelled'),
  // Macro - 경로 녹화
  startPathRecording: () => ipcRenderer.invoke('start-path-recording'),
  stopPathRecording: () => ipcRenderer.invoke('stop-path-recording'),
  recordPathInteractive: () => ipcRenderer.invoke('record-path-interactive'),
  // Macro - 배경 녹화
  startBgRecording: (sourceId?: string) => ipcRenderer.invoke('start-bg-recording', sourceId),
  stopBgRecording: () => ipcRenderer.invoke('stop-bg-recording'),
  // Macro - CRUD
  getMacros: () => ipcRenderer.invoke('get-macros'),
  saveMacro: (macro: unknown) => ipcRenderer.invoke('save-macro', macro),
  deleteMacro: (id: string) => ipcRenderer.invoke('delete-macro', id),
  // Macro - 실행
  executeMacro: (macro: unknown) => ipcRenderer.invoke('execute-macro', macro),
  stopMacro: () => ipcRenderer.invoke('stop-macro'),
  onMacroStatus: (cb: (status: unknown) => void) => {
    const h = (_e: unknown, status: unknown) => cb(status)
    ipcRenderer.on('macro-status', h as never)
    return () => ipcRenderer.removeListener('macro-status', h as never)
  },

  onToggleRecording: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('toggle-recording', h as never)
    return () => ipcRenderer.removeListener('toggle-recording', h as never)
  },

  onSkillsUpdated: (cb: (skills: unknown[]) => void) => {
    const h = (_e: unknown, s: unknown[]) => cb(s)
    ipcRenderer.on('skills-updated', h as never)
    return () => ipcRenderer.removeListener('skills-updated', h as never)
  },
  onGitStatusUpdated: (cb: (s: Record<string, unknown>) => void) => {
    const h = (_e: unknown, s: Record<string, unknown>) => cb(s)
    ipcRenderer.on('git-status-updated', h as never)
    return () => ipcRenderer.removeListener('git-status-updated', h as never)
  }
}

contextBridge.exposeInMainWorld('api', api)
