import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CompletionQuality, PreparationSnapshot } from '@/types/preparation';

type PreparationStatus = 'idle' | 'loading' | 'syncing' | 'offline' | 'error';
type PreparationState = {
  ownerId: string | null;
  snapshot: PreparationSnapshot | null;
  status: PreparationStatus;
  error: string | null;
  pendingCount: number;
  replaceSnapshot: (ownerId: string, snapshot: PreparationSnapshot) => void;
  setStatus: (status: PreparationStatus, error?: string | null) => void;
  setPendingCount: (count: number) => void;
  completeOptimistically: (sessionId: string, quality: CompletionQuality, occurredAt: string) => void;
  reset: () => void;
};

export const usePreparationStore = create<PreparationState>()(persist((set) => ({
  ownerId: null, snapshot: null, status: 'idle', error: null, pendingCount: 0,
  replaceSnapshot: (ownerId, snapshot) => set({ ownerId, snapshot, status: 'idle', error: null }),
  setStatus: (status, error = null) => set({ status, error }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  completeOptimistically: (sessionId, quality, occurredAt) => set((state) => {
    if (!state.snapshot?.plan) return state;
    return { snapshot: { ...state.snapshot, plan: { ...state.snapshot.plan, sessions: state.snapshot.plan.sessions.map((session) =>
      session.id === sessionId ? { ...session, status: 'completed' as const, quality, completedAt: occurredAt } : session,
    ) } } };
  }),
  reset: () => set({ ownerId: null, snapshot: null, status: 'idle', error: null, pendingCount: 0 }),
}), {
  name: 'interview-atlas-preparation-v1', storage: createJSONStorage(() => AsyncStorage),
  partialize: ({ ownerId, snapshot }) => ({ ownerId, snapshot }),
}));
