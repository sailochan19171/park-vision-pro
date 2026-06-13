// Reverse-geocode GPS coordinates to a short human-readable place name
// (e.g. "Prestige Skytech, Madhapur") using the phone's own network.
// Server-side reverse geocoding kept hitting rate limits because every
// report row triggered a lookup from the same backend IP. Doing it here
// means each check-in runs one lookup from the rep's phone and stores
// the answer permanently.
//
// Three providers in order — first one with a non-empty answer wins:
//   1. Photon (Komoot)    — best POI / building / street resolution
//   2. Nominatim (OSM)    — full street-level address with house no.
//   3. BigDataCloud        — locality + city only, but very reliable
//
// Returns null if all three fail — callers fall back to lat/lng.

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // --- Photon (Komoot) — free, no key, returns POI / building / street ---
    try {
      const r = await fetch(
        `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`,
        { signal: controller.signal },
      );
      if (r.ok) {
        const j = await r.json();
        const f = j?.features?.[0]?.properties;
        if (f) {
          const primary =
            f.name
            || f.housename
            || f.street
            || f.locality
            || f.district
            || f.city;
          const context = (f.locality && f.locality !== primary) ? f.locality
            : (f.district && f.district !== primary) ? f.district
            : (f.city && f.city !== primary) ? f.city
            : '';
          if (primary) return context ? `${primary}, ${context}` : primary;
        }
      }
    } catch (e) { /* try next */ }

    // --- Nominatim (OpenStreetMap) — full street-level address ---
    // Useful when Photon returns nothing (a lat/lng in a residential area
    // with no POI tagged) but the street is still in OSM. Sends a User-Agent
    // string as required by Nominatim's usage policy.
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'FarmleySFA/2.0 (field-rep-app)' },
        },
      );
      if (r.ok) {
        const j = await r.json();
        const a = j?.address ?? {};
        const road = a.road || a.pedestrian || a.footway || a.path || '';
        const suburb = a.suburb || a.neighbourhood || a.village || a.hamlet || '';
        const city = a.city || a.town || a.county || a.state_district || '';
        const parts = [a.house_number ? `${a.house_number} ${road}` : road, suburb, city]
          .map(s => (s || '').trim())
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);
        const name = parts.join(', ');
        if (name) return name;
        if (j?.display_name) return String(j.display_name).split(',').slice(0, 3).join(',').trim();
      }
    } catch (e) { /* try next */ }

    // --- BigDataCloud (fallback) — locality level, no key ---
    try {
      const r = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
        { signal: controller.signal },
      );
      if (r.ok) {
        const j = await r.json();
        const locality = j.locality || '';
        const city = j.city || j.principalSubdivision || '';
        const parts = [locality, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
        const name = parts.join(', ');
        if (name) return name;
      }
    } catch (e) { /* fall through */ }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}
