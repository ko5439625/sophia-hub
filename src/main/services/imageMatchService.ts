import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, copyFileSync } from 'fs'
import { shell, nativeImage } from 'electron'

const MATCH_REFS_DIR = join(homedir(), '.claude', 'match-refs')
const MATCH_SESSIONS_DIR = join(homedir(), '.claude', 'match-sessions')
if (!existsSync(MATCH_REFS_DIR)) mkdirSync(MATCH_REFS_DIR, { recursive: true })
if (!existsSync(MATCH_SESSIONS_DIR)) mkdirSync(MATCH_SESSIONS_DIR, { recursive: true })

// --- Types ---

export type MatchMode = 'resize' | 'template'

export type MatchRegion = { x1: number; y1: number; x2: number; y2: number }

export type RefImage = {
  id: string
  name: string
  imagePath: string
}

export type SlotMatch = {
  slotIndex: number
  matchedRef: string | null
  matchedName: string
  similarity: number
}

export type MatchRunResult = {
  run: number
  timestamp: number
  imagePath?: string
  slots: SlotMatch[]
}

export type MatchSummaryItem = {
  count: number
  rate: number
}

export type MatchSessionData = {
  id: string
  macroId: string
  macroName: string
  startedAt: number
  completedAt?: number
  totalRuns: number
  slotsPerRun: number
  matchMode?: MatchMode
  region?: MatchRegion
  grid?: { rows: number; cols: number }
  results: MatchRunResult[]
  summary: Record<string, MatchSummaryItem>
}

// --- Image helpers ---

type SizedBuffer = { buf: Buffer; w: number; h: number; mask?: Buffer }

function imageToResizedRgba(imgPath: string, size: number): Buffer | null {
  try {
    const img = nativeImage.createFromPath(imgPath)
    if (img.isEmpty()) return null
    const resized = img.resize({ width: size, height: size, quality: 'good' })
    return resized.toBitmap() // BGRA format
  } catch {
    return null
  }
}

/** Resize maintaining aspect ratio, max dimension = maxDim. Returns buffer + actual dimensions. */
function imageToSizedRgba(imgPath: string, maxDim: number): SizedBuffer | null {
  try {
    const img = nativeImage.createFromPath(imgPath)
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    if (width === 0 || height === 0) return null

    let newW: number, newH: number
    if (width >= height) {
      newW = maxDim
      newH = Math.max(1, Math.round(height * maxDim / width))
    } else {
      newH = maxDim
      newW = Math.max(1, Math.round(width * maxDim / height))
    }

    const resized = img.resize({ width: newW, height: newH, quality: 'good' })
    const actualSize = resized.getSize()
    return { buf: resized.toBitmap(), w: actualSize.width, h: actualSize.height }
  } catch {
    return null
  }
}

/**
 * Generate background mask using edge-sampling flood fill.
 * Samples border pixels to determine background color, then marks similar pixels as background (0).
 * Foreground pixels are marked as 1 (opaque).
 */
function generateBgMask(buf: Buffer, w: number, h: number, bgTolerance = 40): Buffer {
  const mask = Buffer.alloc(w * h, 1) // default: all foreground

  // Sample border pixels (top, bottom, left, right edges) to find background color
  const borderPixels: Array<{ b: number; g: number; r: number }> = []
  for (let x = 0; x < w; x++) {
    // Top edge
    const tIdx = x * 4
    borderPixels.push({ b: buf[tIdx], g: buf[tIdx + 1], r: buf[tIdx + 2] })
    // Bottom edge
    const bIdx = ((h - 1) * w + x) * 4
    borderPixels.push({ b: buf[bIdx], g: buf[bIdx + 1], r: buf[bIdx + 2] })
  }
  for (let y = 1; y < h - 1; y++) {
    // Left edge
    const lIdx = (y * w) * 4
    borderPixels.push({ b: buf[lIdx], g: buf[lIdx + 1], r: buf[lIdx + 2] })
    // Right edge
    const rIdx = (y * w + w - 1) * 4
    borderPixels.push({ b: buf[rIdx], g: buf[rIdx + 1], r: buf[rIdx + 2] })
  }

  if (borderPixels.length === 0) return mask

  // Calculate average background color from border pixels
  let sumB = 0, sumG = 0, sumR = 0
  for (const p of borderPixels) { sumB += p.b; sumG += p.g; sumR += p.r }
  const avgB = sumB / borderPixels.length
  const avgG = sumG / borderPixels.length
  const avgR = sumR / borderPixels.length

  // Mark pixels similar to background as masked (0)
  let fgCount = 0
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4
    const db = Math.abs(buf[pi] - avgB)
    const dg = Math.abs(buf[pi + 1] - avgG)
    const dr = Math.abs(buf[pi + 2] - avgR)
    if (db <= bgTolerance && dg <= bgTolerance && dr <= bgTolerance) {
      mask[i] = 0 // background
    } else {
      fgCount++
    }
  }

  // If almost everything is foreground or background, disable mask (probably bad detection)
  const ratio = fgCount / (w * h)
  if (ratio < 0.05 || ratio > 0.95) {
    mask.fill(1) // fall back to no masking
  }

  return mask
}

