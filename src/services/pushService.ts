// Web Push via Firebase Cloud Messaging (FCM)
// - Requests permission
// - Gets token using your VAPID key
// - Stores token in Firestore

import { getMessagingIfSupported } from "./firebase";
import { getToken, onMessage } from "firebase/messaging";
import { registerPushToken } from "./newsletterBackend";

export async function enableWebPush(vapidPublicKey: string, email?: string) {
  // Register service worker (required for FCM on web)
  if ('serviceWorker' in navigator) {
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    // Ask for permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    const messaging = await getMessagingIfSupported();
    if (!messaging) throw new Error('FCM not supported in this browser');

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: vapidPublicKey,
      serviceWorkerRegistration: swReg,
    });

    if (!token) throw new Error('Failed to obtain FCM token');

    // Save token to backend (MongoDB)
    try {
      await registerPushToken(token, email);
    } catch (err) {
      console.warn('Failed to persist push token to backend (continuing):', err);
    }
    return token;
  }
  throw new Error('Service Worker not supported');
}

// Foreground message handler (optional UI hook)
export function listenForForegroundMessages(callback: (payload: any) => void) {
  getMessagingIfSupported().then((messaging) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => callback(payload));
  });
}