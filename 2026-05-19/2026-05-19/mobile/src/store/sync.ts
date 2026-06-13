import { create } from 'zustand';

interface SyncStore {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
  syncError: string | null;
  setPendingCount: (n: number) => void;
  setSyncing: (b: boolean) => void;
  setSyncError: (e: string | null) => void;
  setLastSyncAt: (t: number) => void;
}

const useSyncStore = create<SyncStore>((set) => ({
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  syncError: null,
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncing: (b) => set({ isSyncing: b }),
  setSyncError: (e) => set({ syncError: e }),
  setLastSyncAt: (t) => set({ lastSyncAt: t }),
}));

export default useSyncStore;