function cropImage(imgPath: string, x: number, y: number, w: number, h: number): string | null {
  try {
    const img = nativeImage.createFromPath(imgPath)
    if (img.isEmpty()) return null
    const cropped = img.crop({ x, y, width: w, height: h })
    const tmpPath = join(MATCH_SESSIONS_DIR, `_tmp_crop_${Date.now()}.png`)
    writeFileSync(tmpPath, cropped.toPNG())
    return tmpPath
  } catch {
    return null
  }
}

// --- Comparison algorithms ---

/** Resize mode: both images resized to same square size, pixel-by-pixel compare */
function compareBuffers(bufA: Buffer, bufB: Buffer, tolerance = 30): number {
  if (bufA.length !== bufB.length || bufA.length === 0) return 0

  const totalPixels = bufA.length / 4
  let matching = 0

  for (let i = 0; i < bufA.length; i += 4) {
    const db = Math.abs(bufA[i] - bufB[i])
    const dg = Math.abs(bufA[i + 1] - bufB[i + 1])
    const dr = Math.abs(bufA[i + 2] - bufB[i + 2])
    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      matching++
    }
  }

  return matching / totalPixels
}

type Detection = { x: number; y: number; sim: number; refId: string; refName: string }

/**
 * Template matching: slide reference across image, find BEST match position.
 * Used for single-slot matching (resize mode fallback).
 */
function templateMatchBest(
  slot: SizedBuffer,
  ref: SizedBuffer,
  tolerance = 30,
  stride = 2
): number {
  const { buf: sBuf, w: sW, h: sH } = slot
  const { buf: rBuf, w: rW, h: rH, mask: rMask } = ref

  if (rW > sW || rH > sH) return 0

  let fgPixels = rW * rH
  if (rMask) {
    fgPixels = 0
    for (let i = 0; i < rMask.length; i++) { if (rMask[i]) fgPixels++ }
    if (fgPixels === 0) return 0
  }

  let bestSim = 0

  for (let sy = 0; sy <= sH - rH; sy += stride) {
    for (let sx = 0; sx <= sW - rW; sx += stride) {
      let matching = 0
      for (let ry = 0; ry < rH; ry++) {
        const slotRow = ((sy + ry) * sW + sx) * 4
        const refRow = (ry * rW) * 4
        const maskRow = ry * rW
        for (let rx = 0; rx < rW; rx++) {
          if (rMask && !rMask[maskRow + rx]) continue
          const si = slotRow + rx * 4
          const ri = refRow + rx * 4
          const db = Math.abs(sBuf[si] - rBuf[ri])
          const dg = Math.abs(sBuf[si + 1] - rBuf[ri + 1])
          const dr = Math.abs(sBuf[si + 2] - rBuf[ri + 2])
          if (dr <= tolerance && dg <= tolerance && db <= tolerance) matching++
        }
      }
      const sim = matching / fgPixels
      if (sim > bestSim) { bestSim = sim; if (bestSim > 0.95) return bestSim }
    }
  }

  return bestSim
}

