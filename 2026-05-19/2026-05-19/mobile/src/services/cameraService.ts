import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { getWatermarkInfo } from './watermarkService';

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (granted) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera Permission',
    message: 'This app needs camera access to take photos.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export interface CapturedImage {
  uri: string;
  fileName: string;
  type: string;
  width: number;
  height: number;
  watermarkData?: {
    timestamp: string;
    latitude: string;
    longitude: string;
    userName?: string;
    customerName?: string;
  };
}

const CUSTOM_CAMERA_KEY = 'custom_camera_enabled';

async function isCustomCameraEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(CUSTOM_CAMERA_KEY);
  return val === 'true';
}

// Event bridge for custom camera
import { DeviceEventEmitter } from 'react-native';
import RNFS from 'react-native-fs';

// Aggressively upload every captured photo to the server in the background
// — fire-and-forget. Reason: if the user captures a photo and then taps
// Clear Storage from device settings before submitting the record, the
// local URI is wiped and the photo is lost forever. Pushing the bytes to
// the server within seconds of capture shrinks that vulnerability window
// from "until next sync cycle" to "until next network round-trip".
//
// IMPORTANT: We delay the upload by 1500 ms so the calling screen has
// time to render the preview before the JS thread starts doing
// file-system + multipart prep. On Android 5 / low-end devices the
// uploadPhoto work was visibly stuttering the post-capture UI.
function kickOffBackgroundUpload(uri: string | undefined, category = 'generic'): void {
  if (!uri) return;
  setTimeout(async () => {
    try {
      // Import lazily to avoid a circular import (syncService imports many
      // mobile-side modules; cameraService is referenced by some of them).
      const { uploadPhoto } = await import('./syncService');
      await uploadPhoto(uri, category);
    } catch (err) {
      // Upload may fail (offline, server down, etc.) — that's fine. The
      // existing record-submit path will re-upload when the user submits.
      console.log('[Camera] background upload deferred:', (err as any)?.message ?? err);
    }
  }, 1500);
}

// Target image resolution. Capped at 1024 px on the long edge — gives a
// readable photo for review on the web portal while keeping the file
// small enough that the post-capture Image component decodes in a few
// hundred ms even on Android 5 / low-RAM devices. JPEG quality at 0.6
// keeps the file under ~150 KB which is what the slow-device delay was
// most sensitive to.
const TARGET_MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.6;

/**
 * Get file size in human readable format
 */
async function getFileSize(uri: string): Promise<string> {
  try {
    const stat = await RNFS.stat(uri);
    const sizeInKB = stat.size / 1024;
    if (sizeInKB > 1024) {
      return `${(sizeInKB / 1024).toFixed(2)} MB`;
    }
    return `${sizeInKB.toFixed(1)} KB`;
  } catch {
    return 'unknown';
  }
}

