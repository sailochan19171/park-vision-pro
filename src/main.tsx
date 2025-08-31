import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { enableWebPush } from './services/pushService'

// Load email testing utilities in development
if (import.meta.env.DEV) {
  import('./utils/testContactForm.js');
}

// Load email testing utilities in development
if (import.meta.env.DEV) {
  import('./utils/testContactForm.js');
}

createRoot(document.getElementById("root")!).render(<App />);

// Enable Web Push via Firebase (requires service worker and VAPID key)
const vapidKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VITE_FIREBASE_VAPID_KEY) as string | undefined;
if (vapidKey) {
  (async () => {
    try {
      const token = await enableWebPush(vapidKey);
      console.log('Web push enabled, token:', token);
    } catch (e) {
      console.warn('Web push not enabled:', e);
    }
  })();
} else {
  console.warn('Web push not enabled: VITE_VAPID_PUBLIC_KEY/VITE_FIREBASE_VAPID_KEY is missing');
}