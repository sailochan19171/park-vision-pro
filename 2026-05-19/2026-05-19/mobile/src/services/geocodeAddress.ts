// Forward-geocode a free-text address to lat/lng so unmapped customers
// still get a useful map pin and a sensible "Existing Shop Location"
// preview in the geo-edit modal. Tried providers in order — first one
// with a result wins:
//   1. Photon (Komoot)    — handles partial / messy addresses well
//   2. Nominatim (OSM)    — better street-level coverage in India / Asia
//
// Returns null if both fail (true offline, no network, or the address
// doesn't match anything on either map). Callers fall back to the rep's
// own GPS or DEFAULT_REGION from there.
//
// Soft 6 s timeout so a slow lookup never blocks the map from rendering.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'geocodeAddress_v1_';

function normalize(addr: string): string {
  return addr.replace(/\s+/g, ' ').trim();
}

export interface GeocodeResult {
  lat: number;
  lng: number;
}

async function readCache(key: string): Promise<GeocodeResult | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch { /* ignore */ }
  return null;
}

async function writeCache(key: string, value: GeocodeResult): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult | null> {
  if (!address) return null;
  const cleaned = normalize(address);
  if (cleaned.length < 4) return null;

  // Cache forward-geocode results by the normalised address so multiple
  // screens looking up the same store don't re-hit the network. Cache is
  // per-rep-device and never expires — addresses don't move; if a rep
  // wants a fresh lookup they can submit a geo-code via the existing
  // edit flow.
  const cached = await readCache(cleaned);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const encoded = encodeURIComponent(cleaned);

  try {
    // Photon — handles partial addresses, returns most-likely match.
    try {
      const r = await fetch(
        `https://photon.komoot.io/api/?q=${encoded}&limit=1&lang=en`,
        { signal: controller.signal },
      );
      if (r.ok) {
        const j = await r.json();
        const coords = j?.features?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const result = { lat, lng };
            await writeCache(cleaned, result);
            return result;
          }
        }
      }
    } catch { /* try next */ }

    // Nominatim — better Indian street-level coverage. Honour their
    // usage policy with a descriptive User-Agent.
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encoded}&limit=1&accept-language=en`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'FarmleySFA/2.0 (field-rep-app)' },
        },
      );
      if (r.ok) {
        const j = await r.json();
        const first = Array.isArray(j) ? j[0] : null;
        const lat = first ? parseFloat(first.lat) : NaN;
        const lng = first ? parseFloat(first.lon) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const result = { lat, lng };
          await writeCache(cleaned, result);
          return result;
        }
      }
    } catch { /* fall through */ }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}