/**
 * Template matching: find ALL instances of a reference in a larger image.
 * Returns all detection positions above threshold, with NMS applied.
 */
function templateMatchAll(
  image: SizedBuffer,
  ref: SizedBuffer,
  threshold: number,
  tolerance = 30,
  stride = 3
): Array<{ x: number; y: number; sim: number }> {
  const { buf: sBuf, w: sW, h: sH } = image
  const { buf: rBuf, w: rW, h: rH, mask: rMask } = ref

  if (rW > sW || rH > sH) return []

  let fgPixels = rW * rH
  if (rMask) {
    fgPixels = 0
    for (let i = 0; i < rMask.length; i++) { if (rMask[i]) fgPixels++ }
    if (fgPixels === 0) return []
  }

  // Collect all positions above threshold
  const rawDetections: Array<{ x: number; y: number; sim: number }> = []

  for (let sy = 0; sy <= sH - rH; sy += stride) {
    for (let sx = 0; sx <= sW - rW; sx += stride) {
      let matching = 0
      for (let ry = 0; ry < rH; ry++) {
        const slotRow = ((sy + ry) * sW + sx) * 4
        const refRow = (ry * rW) * 4
        const maskRow = ry * rW
        for (let rx = 0; rx < rW; rx++) {
          if (rMask && !rMask[maskRow + rx]) continue
          const si = slotRow + rx * 4
          const ri = refRow + rx * 4
          const db = Math.abs(sBuf[si] - rBuf[ri])
          const dg = Math.abs(sBuf[si + 1] - rBuf[ri + 1])
          const dr = Math.abs(sBuf[si + 2] - rBuf[ri + 2])
          if (dr <= tolerance && dg <= tolerance && db <= tolerance) matching++
        }
      }
      const sim = matching / fgPixels
      if (sim >= threshold) {
        rawDetections.push({ x: sx, y: sy, sim })
      }
    }
  }

  // Non-maximum suppression: merge nearby detections
  if (rawDetections.length === 0) return []
  rawDetections.sort((a, b) => b.sim - a.sim)

  const minDist = Math.min(rW, rH) * 0.7
  const accepted: Array<{ x: number; y: number; sim: number }> = []

  for (const det of rawDetections) {
    const tooClose = accepted.some(a => {
      const dx = det.x - a.x
      const dy = det.y - a.y
      return Math.sqrt(dx * dx + dy * dy) < minDist
    })
    if (!tooClose) accepted.push(det)
  }

  return accepted
}

// --- Service ---

export class ImageMatchService {
  private currentSession: MatchSessionData | null = null
  private sessionDir: string | null = null
  private refs: RefImage[] = []
  private matchMode: MatchMode = 'resize'

  // Resize mode buffers (64x64 square)
  private refBuffers: Map<string, Buffer> = new Map()
  private compareSize = 64

  // Template mode buffers (aspect-ratio preserved)
  private refTemplateBufs: Map<string, SizedBuffer> = new Map()
  private templateSlotSize = 128   // slot resize target (single-slot mode)
  private templateScanSize = 384   // full image resize for multi-instance scan
  private templateRefMaxDim = 48   // ref max dimension (keeps aspect ratio)
  private templateStride = 3

  // === Reference Image Management ===

