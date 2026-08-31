import { create } from 'zustand';

import type { AccountUser } from '@/types/account';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

type SessionState = {
  status: SessionStatus;
  user: AccountUser | null;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
  setSignedIn: (user: AccountUser) => void;
  setSignedOut: () => void;
  setRestoring: () => void;
  setSyncState: (syncStatus: SyncStatus, error?: string | null) => void;
  markSynced: (at: string) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  status: 'restoring',
  user: null,
  syncStatus: 'idle',
  lastSyncAt: null,
  error: null,
  setSignedIn: (user) => set({ status: 'signedIn', user, error: null }),
  setSignedOut: () => set({ status: 'signedOut', user: null, syncStatus: 'idle', lastSyncAt: null, error: null }),
  setRestoring: () => set({ status: 'restoring', error: null }),
  setSyncState: (syncStatus, error = null) => set({ syncStatus, error }),
  markSynced: (lastSyncAt) => set({ syncStatus: 'idle', lastSyncAt, error: null }),
}));
