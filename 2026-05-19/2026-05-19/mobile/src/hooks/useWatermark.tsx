import React, { useState, useCallback } from 'react';
import { BurnWatermark, type WatermarkInfo } from '../services/watermarkService';
import { reverseGeocode } from '../services/reverseGeocode';
import useAuthStore from '../store/auth';

export function useWatermark(customerName?: string, customerCode?: string) {
  const user = useAuthStore((s) => s.user);
  const [pendingWatermark, setPendingWatermark] = useState<
    { photoUri: string; info: WatermarkInfo; callback: (uri: string) => void } | null
  >(null);

  const burnWatermark = useCallback(
    (photoUri: string, ts: number | null, lat: number | null, lng: number | null): Promise<string> => {
      return new Promise((resolve) => {
        (async () => {
          const d = new Date(ts ?? Date.now());
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');

          // Live reverse-geocode the rep's current GPS for the street address.
          // The lat/lng + timestamp + user are ALWAYS burned regardless; only
          // the address needs the network. Cap the lookup at 3 s so the photo
          // appears almost immediately after capture instead of waiting up to
          // the geocoder's 8 s internal budget (the "5-6 s before the photo
          // shows" lag). On a fast network the address still lands well within
          // the cap; on a slow one the overlay simply shows lat/lng only.
          let address: string | null = null;
          if (lat != null && lng != null) {
            try {
              address = await Promise.race([
                reverseGeocode(lat, lng),
                new Promise<null>((res) => setTimeout(() => res(null), 3000)),
              ]);
            } catch { /* keep null — overlay shows lat/lng only */ }
          }

          const info: WatermarkInfo = {
            timestamp: `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}:${ss}`,
            latitude: lat != null ? lat.toFixed(7) : '—',
            longitude: lng != null ? lng.toFixed(7) : '—',
            userName: user?.name,
            customerName,
            customerCode,
            address,
          };
          setPendingWatermark({
            photoUri,
            info,
            callback: (uri) => {
              setPendingWatermark(null);
              resolve(uri);
            },
          });
        })();
      });
    },
    [user?.name, customerName, customerCode],
  );

  const WatermarkRenderer = useCallback(() => {
    if (!pendingWatermark) return null;
    return (
      <BurnWatermark
        photoUri={pendingWatermark.photoUri}
        info={pendingWatermark.info}
        onResult={pendingWatermark.callback}
      />
    );
  }, [pendingWatermark]);

  return { burnWatermark, WatermarkRenderer };
}