export async function capturePhoto(front: boolean = false, userName?: string, customerName?: string, forceCustom: boolean = false): Promise<CapturedImage | null> {
  const hasPerm = await requestCameraPermission();
  if (!hasPerm) {
    console.warn('Camera permission denied');
    return null;
  }

  // forceCustom overrides the user-toggleable AsyncStorage flag.
  // captureSelfie() passes true to guarantee the in-app vision-camera
  // path so the front lens is reliably selected on every OEM.
  const useCustom = forceCustom || await isCustomCameraEnabled();

  // Custom camera — use vision-camera based screen
  if (useCustom) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { sub.remove(); resolve(null); }, 120000);
      const sub = DeviceEventEmitter.addListener('customCameraResult', async (data) => {
        clearTimeout(timeout);
        sub.remove();
        if (data?.uri) {
          // Resolve immediately so the caller can render the preview.
          // Watermark + filesize lookups, upload kickoff all run AFTER the
          // resolve so they never delay the visible preview.
          resolve({
            uri: data.uri,
            fileName: `photo_${Date.now()}.jpg`,
            type: 'image/jpeg',
            width: data.width ?? 0,
            height: data.height ?? 0,
          });
          getWatermarkInfo(userName, customerName).catch((e) => console.warn('[Camera] watermark info failed', e));
          getFileSize(data.uri).then(size => console.log(`[Camera] Custom camera photo: ${data.width}x${data.height}, size: ${size}`)).catch(() => {});
          kickOffBackgroundUpload(data.uri);
        } else {
          resolve(null);
        }
      });
      DeviceEventEmitter.emit('openCustomCamera', { front });
    });
  }

  // Normal camera — react-native-image-picker
  return new Promise((resolve, reject) => {
    launchCamera(
      {
        mediaType: 'photo',
        cameraType: front ? 'front' : 'back',
        quality: JPEG_QUALITY,
        maxWidth: TARGET_MAX_DIMENSION,
        maxHeight: TARGET_MAX_DIMENSION,
        saveToPhotos: false,
      },
      async (response: ImagePickerResponse) => {
        // On Galaxy M32 (SM-M325F/DS) and similar Samsung OneUI devices
        // the camera intent sometimes returns errorCode='camera_unavailable'
        // a few seconds after tap (camera app disabled, blocked by Knox,
        // background-restricted). Previously this was a silent resolve(null)
        // and the caller showed "Please capture a photo to check in" which
        // is misleading. Throw on errorCode so the caller's catch block
        // shows the real "Camera not available" message. User cancel still
        // resolves null (not an error).
        if (response.errorCode) {
          const msg = `${response.errorCode}: ${response.errorMessage ?? 'camera failed'}`;
          console.warn('[Camera] launchCamera error:', msg);
          reject(new Error(msg));
          return;
        }
        if (response.didCancel || !response.assets?.length) {
          resolve(null);
          return;
        }
        const asset = response.assets[0];
        // Resolve straight away so the caller renders the preview within
        // the same frame. Watermark + size + upload are kicked off after.
        resolve({
          uri: asset.uri ?? '',
          fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: asset.type ?? 'image/jpeg',
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        });
        getWatermarkInfo(userName, customerName).catch((e) => console.warn('[Camera] watermark info failed', e));
        if (asset.uri) {
          getFileSize(asset.uri).then(size => console.log(`[Camera] Normal camera photo: ${asset.width}x${asset.height}, size: ${size}`)).catch(() => {});
          kickOffBackgroundUpload(asset.uri);
        }
      },
    );
  });
}

export async function captureSelfie(): Promise<CapturedImage | null> {
  // ALWAYS use the in-app vision-camera (forceCustom=true) for selfies.
  // Reason: react-native-image-picker's `cameraType: 'front'` is only a
  // hint to the system camera intent — on Samsung OneUI / Galaxy M32
  // and several other OEMs the intent silently opens the BACK camera
  // instead, which broke the attendance selfie UX. CustomCameraScreen
  // explicitly selects the front lens via useCameraDevice('front'), so
  // we get a reliable selfie capture on every device. CustomCameraHost
  // mounted at the app root (App.tsx) renders the preview when this
  // emits 'openCustomCamera'.
  return capturePhoto(true, undefined, undefined, true);
}

export async function captureShelfPhoto(): Promise<CapturedImage | null> {
  return capturePhoto(false);
}

export async function pickFromGallery(): Promise<CapturedImage | null> {
  return new Promise((resolve) => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: JPEG_QUALITY,
        maxWidth: TARGET_MAX_DIMENSION,
        maxHeight: TARGET_MAX_DIMENSION,
      },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode || !response.assets?.length) {
          resolve(null);
          return;
        }
        const asset = response.assets[0];

        // Log file size for monitoring
        if (asset.uri) {
          const fileSize = await getFileSize(asset.uri);
          console.log(`[Camera] Gallery image selected: ${asset.width}x${asset.height}, size: ${fileSize}`);
        }

        resolve({
          uri: asset.uri ?? '',
          fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: asset.type ?? 'image/jpeg',
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        });
      },
    );
  });
}
