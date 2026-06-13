import { create } from 'zustand';

interface ActiveVisit {
  visitId: string;
  customerCode: string;
  checkinTime: number;
  status: 'checked_in' | 'completed';
}

interface VisitStore {
  activeVisit: ActiveVisit | null;
  setActiveVisit: (visit: ActiveVisit) => void;
  updateVisitStatus: (status: 'checked_in' | 'completed') => void;
  clearVisit: () => void;
}

const useVisitStore = create<VisitStore>((set) => ({
  activeVisit: null,
  setActiveVisit: (visit) => set({ activeVisit: visit }),
  updateVisitStatus: (status) =>
    set((state) =>
      state.activeVisit ? { activeVisit: { ...state.activeVisit, status } } : state,
    ),
  clearVisit: () => set({ activeVisit: null }),
}));

export default useVisitStore;
