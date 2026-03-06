import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { watch, FSWatcher } from 'fs'
import { homedir } from 'os'

export type Skill = {
  name: string
  description: string
  category: 'project' | 'dev' | 'idea' | 'work' | 'more'
  projectPath?: string
  techStack?: string
}

type Project = {
  name: string
  path: string
  techStack: string
}

const SKILLS_DIR = join(homedir(), '.claude', 'skills')

// 스킬 카테고리 매핑
const CATEGORY_MAP: Record<string, Skill['category']> = {
  // 프로젝트 (project) - 개별 프로젝트 전용 스킬
  확률: 'project',
  확률확인: 'project',
  지라: 'project',
  포폴: 'project',
  DIFF: 'project',
  영상분석: 'project',
  허브: 'project',
  // 개발 (dev) - 개발 워크플로우 스킬
  개발: 'dev',
  프로젝트: 'dev',
  백로그: 'dev',
  PRD: 'dev',
  // 아이디어 (idea)
  아이디어: 'idea',
  // 업무 (work)
  업무: 'work',
  데일리: 'work',
  QA: 'work',
  회고: 'work',
  문서정리: 'work',
  // 더보기 (more)
  시작: 'more',
  리서치: 'more',
  블로그등록: 'more',
  메모리: 'more'
}

// SKILL.md 내용 기반 자동 분류
const DEV_KEYWORDS = ['프로젝트', '경로:', '기술 스택', '코드', '개발', '빌드', '배포', 'git', 'npm', 'python', 'react', 'next']
const WORK_KEYWORDS = ['업무', '할 일', '테스트', '체크리스트', '버그', '리포트', '회고', 'KPT', '우선순위', '일정', 'PRD', '설계']
const IDEA_KEYWORDS = ['아이디어', '브레인스토밍', '아이디어 폭발', '주제 선택']

function autoDetectCategory(name: string, content: string): Skill['category'] {
  // 1. 하드코딩 맵에 있으면 그걸 사용
  if (CATEGORY_MAP[name]) return CATEGORY_MAP[name]

  // 2. frontmatter에 category 필드가 있으면 사용
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const catMatch = fmMatch[1].match(/category:\s*(dev|idea|work|more)/)
    if (catMatch) return catMatch[1] as Skill['category']
  }

  // 3. 내용 기반 키워드 분류
  const lower = content.toLowerCase()
  const devScore = DEV_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase())).length
  const workScore = WORK_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase())).length
  const ideaScore = IDEA_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase())).length

  if (ideaScore >= 2) return 'idea'
  if (devScore > workScore && devScore >= 2) return 'dev'
  if (workScore >= 2) return 'work'

  // 4. projectPath가 있으면 dev
  if (content.match(/^-\s*경로:/m)) return 'dev'

  return 'more'
}

export class SkillsService {
  private skills: Skill[] = []
  private projects: Project[] = []
  private watcher: FSWatcher | null = null

  async init(): Promise<void> {
    await this.loadSkills()
  }

  private async loadSkills(): Promise<void> {
    try {
      const entries = await readdir(SKILLS_DIR)
      const dirs: string[] = []
      for (const entry of entries) {
        const s = await stat(join(SKILLS_DIR, entry))
        if (s.isDirectory()) dirs.push(entry)
      }

      const skills: Skill[] = []
      const projects: Project[] = []

      for (const name of dirs) {
        const skillFile = join(SKILLS_DIR, name, 'SKILL.md')
        let content: string
        try {
          content = await readFile(skillFile, 'utf-8')
        } catch {
          continue
        }

        // frontmatter에서 description 파싱
        let description = name
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
        if (fmMatch) {
          // user-invocable: false인 스킬은 스킵
          if (/user-invocable:\s*false/.test(fmMatch[1])) continue

          const descMatch = fmMatch[1].match(/description:\s*(.+)/)
          if (descMatch) description = descMatch[1].trim()
        }

        const lines = content.split('\n')
        const category = autoDetectCategory(name, content)

        let projectPath: string | undefined
        let techStack: string | undefined

        for (const line of lines) {
          const pathMatch = line.match(/^-\s*경로:\s*(.+)/)
          if (pathMatch) {
            projectPath = pathMatch[1].trim().replace(/~/, homedir()).replace(/\/$/, '')
          }

          const techMatch = line.match(/^-\s*기술 스택:\s*(.+)/)
          if (techMatch) {
            techStack = techMatch[1].trim()
          }
        }

        if (!techStack) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/기술 스택/)) {
              const stackLines: string[] = []
              for (let j = i + 1; j < lines.length && j < i + 6; j++) {
                const stackItem = lines[j].match(/^\s*-\s*(.+)/)
                if (stackItem) {
                  stackLines.push(stackItem[1].trim())
                } else if (lines[j].trim() === '') {
                  continue
                } else {
                  break
                }
              }
              if (stackLines.length > 0) {
                techStack = stackLines.join(', ')
              }
              break
            }
          }
        }

        skills.push({ name, description, category, projectPath, techStack })

        if (projectPath) {
          projects.push({ name, path: projectPath, techStack: techStack || '' })
        }
      }

      this.skills = skills
      this.projects = projects
    } catch {
      this.skills = []
      this.projects = []
    }
  }

  getSkills(): Skill[] {
    return this.skills
  }

  getProjects(): Project[] {
    return this.projects
  }

  watch(callback: (skills: Skill[]) => void): void {
    try {
      this.watcher = watch(SKILLS_DIR, { recursive: true }, async (eventType, filename) => {
        if (filename?.endsWith('.md')) {
          await this.loadSkills()
          callback(this.skills)
        }
      })
    } catch {
      // skills dir may not exist
    }
  }

  dispose(): void {
    this.watcher?.close()
    this.watcher = null
  }
}
