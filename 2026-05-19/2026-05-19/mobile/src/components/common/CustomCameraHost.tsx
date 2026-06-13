import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, Modal, StatusBar } from 'react-native';
import CustomCameraScreen from '../../screens/CustomCameraScreen';

// Host that bridges cameraService's `openCustomCamera` / `customCameraResult`
// events to the actual <CustomCameraScreen /> overlay. Mounted once at the
// app root. Without this, cameraService's "useCustom" branch would emit
// the open event and time out 120 s later because nothing renders the
// camera UI. With this in place, calls like `captureSelfie()` that force
// the custom path reliably get a front-camera preview on every device,
// including Samsung OneUI / Galaxy M32 where the system camera intent
// silently falls back to the back camera.
//
// The camera is rendered inside a native <Modal> so it sits on the same
// overlay layer as the screens that opened it (StartDay's Attendance
// bottom sheet, POCapture's form sheet, etc.). Previously CustomCamera
// was a plain absolute-positioned View, which RN renders BELOW any
// open native Modal — so the user saw the camera and the attendance
// sheet at the same time. Wrapping in Modal fixes the z-ordering.
export default function CustomCameraHost() {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openCustomCamera', (payload: { front?: boolean } | undefined) => {
      setFront(!!payload?.front);
      setOpen(true);
    });
    return () => sub.remove();
  }, []);

  const handleCapture = (uri: string, width: number, height: number) => {
    setOpen(false);
    DeviceEventEmitter.emit('customCameraResult', { uri, width, height });
  };

  const handleCancel = () => {
    setOpen(false);
    // Emit an empty result so the awaiting Promise inside cameraService
    // resolves null rather than waiting the full 120 s timeout.
    DeviceEventEmitter.emit('customCameraResult', {});
  };

  return (
    <Modal
      visible={open}
      onRequestClose={handleCancel}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
      // presentationStyle 'fullScreen' on iOS ensures no shrunken
      // sheet appearance; 'transparent={false}' keeps the camera
      // fully opaque so nothing behind it shows through.
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <CustomCameraScreen
        visible={open}
        front={front}
        onCapture={handleCapture}
        onCancel={handleCancel}
      />
    </Modal>
  );
}
