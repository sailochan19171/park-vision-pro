// Real Email Service Integration using EmailJS
// This allows sending real emails directly from the frontend

import emailjs from '@emailjs/browser';

export interface EmailJSConfig {
  serviceID: string;
  templateID: string;
  userID: string;
}

// EmailJS configuration for real email sending
export const EMAIL_JS_CONFIG: EmailJSConfig = {
  serviceID: 'service_yvf3f9e', 
  templateID: 'template_wg7m9ed', 
  userID: '3BzCzdoKZbyqzub2D' 
};

// Real email sending function using EmailJS
export const sendRealSubscriptionEmail = async (subscriberEmail: string): Promise<boolean> => {
  try {
    console.log('📧 Sending real email via EmailJS...');
    console.log('From: info@vayaccess.com');
    console.log('To:', subscriberEmail);
    console.log('Service ID:', EMAIL_JS_CONFIG.serviceID);
    console.log('Template ID:', EMAIL_JS_CONFIG.templateID);
    
    const templateParams = {
      to_email: subscriberEmail,
      from_email: 'info@vayaccess.com',
      from_name: 'VayAccess Team',
      subject: 'Welcome to VayAccess Newsletter!',
      message: `Welcome to VayAccess Newsletter!
        
Thank you for subscribing. You'll now receive:
• Latest parking technology insights
• Product updates and announcements
• Industry best practices
• Exclusive offers

Visit our website: https://vayaccess.com

Best regards,
VayAccess Team
info@vayaccess.com

---
You can unsubscribe anytime by replying to this email.`
    };

    const result = await emailjs.send(
      EMAIL_JS_CONFIG.serviceID,
      EMAIL_JS_CONFIG.templateID,
      templateParams,
      EMAIL_JS_CONFIG.userID
    );

    console.log('✅ Real email sent successfully via EmailJS:', result);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send real email via EmailJS:', error);
    return false;
  }
};

// Alternative: Form submission to external service
export const sendViaFormspree = async (subscriberEmail: string): Promise<boolean> => {
  try {
    const response = await fetch('https://formspree.io/f/YOUR_FORM_ID', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: subscriberEmail,
        subject: 'Newsletter Subscription',
        message: `New newsletter subscription from: ${subscriberEmail}`,
        _replyto: subscriberEmail,
        _cc: 'info@vayaccess.com'
      }),
    });

    if (response.ok) {
      console.log('✅ Subscription sent via Formspree');
      return true;
    } else {
      throw new Error('Formspree submission failed');
    }
  } catch (error) {
    console.error('❌ Formspree error:', error);
    return false;
  }
};

// Newsletter subscription with real email sending
export const subscribeToNewsletterReal = async (email: string): Promise<boolean> => {
  try {
    console.log('🎯 Starting real newsletter subscription for:', email);
    
    // Send welcome email via EmailJS
    const emailSent = await sendRealSubscriptionEmail(email);
    
    if (!emailSent) {
      throw new Error('Failed to send welcome email');
    }
    
    console.log('✅ Newsletter subscription completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Newsletter subscription failed:', error);
    throw error;
  }
};

// Contact form interface
export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

// Send notification to info@vayaccess.com about new contact form submission
export const sendContactNotificationEmail = async (formData: ContactFormData): Promise<boolean> => {
  try {
    console.log('📧 Sending contact form notification to info@vayaccess.com...');
    
    const templateParams = {
      to_email: 'info@vayaccess.com',
      from_email: formData.email,
      from_name: formData.name,
      subject: `New Contact Form Submission from ${formData.name}`,
      message: `NEW CONTACT FORM SUBMISSION
      
📝 Customer Details:
• Name: ${formData.name}
• Email: ${formData.email}
• Submission Time: ${new Date().toLocaleString()}

💬 Message:
${formData.message}

---
This is an automated notification from VayAccess website contact form.
Please respond to this inquiry within 2 hours during business hours.

Customer Email: ${formData.email}
Reply directly to this email to respond to the customer.`,
      reply_to: formData.email,
      customer_email: formData.email,
      customer_name: formData.name,
      customer_message: formData.message
    };

    const result = await emailjs.send(
      EMAIL_JS_CONFIG.serviceID,
      EMAIL_JS_CONFIG.templateID,
      templateParams,
      EMAIL_JS_CONFIG.userID
    );

    console.log('✅ Contact notification sent successfully:', result);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send contact notification:', error);
    return false;
  }
};

