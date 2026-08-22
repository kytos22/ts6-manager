import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function applyScale(scale: number) {
  const safeScale = [0.9, 1, 1.1, 1.25, 1.4].includes(scale) ? scale : 1;
  // Scale rem-based UI measurements while keeping the browser viewport intact.
  // Remove the previous body zoom so persisted users migrate cleanly.
  document.body.style.removeProperty('zoom');
  document.documentElement.style.fontSize = `${safeScale * 100}%`;
}

interface UiStore {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  uiScale: number;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUiScale: (scale: number) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'dark',
      uiScale: 1,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        applyTheme(next);
      },
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setUiScale: (scale) => {
        set({ uiScale: scale });
        applyScale(scale);
      },
    }),
    {
      name: 'ts6-ui',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme);
        }
        applyScale(state?.uiScale ?? 1);
      },
    },
  ),
);
