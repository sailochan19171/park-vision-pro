// Contact Service - sends contact-form submissions directly to info@vayaccess.com
// via EmailJS. The destination address is hard-coded in the EmailJS template
// parameters below, so no external dashboard config is needed.

import { sendContactNotificationEmail } from './realEmailService';

export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

export const submitContactForm = async (formData: ContactFormData): Promise<ApiResponse> => {
  try {
    const sent = await sendContactNotificationEmail(formData);
    if (sent) {
      return {
        success: true,
        message:
          "Thanks! Your message has been delivered to info@vayaccess.com. We'll get back to you within 2 hours during business hours.",
      };
    }
    return {
      success: false,
      message:
        'Could not send your message right now. Please try again, or email us directly at info@vayaccess.com.',
    };
  } catch (error) {
    console.error('Contact form error:', error);
    return {
      success: false,
      message:
        'Network error. Please try again, or contact us directly at info@vayaccess.com or +91 720 724 4344.',
    };
  }
};