// Send auto-reply to customer confirming receipt of their message
export const sendContactAutoReply = async (formData: ContactFormData): Promise<boolean> => {
  try {
    console.log('📧 Sending auto-reply to customer:', formData.email);
    
    const templateParams = {
      to_email: formData.email,
      from_email: 'info@vayaccess.com',
      from_name: 'VayAccess Support Team',
      subject: 'Thank you for contacting VayAccess - We\'ll respond within 2 hours',
      message: `Dear ${formData.name},

Thank you for contacting VayAccess regarding your parking solution requirements.

📧 YOUR MESSAGE RECEIVED:
"${formData.message}"

⏰ RESPONSE TIMELINE:
Our technical specialists have received your inquiry and will review your requirements. You can expect a detailed response with:
• Product recommendations
• Pricing estimates  
• Implementation timelines
• Next steps

We'll respond within 2 hours during business hours (Mon-Fri 9AM-6PM IST).

📞 IMMEDIATE ASSISTANCE:
For urgent inquiries, please contact us directly:
• Phone: +91 70137 99462
• WhatsApp: +91 70137 99462
• Email: info@vayaccess.com

🌐 LEARN MORE:
Visit our website: https://vayaccess.com
View our products: https://vayaccess.com/products

Best regards,
VayAccess Support Team
info@vayaccess.com

---
This is an automated confirmation. Please do not reply to this email.
For further questions, contact us at info@vayaccess.com`,
      customer_name: formData.name,
      customer_email: formData.email
    };

    const result = await emailjs.send(
      EMAIL_JS_CONFIG.serviceID,
      EMAIL_JS_CONFIG.templateID,
      templateParams,
      EMAIL_JS_CONFIG.userID
    );

    console.log('✅ Auto-reply sent successfully:', result);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send auto-reply:', error);
    return false;
  }
};

// Complete contact form submission process
export const submitContactForm = async (formData: ContactFormData): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('🎯 Processing contact form submission via Formspree...', formData);

    // Use existing Formspree form (configured in project)
    const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mzzvkeqy';
    const now = new Date();
    const humanTime = now.toLocaleString();

    // Build professional confirmation-style body (sent to info@vayaccess.com)
    const subject = `Message Received Successfully - ${formData.name}`;
    const emailBody = `VayAccess Support Team <info@vayaccess.com>\n${humanTime}\nto ${formData.name}\n\nMessage Received Successfully\nThank you for contacting VayAccess\n\nDear ${formData.name},\nThank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.\n\nYour Message Summary\n"${formData.message}"\n\nWhat Happens Next?\nQuick Response: Our technical specialists will respond within 2 hours during business hours\nDetailed Analysis: We'll review your requirements and provide customized recommendations\nComplete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines\n\nNeed Immediate Assistance?\n+91 720 724 4344  •  WhatsApp  •  Email\n\nVisit Our Website\nBusiness Hours: Monday - Friday: 9:00 AM - 6:00 PM IST\n\nVayAccess Parking Solutions\nPlot No. 26, Road No.1, West Gandhi Nagar\nRampally X Road, Nagaram, Keesara (M)\nHyderabad - 500083, TS, India\n\nThis is an automated confirmation. Please save this email for your records.`;

    const payload = {
      // Formspree will forward the submission to the account's email (info@vayaccess.com registered)
      // We also include structured fields for clarity
      email: 'info@vayaccess.com',
      name: 'VayAccess Support Team',
      subject,
      message: emailBody,
      customer_name: formData.name,
      customer_email: formData.email,
      customer_message: formData.message,
      submitted_at: now.toISOString(),
      _replyto: formData.email,
      source: 'website-contact-form'
    };

    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Contact form sent via Formspree successfully');
      return {
        success: true,
        message: 'Thank you for your inquiry! We have received your message. Our team will respond within 2 hours during business hours.'
      };
    } else {
      const errorText = await response.text();
      throw new Error(`Formspree submission failed: ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Contact form submission failed:', error);
    return {
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    };
  }
};

// Chatbot conversation interface
export interface ChatbotConversation {
  userQuestion: string;
  botResponse: string;
  timestamp: Date;
  sessionId?: string;
}

// Send chatbot conversation via Formspree (Professional, No Branding)
export const sendChatbotConversationFormspree = async (conversation: ChatbotConversation): Promise<boolean> => {
  try {
    console.log('🤖 Sending chatbot conversation to info@vayaccess.com via Formspree...');
    
    // Using a demo Formspree endpoint - replace with your actual form ID
    const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xanygowk'; // Demo form ID - replace with your actual form ID
    
    const emailBody = `🤖 NEW CHATBOT CONVERSATION

📊 Session Details:
• Timestamp: ${conversation.timestamp.toLocaleString()}
• Session ID: ${conversation.sessionId || 'Anonymous'}
• Source: Website Chatbot (VayBot)

❓ USER QUESTION:
"${conversation.userQuestion}"

🤖 BOT RESPONSE:
"${conversation.botResponse}"

📈 ANALYTICS:
• Question Length: ${conversation.userQuestion.length} characters
• Response Length: ${conversation.botResponse.length} characters
• Category: ${getCategoryFromQuestion(conversation.userQuestion)}

---
This is an automated notification from VayBot Assistant.
All chatbot conversations are logged for quality improvement and customer service.`;

    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: 'info@vayaccess.com',
        subject: `🤖 New Chatbot Conversation - ${conversation.timestamp.toLocaleString()}`,
        message: emailBody,
        user_question: conversation.userQuestion,
        bot_response: conversation.botResponse,
        session_id: conversation.sessionId || 'Anonymous',
        timestamp: conversation.timestamp.toISOString(),
        category: getCategoryFromQuestion(conversation.userQuestion)
      }),
    });

    if (response.ok) {
      console.log('✅ Chatbot conversation sent via Formspree successfully');
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`Formspree submission failed: ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to send chatbot conversation via Formspree:', error);
    return false;
  }
};