  getRefsDir(macroId: string): string {
    const dir = join(MATCH_REFS_DIR, macroId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  getRefs(macroId: string): RefImage[] {
    const refsPath = join(this.getRefsDir(macroId), 'refs.json')
    if (!existsSync(refsPath)) return []
    try {
      return JSON.parse(readFileSync(refsPath, 'utf-8'))
    } catch { return [] }
  }

  saveRef(macroId: string, name: string, imagePath: string): RefImage {
    const dir = this.getRefsDir(macroId)
    const refs = this.getRefs(macroId)
    const id = name.replace(/[^a-zA-Z0-9가-힣]/g, '_').toLowerCase() || `ref_${Date.now()}`

    const destPath = join(dir, `${id}.png`)
    copyFileSync(imagePath, destPath)

    const ref: RefImage = { id, name, imagePath: destPath }
    const existing = refs.findIndex(r => r.id === id)
    if (existing >= 0) refs[existing] = ref
    else refs.push(ref)

    writeFileSync(join(dir, 'refs.json'), JSON.stringify(refs, null, 2), 'utf-8')
    return ref
  }

  saveRefFromBuffer(macroId: string, name: string, buffer: Buffer): RefImage {
    const dir = this.getRefsDir(macroId)
    const id = name.replace(/[^a-zA-Z0-9가-힣]/g, '_').toLowerCase() || `ref_${Date.now()}`
    const destPath = join(dir, `${id}.png`)
    writeFileSync(destPath, buffer)

    const refs = this.getRefs(macroId)
    const ref: RefImage = { id, name, imagePath: destPath }
    const existing = refs.findIndex(r => r.id === id)
    if (existing >= 0) refs[existing] = ref
    else refs.push(ref)

    writeFileSync(join(dir, 'refs.json'), JSON.stringify(refs, null, 2), 'utf-8')
    return ref
  }

  deleteRef(macroId: string, refId: string): void {
    const dir = this.getRefsDir(macroId)
    const refs = this.getRefs(macroId).filter(r => r.id !== refId)
    writeFileSync(join(dir, 'refs.json'), JSON.stringify(refs, null, 2), 'utf-8')
    const imgPath = join(dir, `${refId}.png`)
    if (existsSync(imgPath)) rmSync(imgPath)
  }

  // === Image Comparison ===

  preloadRefs(macroId: string, mode: MatchMode = 'resize'): void {
    this.refs = this.getRefs(macroId)
    this.matchMode = mode
    this.refBuffers.clear()
    this.refTemplateBufs.clear()

    for (const ref of this.refs) {
      if (mode === 'template') {
        // Template mode: preserve aspect ratio, generate background mask
        const sized = imageToSizedRgba(ref.imagePath, this.templateRefMaxDim)
        if (sized) {
          sized.mask = generateBgMask(sized.buf, sized.w, sized.h)
          const fgCount = sized.mask.filter(v => v === 1).length
          const fgPct = Math.round(fgCount / (sized.w * sized.h) * 100)
          console.log(`[MATCH] Ref "${ref.name}" ${sized.w}x${sized.h}, fg=${fgPct}%`)
          this.refTemplateBufs.set(ref.id, sized)
        } else {
          console.error('[MATCH] Failed to load ref (template):', ref.id)
        }
      } else {
        // Resize mode: square resize
        const buf = imageToResizedRgba(ref.imagePath, this.compareSize)
        if (buf) {
          this.refBuffers.set(ref.id, buf)
        } else {
          console.error('[MATCH] Failed to load ref (resize):', ref.id)
        }
      }
    }
    console.log(`[MATCH] Preloaded ${this.refs.length} refs (mode=${mode}) for macro ${macroId}`)
  }

  matchSlot(slotImagePath: string, threshold = 0.85): { refId: string | null; refName: string; similarity: number } {
    if (this.matchMode === 'template') {
      return this.matchSlotTemplate(slotImagePath, threshold)
    }
    return this.matchSlotResize(slotImagePath, threshold)
  }

  private matchSlotResize(slotImagePath: string, threshold: number): { refId: string | null; refName: string; similarity: number } {
    const slotBuf = imageToResizedRgba(slotImagePath, this.compareSize)
    if (!slotBuf) return { refId: null, refName: '(오류)', similarity: 0 }

    let bestId: string | null = null
    let bestName = '(미등록)'
    let bestSim = 0

    for (const ref of this.refs) {
      const refBuf = this.refBuffers.get(ref.id)
      if (!refBuf) continue

      const sim = compareBuffers(slotBuf, refBuf)
      if (sim > bestSim) {
        bestSim = sim
        bestId = ref.id
        bestName = ref.name
      }
    }

    // threshold 미만 → 레퍼런스에 없는 것으로 판정, 강제 매칭 안 함
    if (bestSim < threshold) {
      return { refId: null, refName: '(미등록)', similarity: bestSim }
    }
    return { refId: bestId, refName: bestName, similarity: bestSim }
  }

  private matchSlotTemplate(slotImagePath: string, threshold: number): { refId: string | null; refName: string; similarity: number } {
    const slotSized = imageToSizedRgba(slotImagePath, this.templateSlotSize)
    if (!slotSized) return { refId: null, refName: '(오류)', similarity: 0 }

    let bestId: string | null = null
    let bestName = '(미등록)'
    let bestSim = 0

    for (const ref of this.refs) {
      const refSized = this.refTemplateBufs.get(ref.id)
      if (!refSized) continue

      const sim = templateMatchBest(slotSized, refSized, 30, this.templateStride)
      if (sim > bestSim) {
        bestSim = sim
        bestId = ref.id
        bestName = ref.name
      }
    }

    if (bestSim < threshold) {
      return { refId: null, refName: '(미등록)', similarity: bestSim }
    }
    return { refId: bestId, refName: bestName, similarity: bestSim }
  }

  /**
   * Template mode: find ALL reference instances in full capture image.
   * No grid splitting needed — scans entire image for each reference.
   */
  findAllInCapture(capturePath: string, threshold = 0.85): SlotMatch[] {
    // Load full capture at a workable size
    const imageSized = imageToSizedRgba(capturePath, this.templateScanSize)
    if (!imageSized) return [{ slotIndex: 0, matchedRef: null, matchedName: '(캡처 오류)', similarity: 0 }]

    const allDetections: Detection[] = []

    for (const ref of this.refs) {
      const refSized = this.refTemplateBufs.get(ref.id)
      if (!refSized) continue

      const detections = templateMatchAll(imageSized, refSized, threshold, 30, this.templateStride)
      for (const det of detections) {
        allDetections.push({
          x: det.x, y: det.y, sim: det.sim,
          refId: ref.id, refName: ref.name
        })
      }
    }

    // Cross-ref NMS: if two different refs detect at same position, keep the better one
    allDetections.sort((a, b) => b.sim - a.sim)
    const minDist = this.templateRefMaxDim * 0.6
    const final: Detection[] = []

    for (const det of allDetections) {
      const tooClose = final.some(a => {
        const dx = det.x - a.x
        const dy = det.y - a.y
        return Math.sqrt(dx * dx + dy * dy) < minDist
      })
      if (!tooClose) final.push(det)
    }

    console.log(`[MATCH] Found ${final.length} instances in capture (${final.map(d => d.refName).join(', ')})`)

    return final.map((det, i) => ({
      slotIndex: i,
      matchedRef: det.refId,
      matchedName: det.refName,
      similarity: Math.round(det.sim * 1000) / 1000
    }))
  }

  matchCapture(
    capturePath: string,
    region: MatchRegion,
    grid: { rows: number; cols: number },
    threshold = 0.85,
    slotPadding = 0
  ): SlotMatch[] {
    // 그리드 슬롯 기반 매칭 (고정 위치 crop → 레퍼런스 비교)
    const regionW = region.x2 - region.x1
    const regionH = region.y2 - region.y1
    const slotW = Math.floor(regionW / grid.cols)
    const slotH = Math.floor(regionH / grid.rows)
    const results: SlotMatch[] = []

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const slotIndex = r * grid.cols + c
        const x = c * slotW + slotPadding
        const y = r * slotH + slotPadding
        const w = slotW - slotPadding * 2
        const h = slotH - slotPadding * 2

        const cropPath = cropImage(capturePath, x, y, Math.max(1, w), Math.max(1, h))
        if (!cropPath) {
          results.push({ slotIndex, matchedRef: null, matchedName: '(추출 오류)', similarity: 0 })
          continue
        }

        const match = this.matchSlot(cropPath, threshold)
        results.push({
          slotIndex,
          matchedRef: match.refId,
          matchedName: match.refName,
          similarity: Math.round(match.similarity * 1000) / 1000
        })

        try { rmSync(cropPath) } catch { /* ignore */ }
      }
    }

    return results
  }

