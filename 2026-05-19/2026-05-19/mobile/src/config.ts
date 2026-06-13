// VayAccess Driver Mobile — points at the admin webportal Flask app.
//
// For local dev pick the one that fits your environment:
//   Android emulator  → http://10.0.2.2:5002
//   iOS simulator     → http://localhost:5002
//   Real device (LAN) → http://<your-laptop-ip>:5002
//   Cloud (Render)    → https://vayaccess-cloud.onrender.com   (live URL)
export const API_BASE_URL = 'https://vayaccess-cloud.onrender.com';

export const API_URL = `${API_BASE_URL}/api/driver`;

// Brand
export const BRAND = {
  name: 'VayAccess',
  primary: '#1240ab',
  primaryDark: '#0a2a78',
  accent: '#ffb703',
  bg: '#f6f7fb',
  text: '#0e1726',
  muted: '#6b7280',
  surface: '#ffffff',
  border: '#e5e7eb',
  success: '#16a34a',
  warning: '#d5952a',
  danger: '#b74a42',
};

export const VEHICLE_TYPES = ['Car', 'Bike'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];

export const PAYMENT_METHODS = [
  'PhonePe',
  'Paytm',
  'Google Pay',
  'BHIM',
  'FASTag',
  'Card',
  'Cash',
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];
