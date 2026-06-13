import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parkingApi, TOKEN_KEY, DriverUser } from '../api/parking';

const USER_KEY = 'vay_driver_user';

type State = {
  user: DriverUser | null;
  token: string | null;
  loading: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (p: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    primary_plate?: string;
    primary_type?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setUser: (u: DriverUser) => void;
};

const useDriverAuth = create<State>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  hydrate: async () => {
    try {
      const [t, raw] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      const user = raw ? (JSON.parse(raw) as DriverUser) : null;
      set({ token: t, user, loading: false });
      // Best-effort revalidate — if it 401s, drop the session quietly.
      if (t) {
        parkingApi.me().then((u) => {
          set({ user: u });
          AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
        }).catch(() => {
          get().logout().catch(() => {});
        });
      }
    } catch {
      set({ loading: false });
    }
  },

  login: async (email, password) => {
    const { token, user } = await parkingApi.login(email, password);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ token, user });
  },

  register: async (payload) => {
    const { token, user } = await parkingApi.register(payload);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ token, user });
  },

  logout: async () => {
    try { await parkingApi.logout(); } catch { /* best-effort */ }
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    set({ token: null, user: null });
  },

  refreshMe: async () => {
    const u = await parkingApi.me();
    set({ user: u });
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
  },

  setUser: (u) => {
    set({ user: u });
    AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
  },
}));

export default useDriverAuth;