  // === Session Management ===

  createSession(macroId: string, macroName: string, slotsPerRun: number, matchMode?: MatchMode, region?: MatchRegion, grid?: { rows: number; cols: number }): string {
    const id = `${macroId}_${Date.now()}`
    this.sessionDir = join(MATCH_SESSIONS_DIR, id)
    mkdirSync(this.sessionDir, { recursive: true })
    mkdirSync(join(this.sessionDir, 'captures'), { recursive: true })

    this.currentSession = {
      id, macroId, macroName,
      startedAt: Date.now(),
      totalRuns: 0, slotsPerRun,
      matchMode, region, grid,
      results: [], summary: {}
    }
    return id
  }

  processAll(
    region: MatchRegion,
    grid: { rows: number; cols: number },
    threshold: number,
    slotPadding: number,
    progressCallback: (processed: number, total: number) => void
  ): MatchSessionData | null {
    if (!this.currentSession || !this.sessionDir) return null

    const capturesDir = join(this.sessionDir, 'captures')
    if (!existsSync(capturesDir)) return null

    const files = readdirSync(capturesDir).filter(f => f.endsWith('.png')).sort()
    const total = files.length

    for (let i = 0; i < total; i++) {
      const capturePath = join(capturesDir, files[i])
      const slots = this.matchCapture(capturePath, region, grid, threshold, slotPadding)

      this.currentSession.results.push({
        run: i + 1,
        timestamp: Date.now(),
        imagePath: capturePath,
        slots
      })

      progressCallback(i + 1, total)
    }

    // Build summary — (미등록)은 별도 집계, rate 계산은 매칭된 슬롯 기준
    this.currentSession.summary = {}
    let totalSlots = 0
    let matchedSlots = 0
    for (const run of this.currentSession.results) {
      for (const slot of run.slots) {
        totalSlots++
        const key = slot.matchedName
        if (!this.currentSession.summary[key]) {
          this.currentSession.summary[key] = { count: 0, rate: 0 }
        }
        this.currentSession.summary[key].count++
        if (slot.matchedRef !== null) matchedSlots++
      }
    }
    // rate는 전체 슬롯 대비로 계산 (미등록 포함)
    const rateBase = totalSlots || 1
    for (const key of Object.keys(this.currentSession.summary)) {
      this.currentSession.summary[key].rate =
        Math.round((this.currentSession.summary[key].count / rateBase) * 10000) / 10000
    }
    console.log(`[MATCH] Summary: ${matchedSlots}/${totalSlots} slots matched, ${totalSlots - matchedSlots} unregistered`)

    this.currentSession.totalRuns = total
    this.currentSession.completedAt = Date.now()
    this.saveSession()
    return this.currentSession
  }

