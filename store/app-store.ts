import { create } from 'zustand';
import type { SettingsState } from '@/types/domain';

interface AppStoreState {
  settings: SettingsState;
  setSettings: (settings: Partial<SettingsState>) => void;
}

const initialSettings: SettingsState = {
  engagementLabel: 'IBM Consulting',
  consultantName: 'Consultant',
  autoRefreshSeconds: 30,
  enableAnimations: true,
  theme: 'dark',
};

export const useAppStore = create<AppStoreState>((set) => ({
  settings: initialSettings,
  setSettings: (settings) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...settings,
      },
    })),
}));
