/// <reference types="vite/client" />

type Skill = {
  name: string
  description: string
  category: 'project' | 'dev' | 'idea' | 'work' | 'more'
  projectPath?: string
  techStack?: string
}

type GitStatus = {
  projectPath: string
  branch: string
  modified: number
  untracked: number
  ahead: number
  behind: number
  lastCommitTime?: number // unix timestamp (seconds)
}

type Note = {
  id: string
  content: string
  tags: string[]
  category: string
  createdAt: number
  updatedAt: number
}

type ImageFile = {
  name: string
  path: string
  time: number
}

type Bookmark = {
  name: string
  url: string
}

type JiraIssue = {
  key: string
  summary: string
  status: string
  statusCategory: 'new' | 'indeterminate' | 'done'
  priority: string
}

type MacroPathPoint = { t: number; x: number; y: number }

type MacroStep =
  | { type: 'path'; points: MacroPathPoint[]; duration: number }
  | { type: 'click'; x: number; y: number; button: 'left' | 'right' }
  | { type: 'move'; x: number; y: number }
  | { type: 'direction'; dir: 'left' | 'right' | 'up' | 'down'; speed: number; duration: number }
  | { type: 'text'; value: string }
  | { type: 'key'; keys: string[] }
  | { type: 'wait'; ms: number; random?: boolean; min?: number; max?: number }

type Macro = {
  id: string; name: string; steps: MacroStep[]
  speed: number; repeat: number
  gameMode?: 'off' | 'alt-hold' | 'alt-click' | 'postmsg' | 'abs-input'
  runAsAdmin?: boolean
  createdAt: number; updatedAt: number
}

type CursorInfo = { x: number; y: number; rgb: string }

type MacroExecStatus =
  | { state: 'countdown'; remaining: number }
  | { state: 'running'; currentStep: number; totalSteps: number; currentRepeat: number; totalRepeat: number }
  | { state: 'stopped'; reason: 'completed' | 'emergency' | 'failsafe' | 'error'; error?: string }

type RecordingSource = {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnail: string
}

type RecordingFile = {
  name: string
  path: string
  time: number
  size: number
}

interface HubAPI {
  getSkills(): Promise<Skill[]>
  launchSkill(name: string, projectPath?: string): Promise<{ success: boolean; error?: string }>
  getRecentSkills(): Promise<string[]>
  setMode(mode: string): Promise<boolean>
  getGitStatus(path: string): Promise<GitStatus>
  getProjects(): Promise<Array<{ name: string; path: string; techStack: string }>>
  dragWindow(dx: number, dy: number): Promise<void>
  savePosition(): Promise<void>
  getStore(key: string): Promise<unknown>
  setStore(key: string, value: unknown): Promise<void>
  openUrl(url: string): Promise<void>
  pasteImage(): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
  getImages(): Promise<ImageFile[]>
  deleteImage(path: string): Promise<{ success: boolean; error?: string }>
  getBookmarks(): Promise<Bookmark[]>
  saveBookmarks(bookmarks: Bookmark[]): Promise<void>
  getNotes(): Promise<Note[]>
  saveNotes(notes: Note[]): Promise<void>
  getRecentCommits(projectPath: string, since: string): Promise<Array<{ hash: string; message: string; time: string }>>
  getSkillLogs(): Promise<Array<{ skill: string; time: number }>>
  getIdeaFiles(): Promise<Array<{ name: string; month: string }>>
  getIdeaContent(fileName: string): Promise<string>
  getMemoryFiles(): Promise<Array<{ name: string; label: string }>>
  getMemoryContent(fileName: string): Promise<string>
  setOpacity(value: number): Promise<void>
  setPanelWidth(w: number): Promise<void>
  getJiraIssues(projectKeys: string[]): Promise<JiraIssue[]>
  // QuickRec - 녹화
  getRecordingSources(): Promise<RecordingSource[]>
  saveRecording(buffer: ArrayBuffer): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
  getRecordings(): Promise<RecordingFile[]>
  openRecordingsFolder(): Promise<void>
  openRecording(path: string): Promise<void>
  deleteRecording(path: string): Promise<{ success: boolean; error?: string }>
  onToggleRecording(cb: () => void): () => void
  // QuickRec - 캡쳐
  captureScreen(sourceId: string): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
  captureRegion(sourceId: string): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
  sendRegionSelection(rect: { x: number; y: number; w: number; h: number }): void
  cancelRegionSelection(): void
  getImageData(path: string): Promise<string | null>
  copyImageToClipboard(path: string): Promise<{ success: boolean; error?: string }>
  // Macro - 커서/색상
  startCursorPolling(): Promise<void>
  stopCursorPolling(): Promise<void>
  onCursorUpdate(cb: (info: CursorInfo) => void): () => void
  pickColor(): Promise<string>
  captureCursorArea(): Promise<{ grid: string[][]; color: string; x: number; y: number }>
  pickPosition(): Promise<{ x: number; y: number; color: string } | null>
  sendPickResult(pos: { x: number; y: number }): void
  cancelPick(): void
  // Macro - 경로 녹화
  startPathRecording(): Promise<void>
  stopPathRecording(): Promise<MacroPathPoint[]>
  recordPathInteractive(): Promise<MacroPathPoint[] | null>
  // Macro - 배경 녹화
  startBgRecording(sourceId?: string): Promise<boolean>
  stopBgRecording(): Promise<{ success: boolean; path?: string; fileName?: string }>
  // Macro - CRUD
  getMacros(): Promise<Macro[]>
  saveMacro(macro: Macro): Promise<void>
  deleteMacro(id: string): Promise<void>
  // Macro - 실행
  executeMacro(macro: Macro): Promise<void>
  stopMacro(): Promise<void>
  onMacroStatus(cb: (status: MacroExecStatus) => void): () => void

  onSkillsUpdated(cb: (skills: Skill[]) => void): () => void
  onGitStatusUpdated(cb: (statuses: Record<string, GitStatus>) => void): () => void
}

declare global {
  interface Window { api: HubAPI }
}
export {}
