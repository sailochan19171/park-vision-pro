import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { getCurrentPosition } from './locationService';
import { reverseGeocode } from './reverseGeocode';

// Safely import ViewShot — may not be available if native module isn't compiled
let ViewShot: any = null;
try {
  ViewShot = require('react-native-view-shot').default;
} catch {
  console.warn('[Watermark] react-native-view-shot not available — watermark burn disabled');
}

interface WatermarkInfo {
  timestamp: string;
  latitude: string;
  longitude: string;
  userName?: string;
  customerName?: string;
  customerCode?: string;
  /** Optional street/place address resolved from lat/lng. Burned into the
   *  JPEG so the photo is meaningful when viewed without GPS coords. */
  address?: string | null;
}

/**
 * Collect watermark info (GPS + timestamp). Also reverse-geocodes the GPS
 * fix to a short human-readable address so the burned watermark includes
 * the location's name (e.g. "MG Road, Bengaluru") alongside the raw
 * coordinates. The geocode lookup is capped at 4s — if it doesn't return
 * in time, the watermark proceeds with lat/lng only and the address field
 * is omitted. Either way the capture flow is never blocked.
 */
export async function getWatermarkInfo(userName?: string, customerName?: string, customerCode?: string): Promise<WatermarkInfo> {
  let lat = '—';
  let lng = '—';
  let latNum: number | null = null;
  let lngNum: number | null = null;
  try {
    const pos = await getCurrentPosition();
    if (pos) {
      lat = pos.lat.toFixed(7);
      lng = pos.lng.toFixed(7);
      latNum = pos.lat;
      lngNum = pos.lng;
    }
  } catch (e) { console.warn("[App]", e); }

  // Reverse-geocode in parallel-ish (we already have the fix; run it now).
  // reverseGeocode owns its own 8 s cap and tries multiple providers, so we
  // let it run to completion. The previous 4 s outer race was cutting off
  // legitimate Photon responses on slow networks and the burned watermark
  // came out without an Address line.
  let address: string | null = null;
  if (latNum != null && lngNum != null) {
    try {
      address = await reverseGeocode(latNum, lngNum);
    } catch { /* silent — watermark proceeds without address */ }
  }

  // Numeric DD-MM-YYYY HH:MM:SS to match the official store-check report format.
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${dd}-${mm}-${yy} ${hh}:${mi}:${ss}`;

  return { timestamp, latitude: lat, longitude: lng, userName, customerName, customerCode, address };
}

/**
 * Component that renders photo with watermark and captures it as a new image.
 * Mount this in a screen — it renders off-screen, captures, and calls onResult.
 */
interface BurnWatermarkProps {
  photoUri: string;
  info: WatermarkInfo;
  onResult: (uri: string) => void;
}

export function BurnWatermark({ photoUri, info, onResult }: BurnWatermarkProps) {
  const ref = useRef<any>(null);
  const [ready, setReady] = useState(false);
  // Detect the source photo's actual size so we can render the watermark
  // container at the same aspect ratio. Previously the container was a
  // fixed 640x640 square with resizeMode="cover", which permanently
  // CROPPED the top + bottom off every portrait photo (and the left +
  // right off every landscape). The captured JPEG written to the
  // backend was therefore a square crop of what the user actually shot.
  // Field reports: "Photo is trimmed when I tap OK" — that was the snapshot
  // being made of a cropped offscreen render.
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 640, h: 640 });

  useEffect(() => {
    if (!photoUri) return;
    Image.getSize(
      photoUri,
      (w, h) => {
        // Cap the long edge at 1600 so the snapshot stays cheap on
        // low-memory phones while keeping the burned-in overlay text
        // crisp when a TL views the photo at 100% in a backend report.
        // 1280 was leaving the stamp slightly fuzzy on bigger monitors.
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(w, h));
        setDims({ w: Math.round(w * scale), h: Math.round(h * scale) });
      },
      () => { /* fall back to default square if getSize fails */ },
    );
  }, [photoUri]);

  useEffect(() => {
    // If ViewShot not available, return original photo immediately
    if (!ViewShot) {
      onResult(photoUri);
      return;
    }
    if (!ready) return;
    const t = setTimeout(async () => {
      try {
        const uri = await ref.current?.capture?.();
        if (uri) {
          onResult(uri);
        } else {
          onResult(photoUri);
        }
      } catch {
        onResult(photoUri);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [ready]);

  // If ViewShot not available, render nothing
  if (!ViewShot) return null;

  return (
    <View style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0 }}>
      <ViewShot ref={ref} options={{ format: 'jpg', quality: 0.85 }}>
        <View style={{ width: dims.w, height: dims.h }}>
          <Image
            source={{ uri: photoUri }}
            style={{ width: dims.w, height: dims.h }}
            // contain (not cover) so the snapshot preserves the full
            // captured frame. The container already matches the source
            // aspect ratio so there's no letterbox in practice — this
            // just protects against any future container-vs-source mismatch.
            resizeMode="contain"
            onLoad={() => setReady(true)}
          />
          <View style={ws.bar}>
            {info.customerCode && <Text style={ws.t}>[{info.customerCode}]</Text>}
            {info.customerName && <Text style={ws.t}>{info.customerName}</Text>}
            <Text style={ws.t}>Date: {info.timestamp}</Text>
            {info.latitude !== '—' && (
              <>
                <Text style={ws.t}>Latitude: {info.latitude}</Text>
                <Text style={ws.t}>Longitude: {info.longitude}</Text>
              </>
            )}
            {!!info.address && (
              <Text style={ws.tAddress} numberOfLines={2}>Address: {info.address}</Text>
            )}
            {info.userName && <Text style={ws.t}>User: {info.userName}</Text>}
          </View>
        </View>
      </ViewShot>
    </View>
  );
}

const ws = StyleSheet.create({
  bar: {
    // Field reps + TLs were reporting they couldn't read the stamped
    // lat/lng/address on the web report viewer, so we now ALSO carry a
    // translucent dark band behind the text. The text glow remains so
    // the overlay still reads where the band is most transparent.
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  t: {
    // Big and bold so the overlay is legible whether the rep is
    // checking the local preview on a 5" Android or a TL is opening
    // the JPG in a backend report on a 14" laptop. Previous 15 px
    // was hard to read at 50 % thumbnail zoom on the portal.
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: 0.3,
    // Heavy centered glow simulates a black outline around each glyph
    // so the text still reads where the dark band fades against a
    // bright background (sky, white shirt, etc).
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    ...Platform.select({
      android: { fontFamily: 'monospace' },
      ios: { fontFamily: 'Courier' },
    }),
  },
  tAddress: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    marginTop: 6,
    letterSpacing: 0.3,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    ...Platform.select({
      android: { fontFamily: 'monospace' },
      ios: { fontFamily: 'Courier' },
    }),
  },
});

export { WatermarkInfo };
