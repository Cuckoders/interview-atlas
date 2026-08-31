import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Specialty } from '@/types/domain';

type AppState = {
  specialty: Specialty;
  savedQuestionIds: string[];
  savedVacancyIds: string[];
  completedTaskIds: string[];
  setSpecialty: (specialty: Specialty) => void;
  toggleQuestionSaved: (id: string) => void;
  toggleVacancySaved: (id: string) => void;
  toggleTaskCompleted: (id: string) => void;
};

const toggleId = (items: string[], id: string) =>
  items.includes(id) ? items.filter((item) => item !== id) : [...items, id];

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      specialty: 'Frontend',
      savedQuestionIds: [],
      savedVacancyIds: [],
      completedTaskIds: [],
      setSpecialty: (specialty) => set({ specialty }),
      toggleQuestionSaved: (id) =>
        set((state) => ({ savedQuestionIds: toggleId(state.savedQuestionIds, id) })),
      toggleVacancySaved: (id) =>
        set((state) => ({ savedVacancyIds: toggleId(state.savedVacancyIds, id) })),
      toggleTaskCompleted: (id) =>
        set((state) => ({ completedTaskIds: toggleId(state.completedTaskIds, id) })),
    }),
    {
      name: 'interview-atlas-progress-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ specialty, savedQuestionIds, savedVacancyIds, completedTaskIds }) => ({
        specialty,
        savedQuestionIds,
        savedVacancyIds,
        completedTaskIds,
      }),
    },
  ),
);
