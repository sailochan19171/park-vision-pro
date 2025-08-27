// Backend Email Service - Real-time Live Email Automation
// This service connects to your Node.js backend for automated email processing

export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

// Backend API configuration
const RAW_API_BASE = (import.meta.env as any).VITE_API_BASE_URL || (import.meta.env as any).VITE_API_URL || 'http://localhost:3001';
const API_BASE_URL = RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE.replace(/\/$/, '')}/api`;

// Submit contact form with live email automation
export const submitContactForm = async (formData: ContactFormData): Promise<ApiResponse> => {
  try {
    console.log('🎯 Submitting contact form to backend API...', {
      name: formData.name,
      email: formData.email,
      messageLength: formData.message.length
    });
    
    const response = await fetch(`${API_BASE_URL}/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    const result: ApiResponse = await response.json();
    
    console.log('✅ Backend API response:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Backend API error:', error);
    
    // Return user-friendly error message
    return {
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    };
  }
};

// Test backend connection
export const testBackendConnection = async (): Promise<boolean> => {
  try {
    console.log('🔍 Testing backend connection...');
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend is healthy:', data);
      return true;
    } else {
      console.error('❌ Backend health check failed:', response.status);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Backend connection error:', error);
    return false;
  }
};

// Send test email (for development/testing)
export const sendTestEmail = async (): Promise<ApiResponse> => {
  try {
    console.log('🧪 Sending test email...');
    
    const response = await fetch(`${API_BASE_URL}/test-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    const result: ApiResponse = await response.json();
    console.log('✅ Test email result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    return {
      success: false,
      message: `Test email failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

// Newsletter subscribe via backend (avoids Firestore CORS, sends emails)
export const subscribeToNewsletter = async (email: string, source: string = 'footer'): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, source }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Newsletter subscribe error:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to subscribe' };
  }
};

// Email validation helper
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Form data validation
export const validateContactForm = (formData: ContactFormData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!formData.name.trim()) {
    errors.push('Name is required');
  }
  
  if (!formData.email.trim()) {
    errors.push('Email is required');
  } else if (!validateEmail(formData.email)) {
    errors.push('Please enter a valid email address');
  }
  
  if (!formData.message.trim()) {
    errors.push('Message is required');
  } else if (formData.message.trim().length < 10) {
    errors.push('Message must be at least 10 characters long');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Environment configuration helper
export const getEmailServiceConfig = () => {
  return {
    apiUrl: API_BASE_URL,
    environment: import.meta.env.MODE || 'development',
    isProduction: import.meta.env.PROD,
  };
};

console.log('📧 VayAccess Email Service Configuration:', getEmailServiceConfig());