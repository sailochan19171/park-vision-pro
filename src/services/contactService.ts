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

// Backend API configuration (same resolution logic)
const RAW_API_BASE = (import.meta.env as any).VITE_API_BASE_URL || (import.meta.env as any).VITE_API_URL || 'http://localhost:3001';
const API_BASE_URL = RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE.replace(/\/$/, '')}/api`;

// Submit contact form with live email automation
export const submitContactForm = async (formData: ContactFormData): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/contact`, {
      method: 'POST',
      headers: getDefaultHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const result: ApiResponse = await response.json();
    return result;

  } catch (error) {
    console.error('❌ Contact form API error:', error);
    return {
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    };
  }
};