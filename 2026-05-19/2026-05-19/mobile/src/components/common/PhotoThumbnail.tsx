import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet,
  Dimensions, Platform, StatusBar,
} from 'react-native';
import { API_BASE_URL } from '../../config';

const { width: SW, height: SH } = Dimensions.get('window');

// Resolve any photo URI to something <Image> can actually load:
//   file://...           → as-is (fresh local capture)
//   content://...        → as-is (Android scoped storage)
//   http(s)://...        → as-is (already absolute server URL)
//   /public/...          → prepend API_BASE_URL (server-relative path
//                          written back by uploadPhoto / pull-all)
//   anything else        → as-is, let <Image> error and show the
//                          "Photo not available" placeholder.
//
// Reason: after sync, planogram_executions.post_image is rewritten
// from a local file:// to the server's /public/... path. Without this
// resolver every re-visit showed a blank thumbnail because <Image>
// can't load a relative URL.
function resolveUri(uri: string | null | undefined): string {
  if (!uri) return '';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (uri.startsWith('file://') || uri.startsWith('content://')) return uri;
  if (uri.startsWith('/')) return `${API_BASE_URL}${uri}`;
  return uri;
}

export interface PhotoMeta {
  uri: string;
  timestamp?: number;   // Date.now() when captured
  latitude?: number | null;
  longitude?: number | null;
  customerCode?: string;
  customerName?: string;
  /** Optional pre-resolved street address. If absent but lat/lng are set,
   *  the preview will reverse-geocode lazily and cache the result. */
  address?: string | null;
}

interface Props {
  photo: PhotoMeta;
  /** Thumbnail size (default 80x80) */
  size?: number;
  /** If provided, shows retake button in preview */
  onRetake?: () => void;
  /** Optional: remove photo */
  onRemove?: () => void;
  /** Style overrides for the container */
  style?: any;
  /** When true, renders a small black trash button beside the thumbnail so
   *  the delete affordance is always visible without opening the preview.
   *  Set on form screens (POCapture, Competitor, etc.) that show a single
   *  photo. Off by default so list-screens (OSOI, Planogram) that already
   *  have their own per-row delete column don't end up with two icons. */
  showDeleteBeside?: boolean;
}

function formatStamp(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yy} ${hh}:${mi}:${ss}`;
}

function formatCoord(val?: number | null): string {
  if (val == null) return '--';
  return val.toFixed(7);
}

export default function PhotoThumbnail({ photo, size = 80, onRetake, onRemove, style, showDeleteBeside }: Props) {
  const [preview, setPreview] = useState(false);
  // Track whether the underlying JPEG failed to load. Happens when the
  // saved file:// URI points at a cached file that Android wiped, or
  // when sync hasn't yet replaced the local URI with the server URL.
  // Without this, the preview just shows a black rectangle with the
  // duplicate stamp panel underneath — confusing for the user.
  const [imgFailed, setImgFailed] = useState(false);

  const stampDate = formatStamp(photo.timestamp);
  const stampLat = formatCoord(photo.latitude);
  const stampLng = formatCoord(photo.longitude);
  const hasStamp = !!(photo.timestamp || photo.latitude || photo.longitude);

  // Resolved once and reused so the thumbnail + preview render the same
  // image, and relative server paths (/public/...) get an API_BASE_URL
  // prefix so <Image> can fetch them after a re-visit.
  const resolvedUri = resolveUri(photo.uri);

  const removeFn = onRemove ?? onRetake;
  const showSideDelete = !!(showDeleteBeside && removeFn);

  const thumb = (
    <TouchableOpacity
      style={[st.thumbWrap, { width: size, height: size }, style]}
      onPress={() => { setImgFailed(false); setPreview(true); }}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: resolvedUri }}
        style={st.thumbImg}
        resizeMode="cover"
        onError={() => setImgFailed(true)}
      />
      {hasStamp && (
        <View style={st.stampOverlay}>
          {!!stampDate && <Text style={st.stampText} numberOfLines={1}>{stampDate}</Text>}
          <Text style={st.stampText} numberOfLines={1}>
            {stampLat},{stampLng}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {showSideDelete ? (
        <View style={st.thumbRow}>
          {thumb}
          <TouchableOpacity
            style={st.sideDeleteBtn}
            onPress={() => removeFn?.()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={st.sideDeleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      ) : (
        thumb
      )}

      {/* Full-screen preview modal */}
      <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}>
        <View style={st.previewBg}>
          <StatusBar backgroundColor="#000" barStyle="light-content" />

          {/* Close button */}
          <TouchableOpacity style={st.closeBtn} onPress={() => setPreview(false)} activeOpacity={0.7}>
            <Text style={st.closeBtnText}>✕</Text>
          </TouchableOpacity>

          {/* Full image. If load fails (dangling file:// URI after an
              Android cache wipe, or server URL hasn't been written back
              yet) show a placeholder so the user knows the photo can't
              be shown, instead of a black rectangle. */}
          {imgFailed ? (
            <View style={st.failBox}>
              <Text style={st.failIcon}>📷</Text>
              <Text style={st.failTitle}>Photo not available</Text>
              <Text style={st.failSubtitle}>
                The local file has been cleared and the server URL is not yet synced.
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: resolvedUri }}
              style={st.previewImg}
              resizeMode="contain"
              onError={() => setImgFailed(true)}
            />
          )}
          {/* No metadata overlay panel — timestamp / lat / lng / customer
              are already burned into the JPEG by BurnWatermark on capture.
              Showing them again here was duplicating the info AND making
              a failed image look weird ("black photo with text floating
              below it"). */}

          {/* Bottom action buttons — Retake removed per UX rework. To
              re-capture, the user taps the Delete button (which calls
              onRemove or onRetake — both close the preview and let the
              parent screen reopen the camera). */}
          <View style={st.previewActions}>
            {(onRemove || onRetake) && (
              <TouchableOpacity
                style={st.actionBtn}
                onPress={() => {
                  setPreview(false);
                  if (onRemove) onRemove();
                  else if (onRetake) onRetake();
                }}
                activeOpacity={0.7}
              >
                <Text style={st.actionBtnText}>🗑  Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // Layout used when showDeleteBeside is enabled
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideDeleteBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  sideDeleteIcon: { fontSize: 16, color: '#FFFFFF' },
  // Thumbnail
  thumbWrap: {
    borderRadius: 8, overflow: 'hidden', position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  thumbImg: { width: '100%', height: '100%' },
  stampOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 4, paddingVertical: 2,
  },
  stampText: {
    color: '#FFFFFF', fontSize: 7, fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Full-screen preview
  previewBg: {
    flex: 1, backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 54 : 16, right: 16,
    zIndex: 20, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#FFF', fontSize: 20, fontWeight: '600' },
  previewImg: { width: SW, height: SH * 0.7 },
  // Placeholder shown when the JPEG fails to load (cached file gone or
  // server URL not yet synced). Replaces the previous black-rectangle +
  // floating-metadata-panel UX that looked like a bug.
  failBox: {
    width: SW * 0.85, padding: 24, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  failIcon: { fontSize: 48, marginBottom: 12 },
  failTitle: {
    color: '#FFFFFF', fontSize: 17, fontWeight: '700',
    marginBottom: 6, textAlign: 'center',
  },
  failSubtitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500',
    textAlign: 'center', lineHeight: 18,
  },
  previewActions: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'center', gap: 16,
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  retakeBtn: { backgroundColor: 'rgba(26,63,160,0.8)', borderColor: '#4A7BF7' },
  retakeBtnText: { color: '#FFF' },
});
