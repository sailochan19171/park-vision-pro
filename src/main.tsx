import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Load email testing utilities in development
if (import.meta.env.DEV) {
  import('./utils/testContactForm.js');
}

// Load email testing utilities in development
if (import.meta.env.DEV) {
  import('./utils/testContactForm.js');
}

createRoot(document.getElementById("root")!).render(<App />);
