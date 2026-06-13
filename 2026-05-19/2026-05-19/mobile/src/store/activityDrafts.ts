import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'activity_drafts';

// Draft data keyed by: customerCode_screenName_date
// Auto-expires after one day (date changes = old drafts ignored)

interface DraftEntry {
  date: string; // YYYY-MM-DD — expires after this day
  data: any;    // screen-specific data (quantities, selections, images, etc.)
}

interface ActivityDraftStore {
  drafts: Record<string, DraftEntry>;
  _loaded: boolean;

  // Load drafts from AsyncStorage
  loadDrafts: () => Promise<void>;

  // Save draft for a specific screen + customer
  saveDraft: (customerCode: string, screen: string, data: any) => void;

  // Get draft for a specific screen + customer (returns null if expired or not found)
  getDraft: (customerCode: string, screen: string) => any | null;

  // Clear draft after successful submit
  clearDraft: (customerCode: string, screen: string) => void;

  // Clear all expired drafts (older than today)
  cleanExpired: () => void;
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function makeKey(customerCode: string, screen: string): string {
  return `${customerCode}_${screen}`;
}

const useActivityDrafts = create<ActivityDraftStore>((set, get) => ({
  drafts: {},
  _loaded: false,

  loadDrafts: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, DraftEntry>;
        // Filter out expired drafts (older than today)
        const today = getTodayStr();
        const valid: Record<string, DraftEntry> = {};
        for (const [key, entry] of Object.entries(parsed)) {
          if (entry.date === today) {
            valid[key] = entry;
          }
        }
        set({ drafts: valid, _loaded: true });
      } else {
        set({ _loaded: true });
      }
    } catch {
      set({ _loaded: true });
    }
  },

  saveDraft: (customerCode, screen, data) => {
    const key = makeKey(customerCode, screen);
    console.log(`[Draft] Saving ${key}`, typeof data === 'object' ? `(${Array.isArray(data) ? data.length + ' items' : Object.keys(data).length + ' keys'})` : '');
    const today = getTodayStr();
    set((state) => {
      const newDrafts = { ...state.drafts, [key]: { date: today, data } };
      // Persist to AsyncStorage (fire and forget)
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newDrafts)).catch(() => {});
      return { drafts: newDrafts };
    });
  },

  getDraft: (customerCode, screen) => {
    const key = makeKey(customerCode, screen);
    const entry = get().drafts[key];
    if (!entry) { console.log(`[Draft] No draft for ${key}`); return null; }
    if (entry.date !== getTodayStr()) { console.log(`[Draft] Expired draft for ${key} (${entry.date})`); return null; }
    console.log(`[Draft] Restored ${key}`);
    return entry.data;
  },

  clearDraft: (customerCode, screen) => {
    const key = makeKey(customerCode, screen);
    set((state) => {
      const newDrafts = { ...state.drafts };
      delete newDrafts[key];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newDrafts)).catch(() => {});
      return { drafts: newDrafts };
    });
  },

  cleanExpired: () => {
    const today = getTodayStr();
    set((state) => {
      const valid: Record<string, DraftEntry> = {};
      for (const [key, entry] of Object.entries(state.drafts)) {
        if (entry.date === today) valid[key] = entry;
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid)).catch(() => {});
      return { drafts: valid };
    });
  },
}));

export default useActivityDrafts;
