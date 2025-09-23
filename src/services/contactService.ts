// Contact Service - separates contact form logic from newsletter
import { getDefaultHeaders } from './http';

export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

// Backend API configuration (aligned with newsletterBackend resolution)
const HOST = (typeof window !== 'undefined' && window.location && window.location.hostname)
  ? window.location.hostname
  : '';
const PROD_DEFAULT = (HOST === 'vayaccess.com' || HOST === 'www.vayaccess.com' || HOST.endsWith('web.app'))
  ? '' // use relative /api on Firebase Hosting and prod domains
  : '';
const RAW_API_BASE = (import.meta.env as any).VITE_API_BASE_URL
  || (import.meta.env as any).VITE_API_URL
  || PROD_DEFAULT
  || '';
const API_BASE_URL = RAW_API_BASE
  ? (RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE.replace(/\/$/, '')}/api`)
  : '/api';

// Submit contact form via Formspree (client-side)
export const submitContactForm = async (formData: ContactFormData): Promise<ApiResponse> => {
  try {
    const endpoint = (import.meta.env as any).VITE_FORMSPREE_ENDPOINT || 'https://formspree.io/f/meorqoaq';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getDefaultHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
      body: JSON.stringify({
        _subject: 'New Contact Message from VayAccess',
        _replyto: formData.email,
        form: 'contact',
        ...formData,
      }),
    });

    // Formspree returns JSON like { ok: true } on success
    const json = await response.json().catch(() => ({} as any));
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }

    return { success: true, message: 'Thanks! Your message has been sent.' };
  } catch (error) {
    console.error(' Contact form (Formspree) error:', error);
    return {
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    };
  }
};
