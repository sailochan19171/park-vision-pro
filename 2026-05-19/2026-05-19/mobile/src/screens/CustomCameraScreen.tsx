import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Dimensions, Platform, ActivityIndicator, Image,
} from 'react-native';
import {
  Camera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';

// Target resolution for photos - same as react-native-image-picker settings
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 1280;

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  front?: boolean;
  onCapture: (uri: string, width: number, height: number) => void;
  onCancel: () => void;
}

function formatTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

export default function CustomCameraScreen({ visible, front = false, onCapture, onCancel }: Props) {
  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(front ? 'front' : 'back');
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<{ path: string; width: number; height: number } | null>(null);
  const [timestamp, setTimestamp] = useState(formatTimestamp());
  const [flash, setFlash] = useState<'off' | 'on'>('off');

  // Select camera format that matches our target resolution
  // This reduces image size significantly compared to full resolution
  const format = useMemo(() => {
    if (!device) return undefined;

    // Find a format with photo resolution close to our target
    // Sort by how close the resolution is to our target
    const formats = device.formats.sort((a, b) => {
      const aDiff = Math.abs(a.photoWidth - TARGET_WIDTH) + Math.abs(a.photoHeight - TARGET_HEIGHT);
      const bDiff = Math.abs(b.photoWidth - TARGET_WIDTH) + Math.abs(b.photoHeight - TARGET_HEIGHT);
      return aDiff - bDiff;
    });

    // Pick the best match (closest to target resolution)
    // If none close to target, pick one that's not too high resolution
    const bestFormat = formats.find(f =>
      f.photoWidth <= TARGET_WIDTH * 1.5 && f.photoHeight <= TARGET_HEIGHT * 1.5
    ) || formats[0];

    console.log(`[CustomCamera] Selected format: ${bestFormat?.photoWidth}x${bestFormat?.photoHeight}`);
    return bestFormat;
  }, [device]);

  useEffect(() => {
    if (visible && !hasPermission) requestPermission();
  }, [visible, hasPermission]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => setTimestamp(formatTimestamp()), 1000);
    return () => clearInterval(interval);
  }, [visible]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash });
      setPreview({ path: photo.path, width: photo.width, height: photo.height });
    } catch (err) {
      console.warn('[CustomCamera] Capture error:', err);
    }
    setCapturing(false);
  }, [flash, capturing]);

  const handleAccept = () => {
    if (!preview) return;
    const uri = Platform.OS === 'android' ? `file://${preview.path}` : preview.path;
    // Use actual format dimensions for consistency, falling back to preview dimensions
    const actualWidth = format?.photoWidth || preview.width;
    const actualHeight = format?.photoHeight || preview.height;
    onCapture(uri, actualWidth, actualHeight);
    setPreview(null);
  };

  const handleRetake = () => setPreview(null);

  if (!visible) return null;

  if (!device) {
    return (
      <View style={s.container}>
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        <View style={s.errorBox}>
          <Icon name="camera-outline" size={48} color="#666" />
          <Text style={s.errorText}>Camera not available</Text>
          <TouchableOpacity style={s.errorBtn} onPress={onCancel}>
            <Text style={s.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Preview mode
  if (preview) {
    const previewUri = Platform.OS === 'android' ? `file://${preview.path}` : preview.path;
    return (
      <View style={s.container}>
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        {/* `contain` so the full captured frame is visible. `cover` was
            cropping the top + bottom off portrait photos when the
            preview container's aspect ratio didn't match the camera. */}
        <Image source={{ uri: previewUri }} style={s.previewImage} resizeMode="contain" />

        <View style={s.stampOverlay}>
          <Text style={s.stampText}>{timestamp}</Text>
          <Text style={s.stampText}>Custom Camera</Text>
        </View>

        <View style={s.previewButtons}>
          <TouchableOpacity style={s.previewBtn} onPress={handleRetake}>
            <Icon name="close-circle" size={56} color="#EF4444" />
            <Text style={s.btnLabel}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.previewBtn} onPress={handleAccept}>
            <Icon name="checkmark-circle" size={56} color="#22C55E" />
            <Text style={s.btnLabel}>Use Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera mode
  return (
    <View style={s.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      <Camera
        ref={cameraRef}
        style={s.camera}
        device={device}
        format={format}
        isActive={visible}
        photo={true}
        enableZoomGesture={true}
      />

      {/* Live timestamp overlay */}
      <View style={s.liveOverlay}>
        <View style={s.liveStamp}>
          <Text style={s.liveStampText}>{timestamp}</Text>
          <Text style={s.liveStampText}>Custom Camera</Text>
        </View>
      </View>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={onCancel} style={s.topBtn}>
          <Icon name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')} style={s.topBtn}>
          <Icon name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Capture button */}
      <View style={s.bottomBar}>
        <View style={s.captureOuter}>
          <TouchableOpacity style={s.captureInner} onPress={handleCapture} disabled={capturing} activeOpacity={0.7}>
            {capturing ? <ActivityIndicator color="#1a3a8f" size="small" /> : null}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 999 },
  camera: { flex: 1 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { color: '#FFF', fontSize: 18 },
  errorBtn: { backgroundColor: '#1a3a8f', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  errorBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  liveOverlay: { position: 'absolute', bottom: 120, right: 16 },
  liveStamp: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  liveStampText: { color: '#FFA500', fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  topBar: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  topBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 24, left: 0, right: 0, alignItems: 'center' },
  captureOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  previewImage: { flex: 1 },
  stampOverlay: { position: 'absolute', bottom: 120, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stampText: { color: '#FFA500', fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  previewButtons: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 24, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 60 },
  previewBtn: { alignItems: 'center', gap: 4 },
  btnLabel: { color: '#FFF', fontSize: 13, fontWeight: '600' },
});