// Original EmailJS function (kept for reference - but has branding)
export const sendChatbotConversationEmail = async (conversation: ChatbotConversation): Promise<boolean> => {
  try {
    console.log('🤖 Sending chatbot conversation to info@vayaccess.com...');
    
    const templateParams = {
      to_email: 'info@vayaccess.com',
      from_email: 'chatbot@vayaccess.com',
      from_name: 'VayBot Assistant',
      subject: `🤖 New Chatbot Conversation - ${new Date().toLocaleString()}`,
      message: `🤖 NEW CHATBOT CONVERSATION
      
📊 Session Details:
• Timestamp: ${conversation.timestamp.toLocaleString()}
• Session ID: ${conversation.sessionId || 'Anonymous'}
• Source: Website Chatbot (VayBot)

❓ USER QUESTION:
"${conversation.userQuestion}"

🤖 BOT RESPONSE:
"${conversation.botResponse}"

📈 ANALYTICS:
• Question Length: ${conversation.userQuestion.length} characters
• Response Length: ${conversation.botResponse.length} characters
• Category: ${getCategoryFromQuestion(conversation.userQuestion)}

---
This is an automated notification from VayBot Assistant.
All chatbot conversations are logged for quality improvement and customer service.

Monitor chatbot performance: Dashboard > Chatbot Analytics
Review conversation quality: Dashboard > AI Training`,
      user_question: conversation.userQuestion,
      bot_response: conversation.botResponse,
      timestamp: conversation.timestamp.toISOString(),
      session_id: conversation.sessionId || 'Anonymous'
    };

    const result = await emailjs.send(
      EMAIL_JS_CONFIG.serviceID,
      EMAIL_JS_CONFIG.templateID,
      templateParams,
      EMAIL_JS_CONFIG.userID
    );

    console.log('✅ Chatbot conversation sent successfully:', result);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send chatbot conversation:', error);
    return false;
  }
};

// Helper function to categorize questions
const getCategoryFromQuestion = (question: string): string => {
  const lowerQuestion = question.toLowerCase();
  
  if (lowerQuestion.includes('price') || lowerQuestion.includes('cost') || lowerQuestion.includes('pricing')) {
    return 'Pricing Inquiry';
  } else if (lowerQuestion.includes('available') || lowerQuestion.includes('slots') || lowerQuestion.includes('parking')) {
    return 'Availability Check';
  } else if (lowerQuestion.includes('access') || lowerQuestion.includes('control') || lowerQuestion.includes('turnstile')) {
    return 'Access Control';
  } else if (lowerQuestion.includes('barrier') || lowerQuestion.includes('gate')) {
    return 'Barrier Gates';
  } else if (lowerQuestion.includes('install') || lowerQuestion.includes('setup') || lowerQuestion.includes('service')) {
    return 'Installation & Services';
  } else if (lowerQuestion.includes('software') || lowerQuestion.includes('app') || lowerQuestion.includes('mobile')) {
    return 'Software & Apps';
  } else {
    return 'General Inquiry';
  }
};