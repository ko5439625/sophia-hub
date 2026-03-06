import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { shell } from 'electron'

const OCR_SESSIONS_DIR = join(homedir(), '.claude', 'ocr-sessions')
if (!existsSync(OCR_SESSIONS_DIR)) mkdirSync(OCR_SESSIONS_DIR, { recursive: true })

export type OcrRegion = { x1: number; y1: number; x2: number; y2: number }

export type OcrResult = {
  run: number
  text: string
  imagePath?: string
  timestamp: number
  confidence?: number
}

export type OcrSessionData = {
  id: string
  macroId: string
  macroName: string
  startedAt: number
  completedAt?: number
  totalRuns: number
  results: OcrResult[]
  summary: Record<string, number>
}

export class OcrService {
  private currentSession: OcrSessionData | null = null
  private sessionDir: string | null = null

  createSession(macroId: string, macroName: string): string {
    const id = `${macroId}_${Date.now()}`
    this.sessionDir = join(OCR_SESSIONS_DIR, id)
    mkdirSync(this.sessionDir, { recursive: true })
    mkdirSync(join(this.sessionDir, 'captures'), { recursive: true })

    this.currentSession = {
      id,
      macroId,
      macroName,
      startedAt: Date.now(),
      totalRuns: 0,
      results: [],
      summary: {}
    }
    return id
  }

  addCapture(imagePath: string, runNumber: number): void {
    if (!this.currentSession) return
    this.currentSession.results.push({
      run: runNumber,
      text: '', // will be filled after OCR
      imagePath,
      timestamp: Date.now()
    })
  }

  /**
   * Run OCR on a single image using Windows OCR API via PowerShell script file
   * Returns the recognized text
   */
  async ocrImage(imagePath: string): Promise<{ text: string; confidence: number }> {
    // Ensure OCR script exists
    this.ensureOcrScript()

    try {
      const result = execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${this.ocrScriptPath}" "${imagePath}"`,
        { encoding: 'utf-8', timeout: 15000, windowsHide: true }
      ).trim()

      return { text: result || '(인식 실패)', confidence: result ? 1 : 0 }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[OCR] Error:', msg.substring(0, 200))
      return { text: '(OCR 오류)', confidence: 0 }
    }
  }

  private ocrScriptPath = join(OCR_SESSIONS_DIR, '_ocr_engine.ps1')

  private ensureOcrScript(): void {
    if (existsSync(this.ocrScriptPath)) return
    const script = `param([string]$ImagePath)
try {
    # Load Windows Runtime assemblies
    [void][Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    [void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
    [void][Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime]
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    # Helper to await WinRT async operations
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
    })[0]

    Function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        return $netTask.Result
    }

    # Open image file
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    # Create OCR engine (uses system language settings)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($engine -eq $null) {
        # Fallback: try Korean, then English
        $lang = [Windows.Globalization.Language]::new("ko")
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
        if ($engine -eq $null) {
            $lang = [Windows.Globalization.Language]::new("en")
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
        }
    }

    if ($engine -eq $null) {
        Write-Output "(OCR 엔진 없음)"
        exit
    }

    # Run OCR
    $ocrResult = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $text = $ocrResult.Text.Trim()

    # Cleanup
    $stream.Dispose()

    if ($text.Length -gt 0) {
        Write-Output $text
    } else {
        Write-Output "(빈 결과)"
    }
} catch {
    Write-Output "(OCR 오류: $($_.Exception.Message))"
}
`
    writeFileSync(this.ocrScriptPath, '\ufeff' + script, 'utf-8')
  }

  /**
   * Process all captured images with OCR
   * Calls progressCallback for each processed image
   */
  async processAll(
    progressCallback: (processed: number, total: number) => void
  ): Promise<OcrSessionData | null> {
    if (!this.currentSession) return null

    const total = this.currentSession.results.length
    for (let i = 0; i < total; i++) {
      const result = this.currentSession.results[i]
      if (result.imagePath) {
        const ocr = await this.ocrImage(result.imagePath)
        result.text = ocr.text
        result.confidence = ocr.confidence
      }
      progressCallback(i + 1, total)
    }

    // Build summary
    this.currentSession.summary = {}
    for (const r of this.currentSession.results) {
      const key = r.text.trim() || '(빈 결과)'
      this.currentSession.summary[key] = (this.currentSession.summary[key] || 0) + 1
    }
    this.currentSession.totalRuns = total
    this.currentSession.completedAt = Date.now()

    // Save session
    this.saveSession()
    return this.currentSession
  }

  private saveSession(): void {
    if (!this.currentSession || !this.sessionDir) return
    writeFileSync(
      join(this.sessionDir, 'session.json'),
      JSON.stringify(this.currentSession, null, 2),
      'utf-8'
    )
  }

  getCurrentSession(): OcrSessionData | null {
    return this.currentSession
  }

  clearCurrentSession(): void {
    this.currentSession = null
    this.sessionDir = null
  }

  // --- CRUD ---

  getSessions(): OcrSessionData[] {
    if (!existsSync(OCR_SESSIONS_DIR)) return []
    const dirs = readdirSync(OCR_SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))

    const sessions: OcrSessionData[] = []
    for (const dir of dirs) {
      const jsonPath = join(OCR_SESSIONS_DIR, dir.name, 'session.json')
      if (existsSync(jsonPath)) {
        try {
          sessions.push(JSON.parse(readFileSync(jsonPath, 'utf-8')))
        } catch { /* skip corrupt */ }
      }
    }
    return sessions
  }

  getSession(id: string): OcrSessionData | null {
    const jsonPath = join(OCR_SESSIONS_DIR, id, 'session.json')
    if (!existsSync(jsonPath)) return null
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf-8'))
    } catch {
      return null
    }
  }

  deleteSession(id: string): void {
    const dir = join(OCR_SESSIONS_DIR, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }

  exportSession(id: string): { success: boolean; path?: string } {
    const session = this.getSession(id)
    if (!session) return { success: false }
    const exportPath = join(OCR_SESSIONS_DIR, `${id}_export.json`)
    writeFileSync(exportPath, JSON.stringify(session, null, 2), 'utf-8')
    shell.showItemInFolder(exportPath)
    return { success: true, path: exportPath }
  }

  getSessionsDir(): string {
    return OCR_SESSIONS_DIR
  }

  getCapturesDir(): string | null {
    return this.sessionDir ? join(this.sessionDir, 'captures') : null
  }
}