  private saveSession(): void {
    if (!this.currentSession || !this.sessionDir) return
    writeFileSync(
      join(this.sessionDir, 'session.json'),
      JSON.stringify(this.currentSession, null, 2), 'utf-8'
    )
  }

  getCurrentSession(): MatchSessionData | null { return this.currentSession }

  clearCurrentSession(): void {
    this.currentSession = null
    this.sessionDir = null
    this.refs = []
    this.refBuffers.clear()
    this.refTemplateBufs.clear()
  }

  // --- CRUD ---

  getSessions(): MatchSessionData[] {
    if (!existsSync(MATCH_SESSIONS_DIR)) return []
    return readdirSync(MATCH_SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))
      .map(dir => {
        const p = join(MATCH_SESSIONS_DIR, dir.name, 'session.json')
        try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null } catch { return null }
      })
      .filter(Boolean)
  }

  getSession(id: string): MatchSessionData | null {
    const p = join(MATCH_SESSIONS_DIR, id, 'session.json')
    try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null } catch { return null }
  }

  deleteSession(id: string): void {
    const dir = join(MATCH_SESSIONS_DIR, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }

  exportSession(id: string): { success: boolean; path?: string } {
    const session = this.getSession(id)
    if (!session) return { success: false }
    const exportPath = join(MATCH_SESSIONS_DIR, `${id}_export.json`)
    writeFileSync(exportPath, JSON.stringify(session, null, 2), 'utf-8')
    shell.showItemInFolder(exportPath)
    return { success: true, path: exportPath }
  }

  getSessionsDir(): string { return MATCH_SESSIONS_DIR }

  getCapturesDir(): string | null {
    return this.sessionDir ? join(this.sessionDir, 'captures') : null
  }
}
