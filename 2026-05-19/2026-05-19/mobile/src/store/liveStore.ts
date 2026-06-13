import { create } from 'zustand';
import { AppState, AppStateStatus } from 'react-native';
import { parkingApi, LiveSnapshot } from '../api/parking';

type State = {
  snapshot: LiveSnapshot | null;
  loading: boolean;
  lastError: string | null;
  // Tick is monotonically incremented each successful poll — screens that just
  // want to know "did anything change?" subscribe to this instead of the snapshot.
  tick: number;

  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
};

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let started = false;
const POLL_MS = 5000;   // 5 seconds while foregrounded

const useLive = create<State>((set, get) => ({
  snapshot: null,
  loading: false,
  lastError: null,
  tick: 0,

  refresh: async () => {
    if (get().loading) return;     // collapse concurrent refresh requests
    set({ loading: true });
    try {
      const snap = await parkingApi.live();
      set((s) => ({ snapshot: snap, lastError: null, tick: s.tick + 1, loading: false }));
    } catch (e: any) {
      set({ lastError: e?.message || 'Live refresh failed', loading: false });
    }
  },

  start: () => {
    if (started) return;
    started = true;
    // Immediate fetch on start
    get().refresh();
    intervalId = setInterval(() => {
      if (AppState.currentState === 'active') {
        get().refresh();
      }
    }, POLL_MS);
    // Resume immediately after coming back to foreground (don't wait for next tick)
    appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') get().refresh();
    });
  },

  stop: () => {
    started = false;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (appStateSub) { appStateSub.remove(); appStateSub = null; }
    set({ snapshot: null, tick: 0, lastError: null });
  },
}));

export default useLive;
