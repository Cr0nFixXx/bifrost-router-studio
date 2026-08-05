import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type VisualToolKind = 'sticky' | 'box' | 'marker' | 'pen';

export interface VisualElement {
  id: string;
  kind: VisualToolKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  path?: Array<{ x: number; y: number }>;
  strokeWidth?: number;
}


export interface UserProject {
  id: string;
  name: string;
  workspaceName?: string;
  updatedAt: string;
}

interface UserSettingsState {
  projects: UserProject[];
  activeProjectId: string | null;
  visualElements: VisualElement[];
  modelApiUrl: string;
  modelApiKey: string;
  visualToolColor: string;
  visualToolSize: number;
  load: () => void;
  persist: () => void;
  addProject: (name: string) => string;
  setActiveProject: (id: string | null) => void;
  updateProject: (id: string, patch: Partial<UserProject>) => void;
  removeProject: (id: string) => void;
  setModelApi: (url: string, key?: string) => void;
  setVisualToolColor: (color: string) => void;
  setVisualToolSize: (size: number) => void;
  addVisualElement: (kind: VisualToolKind, x: number, y: number) => string;
  updateVisualElement: (id: string, patch: Partial<VisualElement>) => void;
  removeVisualElement: (id: string) => void;
  clearVisualElements: () => void;
}

const KEY = 'bfrs-user-settings-v1';

const defaults = {
  projects: [] as UserProject[],
  activeProjectId: null as string | null,
  visualElements: [] as VisualElement[],
  modelApiUrl: '/v1/models',
  modelApiKey: '',
  visualToolColor: '#fbbf24',
  visualToolSize: 12,
};

function serialize(s: UserSettingsState) {
  return {
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    visualElements: s.visualElements,
    modelApiUrl: s.modelApiUrl,
    modelApiKey: s.modelApiKey,
    visualToolColor: s.visualToolColor,
    visualToolSize: s.visualToolSize,
  };
}

export const useUserSettings = create<UserSettingsState>((set, get) => ({
  ...defaults,
  load: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      set({ ...defaults, ...parsed });
    } catch {
      /* ignore corrupted settings */
    }
  },
  persist: () => {
    try { localStorage.setItem(KEY, JSON.stringify(serialize(get()))); } catch { /* ignore */ }
  },
  addProject: (name) => {
    const id = `proj_${nanoid(8)}`;
    const project = { id, name: name.trim() || 'Untitled project', updatedAt: new Date().toISOString() };
    set({ projects: [project, ...get().projects], activeProjectId: id });
    get().persist();
    return id;
  },
  setActiveProject: (activeProjectId) => { set({ activeProjectId }); get().persist(); },
  updateProject: (id, patch) => {
    set({ projects: get().projects.map((p) => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p) });
    get().persist();
  },
  removeProject: (id) => {
    set({ projects: get().projects.filter((p) => p.id !== id), activeProjectId: get().activeProjectId === id ? null : get().activeProjectId });
    get().persist();
  },
  setModelApi: (modelApiUrl, modelApiKey = get().modelApiKey) => { set({ modelApiUrl, modelApiKey }); get().persist(); },
  setVisualToolColor: (visualToolColor) => { set({ visualToolColor }); get().persist(); },
  setVisualToolSize: (visualToolSize) => { set({ visualToolSize: Math.max(1, Math.min(48, visualToolSize)) }); get().persist(); },
  addVisualElement: (kind, x, y) => {
    const id = `vis_${nanoid(8)}`;
    const color = get().visualToolColor || (kind === 'box' ? '#22d3ee' : kind === 'marker' ? '#fbbf24' : kind === 'pen' ? '#f472b6' : '#fbbf24');
    const strokeWidth = kind === 'marker' || kind === 'pen' ? get().visualToolSize : undefined;
    const element: VisualElement = { id, kind, x, y, w: kind === 'pen' ? 260 : 240, h: kind === 'box' ? 160 : 120, text: kind === 'box' ? 'Visual group' : 'Note', color, strokeWidth };
    set({ visualElements: [...get().visualElements, element] });
    get().persist();
    return id;
  },
  updateVisualElement: (id, patch) => {
    set({ visualElements: get().visualElements.map((e) => e.id === id ? { ...e, ...patch } : e) });
    get().persist();
  },
  removeVisualElement: (id) => { set({ visualElements: get().visualElements.filter((e) => e.id !== id) }); get().persist(); },
  clearVisualElements: () => { set({ visualElements: [] }); get().persist(); },
}));
