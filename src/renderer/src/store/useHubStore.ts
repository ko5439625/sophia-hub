import { create } from 'zustand'

type TabId = 'home' | 'work' | 'tools' | 'notes' | 'more'

type Goal = { id: string; text: string; done: boolean; weekStart: number }

interface HubState {
  skills: Skill[]
  recentSkills: string[]
  gitStatuses: Record<string, GitStatus>
  loading: boolean
  activeTab: TabId
  selectedCategory: Skill['category'] | null
  images: ImageFile[]
  bookmarks: Bookmark[]
  notes: Note[]
  activeProject: string | null
  goals: Goal[]

  setSkills: (s: Skill[]) => void
  setRecentSkills: (s: string[]) => void
  setGitStatuses: (s: Record<string, GitStatus>) => void
  setLoading: (v: boolean) => void
  setActiveTab: (t: TabId) => void
  setSelectedCategory: (c: Skill['category'] | null) => void
  setImages: (i: ImageFile[]) => void
  setBookmarks: (b: Bookmark[]) => void
  setNotes: (n: Note[]) => void
  setActiveProject: (p: string | null) => void
  setGoals: (g: Goal[]) => void
  saveGoals: (g: Goal[]) => void
  launchSkill: (name: string, projectPath?: string) => Promise<void>
}

export const useHubStore = create<HubState>((set, get) => ({
  skills: [],
  recentSkills: [],
  gitStatuses: {},
  loading: true,
  activeTab: 'home',
  selectedCategory: null,
  images: [],
  bookmarks: [],
  notes: [],
  activeProject: null,
  goals: [],

  setSkills: (skills) => set({ skills }),
  setRecentSkills: (recentSkills) => set({ recentSkills }),
  setGitStatuses: (gitStatuses) => set({ gitStatuses }),
  setLoading: (loading) => set({ loading }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setImages: (images) => set({ images }),
  setBookmarks: (bookmarks) => set({ bookmarks }),
  setNotes: (notes) => set({ notes }),
  setActiveProject: (activeProject) => set({ activeProject }),
  setGoals: (goals) => set({ goals }),
  saveGoals: (goals) => {
    set({ goals })
    window.api.setStore('goals', goals)
  },

  launchSkill: async (name, projectPath) => {
    await window.api.launchSkill(name, projectPath)
    const recent = get().recentSkills
    const updated = [name, ...recent.filter((s) => s !== name)].slice(0, 8)
    const activeProject = projectPath ? name : get().activeProject
    set({ recentSkills: updated, activeProject })
    if (projectPath) {
      window.api.setStore('activeProject', { name, time: Date.now() })
    }
  }
}))
