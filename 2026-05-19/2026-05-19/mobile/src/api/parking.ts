import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

export const TOKEN_KEY = 'vay_driver_token';

export type Facility = {
  id: number;
  name: string;
  capacity: number;
  occupied: number;
  available: number;
  location: string;
  region: string;
  tariffs: Record<string, { id: number; type: string; model: string; rate: number; dailyCap: number; lost: number }>;
};

export type Reservation = {
  id: number;
  yard: string;
  vehicle_plate: string;
  vehicle_type: string;
  slot_label: string;
  start_at: string;
  end_at: string;
  status: string;
  amount: number;
  payment_method: string;
  transaction_id: string;
  created_at: string;
};

export type ActiveSession = {
  id: number;
  vehicle: string;
  type: string;
  zone: string;
  owner: string;
  entryAt: number | null;
  exitAt: number | null;
  total: number;
  payment: string;
  isActive: boolean;
} | null;

export type DriverUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  primary_plate: string;
  primary_type: string;
  fastag_id: string;
  created_at: string;
};

export type Notif = {
  id: number;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  created_at: string;
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  } catch (e: any) {
    throw new ApiError(0, e?.message || 'Network error');
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && typeof body === 'object' && body.error) || res.statusText || 'Request failed';
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const parkingApi = {
  // Auth
  register: (payload: { name: string; email: string; phone?: string; password: string; primary_plate?: string; primary_type?: string }) =>
    request<{ token: string; user: DriverUser }>('/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: DriverUser }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),
  me: () => request<DriverUser>('/me'),
  updateMe: (patch: Partial<DriverUser> & { password?: string }) =>
    request<DriverUser>('/me', { method: 'PUT', body: JSON.stringify(patch) }),

  // Facilities
  facilities: (region?: string) =>
    request<Facility[]>(`/facilities${region ? `?region=${encodeURIComponent(region)}` : ''}`),
  facility: (id: number) => request<Facility>(`/facilities/${id}`),
  regions: () => request<{ id: number; name: string; description: string }[]>('/regions'),

  // Reservations
  reservations: () => request<Reservation[]>('/reservations'),
  reserve: (payload: {
    yard: string;
    vehicle_plate: string;
    vehicle_type: string;
    start_at: string;
    end_at: string;
    amount?: number;
    payment_method?: string;
    upi_id?: string;
    transaction_id?: string;
  }) => request<Reservation>('/reservations', { method: 'POST', body: JSON.stringify(payload) }),
  cancel: (id: number) => request<Reservation>(`/reservations/${id}`, { method: 'DELETE' }),

  // Sessions
  activeSession: () => request<ActiveSession>('/sessions/active'),
  history: () => request<NonNullable<ActiveSession>[]>('/sessions/history'),

  // Notifications
  notifications: () => request<Notif[]>('/notifications'),
  markRead: (id: number) => request<Notif>(`/notifications/${id}/read`, { method: 'POST' }),

  // QR pass for upcoming reservation
  qrPass: () => request<{ reservation: Reservation; token: string; pass_url: string }>('/qr_pass'),

  // Combined live snapshot — single round-trip for the foreground poller.
  live: () => request<LiveSnapshot>('/live'),
};

export type ZoneEntry = {
  id: number;
  vehicle: string;
  vehicle_type: string;
  owner: string;
  mode: string;
  entry_at: string;
  still_parked: boolean;
};

export type Zone = {
  zone: string;
  region: string;
  location: string;
  capacity: number;
  occupied: number;
  available: number;
  entries_last_hour: number;
  exits_last_hour: number;
  recent: ZoneEntry[];
};

export type LiveSnapshot = {
  user: DriverUser;
  active: NonNullable<ActiveSession> | null;
  reservations: Reservation[];
  notifications: Notif[];
  unread: number;
  zones: Zone[];
  server_time: string;
};

export { ApiError };
