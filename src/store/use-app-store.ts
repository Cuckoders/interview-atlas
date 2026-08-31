import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Specialty } from '@/types/domain';
import { enqueueProgressAction } from '@/services/sync-outbox';

type AppState = {
  specialty: Specialty;
  savedQuestionIds: string[];
  savedVacancyIds: string[];
  completedTaskIds: string[];
  setSpecialty: (specialty: Specialty) => void;
  toggleQuestionSaved: (id: string) => void;
  toggleVacancySaved: (id: string) => void;
  toggleTaskCompleted: (id: string) => void;
  replaceProgress: (progress: Pick<AppState, 'specialty' | 'savedQuestionIds' | 'savedVacancyIds' | 'completedTaskIds'>) => void;
  resetProgress: () => void;
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
      setSpecialty: (specialty) => {
        set({ specialty });
        enqueueProgressAction({ type: 'set_specialty', value: specialty });
      },
      toggleQuestionSaved: (id) =>
        set((state) => {
          const savedQuestionIds = toggleId(state.savedQuestionIds, id);
          enqueueProgressAction({ type: 'set_question_saved', targetId: id, value: savedQuestionIds.includes(id) });
          return { savedQuestionIds };
        }),
      toggleVacancySaved: (id) =>
        set((state) => {
          const savedVacancyIds = toggleId(state.savedVacancyIds, id);
          enqueueProgressAction({ type: 'set_vacancy_saved', targetId: id, value: savedVacancyIds.includes(id) });
          return { savedVacancyIds };
        }),
      toggleTaskCompleted: (id) =>
        set((state) => {
          const completedTaskIds = toggleId(state.completedTaskIds, id);
          enqueueProgressAction({ type: 'set_task_completed', targetId: id, value: completedTaskIds.includes(id) });
          return { completedTaskIds };
        }),
      replaceProgress: (progress) => set(progress),
      resetProgress: () => set({ specialty: 'Frontend', savedQuestionIds: [], savedVacancyIds: [], completedTaskIds: [] }),
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
